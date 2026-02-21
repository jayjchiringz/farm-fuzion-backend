/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable max-len */
/* eslint-disable camelcase */
import express from "express";
import {initDbPool} from "../utils/db";
import axios from "axios";
import {
  CreditProviderSchema,
  CreditProductSchema,
  CreditApplicationSchema,
} from "../validation/creditSchema";
import {z} from "zod";

export const getCreditRouter = (config: {
  PGUSER: string;
  PGPASS: string;
  PGHOST: string;
  PGDB: string;
  PGPORT: string;
}) => {
  const pool = initDbPool(config);
  const router = express.Router();

  // ============================================
  // CREDIT PROVIDER MANAGEMENT (Admin only)
  // ============================================

  // Register a new credit provider
  router.post("/providers", async (req, res) => {
    try {
      const validated = CreditProviderSchema.parse(req.body);

      const result = await pool.query(
        `INSERT INTO credit_providers 
         (name, logo_url, description, website, api_endpoint, integration_type, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [
          validated.name,
          validated.logo_url,
          validated.description,
          validated.website,
          validated.api_endpoint,
          validated.integration_type,
          validated.status,
        ]
      );

      res.status(201).json(result.rows[0]);
    } catch (err) {
      console.error("Error creating credit provider:", err);
      res.status(500).json({error: "Failed to create provider"});
    }
  });

  // Get all active credit providers
  router.get("/providers", async (req, res) => {
    try {
      const result = await pool.query(
        "SELECT * FROM credit_providers WHERE status = 'active' ORDER BY name"
      );
      res.json(result.rows);
    } catch (err) {
      console.error("Error fetching providers:", err);
      res.status(500).json({error: "Failed to fetch providers"});
    }
  });

  // ============================================
  // CREDIT PRODUCT MANAGEMENT
  // ============================================

  // Add products for a provider
  router.post("/providers/:providerId/products", async (req, res) => {
    try {
      const {providerId} = req.params;
      const validated = CreditProductSchema.parse({
        ...req.body,
        provider_id: providerId,
      });

      const result = await pool.query(
        `INSERT INTO credit_products 
         (provider_id, name, description, min_amount, max_amount, 
          interest_rate, interest_rate_type, repayment_period_min, 
          repayment_period_max, processing_fee, collateral_required, 
          requirements, status, external_product_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
         RETURNING *`,
        [
          validated.provider_id,
          validated.name,
          validated.description,
          validated.min_amount,
          validated.max_amount,
          validated.interest_rate,
          validated.interest_rate_type,
          validated.repayment_period_min,
          validated.repayment_period_max,
          validated.processing_fee,
          validated.collateral_required,
          validated.requirements,
          validated.status,
          validated.external_product_id,
        ]
      );

      res.status(201).json(result.rows[0]);
    } catch (err) {
      console.error("Error creating credit product:", err);
      res.status(500).json({error: "Failed to create product"});
    }
  });

  // Get all available credit products (with provider info)
  router.get("/products", async (req, res) => {
    try {
      const {min_amount, max_amount, provider} = req.query;

      let query = `
        SELECT cp.*, pr.name as provider_name, pr.logo_url, pr.integration_type
        FROM credit_products cp
        JOIN credit_providers pr ON cp.provider_id = pr.id
        WHERE cp.status = 'available' AND pr.status = 'active'
      `;
      const params: any[] = [];

      if (min_amount) {
        params.push(min_amount);
        query += ` AND cp.max_amount >= $${params.length}`;
      }
      if (max_amount) {
        params.push(max_amount);
        query += ` AND cp.min_amount <= $${params.length}`;
      }
      if (provider) {
        params.push(provider);
        query += ` AND pr.id = $${params.length}`;
      }

      query += " ORDER BY pr.name, cp.min_amount";

      const result = await pool.query(query, params);
      res.json(result.rows);
    } catch (err) {
      console.error("Error fetching credit products:", err);
      res.status(500).json({error: "Failed to fetch products"});
    }
  });

  // ============================================
  // CREDIT APPLICATIONS
  // ============================================

  // Submit credit application
  router.post("/applications", async (req, res) => {
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const validated = CreditApplicationSchema.parse({
        ...req.body,
        status: "submitted",
      });

      // Get product details to know which provider
      const product = await client.query(
        "SELECT * FROM credit_products WHERE id = $1",
        [validated.product_id]
      );

      if (product.rows.length === 0) {
        await client.query("ROLLBACK");
        client.release();
        return res.status(404).json({error: "Product not found"});
      }

      const creditProduct = product.rows[0];

      // Get provider details
      const provider = await client.query(
        "SELECT * FROM credit_providers WHERE id = $1",
        [creditProduct.provider_id]
      );

      if (provider.rows.length === 0) {
        await client.query("ROLLBACK");
        client.release();
        return res.status(404).json({error: "Provider not found"});
      }

      // Create application record
      const application = await client.query(
        `INSERT INTO credit_applications 
        (farmer_id, product_id, amount, repayment_period, purpose, status)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *`,
        [
          validated.farmer_id,
          validated.product_id,
          validated.amount,
          validated.repayment_period,
          validated.purpose,
          validated.status,
        ]
      );

      // If provider has API integration, forward the application
      if (provider.rows[0]?.api_endpoint && provider.rows[0]?.integration_type === "direct") {
        try {
          // Get farmer details
          const farmer = await client.query(
            "SELECT * FROM farmers WHERE user_id = $1",
            [validated.farmer_id]
          );

          // Forward to provider's API
          const apiResponse = await axios.post(
            provider.rows[0].api_endpoint,
            {
              farmer: farmer.rows[0],
              application: application.rows[0],
              product: creditProduct,
            },
            {
              headers: {
                "Authorization": `Bearer ${process.env[`PROVIDER_KEY_${provider.rows[0].id}`]}`,
                "Content-Type": "application/json",
              },
              timeout: 10000, // 10 second timeout
            }
          );

          // Update with external reference
          await client.query(
            `UPDATE credit_applications 
            SET external_application_id = $1, provider_response = $2
            WHERE id = $3`,
            [apiResponse.data.application_id, apiResponse.data, application.rows[0].id]
          );
        } catch (apiError) {
          console.error("Error forwarding to provider API:", apiError);
          // Log the error but don't fail the application
          await client.query(
            `UPDATE credit_applications 
            SET provider_response = $1
            WHERE id = $2`,
            [{error: "Failed to sync with provider"}, application.rows[0].id]
          );
        }
      }

      await client.query("COMMIT");
      client.release();
      return res.status(201).json(application.rows[0]);
    } catch (err) {
      await client.query("ROLLBACK");
      client.release();
      console.error("Error submitting credit application:", err);

      if (err instanceof z.ZodError) {
        return res.status(400).json({
          error: "Validation failed",
          details: err.errors,
        });
      }

      return res.status(500).json({error: "Failed to submit application"});
    }
  });

  // Get farmer's credit applications
  router.get("/applications/farmer/:farmerId", async (req, res) => {
    try {
      const {farmerId} = req.params;

      const result = await pool.query(
        `SELECT a.*, 
                p.name as product_name, 
                p.min_amount, p.max_amount, p.interest_rate,
                pr.name as provider_name, pr.logo_url
         FROM credit_applications a
         JOIN credit_products p ON a.product_id = p.id
         JOIN credit_providers pr ON p.provider_id = pr.id
         WHERE a.farmer_id = $1
         ORDER BY a.applied_at DESC`,
        [farmerId]
      );

      res.json(result.rows);
    } catch (err) {
      console.error("Error fetching farmer applications:", err);
      res.status(500).json({error: "Failed to fetch applications"});
    }
  });

  return router;
};
