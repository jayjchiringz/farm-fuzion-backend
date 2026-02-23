/* eslint-disable camelcase */
/* eslint-disable max-len */
// functions/src/api/insurance.ts
import express, {Request, Response} from "express";
import {Pool} from "pg";
import {initDbPool} from "../utils/db";
import {InsuranceService} from "../services/insuranceService";
import {validate} from "../middleware/validate";
import {
  InsuranceApplicationSchema,
  InsuranceClaimSchema,
} from "../validation/insuranceSchema";

export const getInsuranceRouter = (config: {
  PGUSER: string;
  PGPASS: string;
  PGHOST: string;
  PGDB: string;
  PGPORT: string;
}) => {
  const pool: Pool = initDbPool(config);
  const router = express.Router();
  const insuranceService = new InsuranceService(pool);

  // Helper to resolve farmer ID (UUID to numeric)
  const resolveFarmerId = async (farmerId: string | number): Promise<number> => {
    const normalized = String(farmerId).trim();

    if (!isNaN(Number(normalized)) && normalized !== "") {
      return parseInt(normalized, 10);
    }

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (uuidRegex.test(normalized)) {
      const result = await pool.query(
        "SELECT id FROM farmers WHERE user_id = $1",
        [normalized]
      );
      if (result.rows.length > 0) {
        return result.rows[0].id;
      }
    }
    throw new Error(`Could not resolve farmer ID: ${normalized}`);
  };

  // ==================== PRODUCTS ====================

  // GET /insurance/products - Get all insurance products
  router.get("/products", async (req: Request, res: Response) => {
    try {
      const {type, provider, min_premium, max_premium, popular} = req.query;

      const products = await insuranceService.getProducts({
        type: type as string,
        provider_id: provider as string,
        min_premium: min_premium ? parseFloat(min_premium as string) : undefined,
        max_premium: max_premium ? parseFloat(max_premium as string) : undefined,
        popular_only: popular === "true",
      });

      return res.json({
        success: true,
        data: products,
      });
    } catch (error) {
      console.error("Error fetching insurance products:", error);
      return res.status(500).json({error: "Failed to fetch insurance products"});
    }
  });

  // GET /insurance/products/:id - Get single product
  router.get("/products/:id", async (req: Request, res: Response) => {
    try {
      const {id} = req.params;
      const product = await insuranceService.getProductById(id);

      if (!product) {
        return res.status(404).json({error: "Product not found"});
      }

      return res.json({
        success: true,
        data: product,
      });
    } catch (error) {
      console.error("Error fetching insurance product:", error);
      return res.status(500).json({error: "Failed to fetch insurance product"});
    }
  });

  // ==================== APPLICATIONS ====================

  // GET /insurance/applications/farmer/:farmerId - Get farmer's applications
  router.get("/applications/farmer/:farmerId", async (req: Request, res: Response) => {
    try {
      const {farmerId} = req.params;
      const numericFarmerId = await resolveFarmerId(farmerId);

      const applications = await insuranceService.getFarmerApplications(numericFarmerId);

      return res.json({
        success: true,
        data: applications,
      });
    } catch (error) {
      console.error("Error fetching farmer applications:", error);
      return res.status(500).json({error: "Failed to fetch applications"});
    }
  });

  // POST /insurance/applications - Create new application
  router.post("/applications", validate(InsuranceApplicationSchema), async (req: Request, res: Response) => {
    try {
      const {farmer_id, ...data} = req.body;
      const numericFarmerId = await resolveFarmerId(farmer_id);

      // Get product to validate coverage amount
      const product = await insuranceService.getProductById(data.product_id);
      if (!product) {
        return res.status(404).json({error: "Insurance product not found"});
      }

      // Validate coverage amount is within product range
      if (data.coverage_amount < product.premium_min || data.coverage_amount > product.premium_max) {
        return res.status(400).json({
          error: `Coverage amount must be between ${product.premium_min} and ${product.premium_max}`,
        });
      }

      const application = await insuranceService.createApplication({
        ...data,
        farmer_id: numericFarmerId,
      });

      return res.status(201).json({
        success: true,
        data: application,
        message: "Insurance application submitted successfully",
      });
    } catch (error) {
      console.error("Error creating insurance application:", error);
      // Properly type the error
      const errorMessage = error instanceof Error ? error.message : "Failed to create application";
      return res.status(500).json({error: errorMessage});
    }
  });

  // PATCH /insurance/applications/:id/status - Update application status
  router.patch("/applications/:id/status", async (req: Request, res: Response) => {
    try {
      const {id} = req.params;
      const {status, notes} = req.body;

      const validStatuses = ["draft", "submitted", "under_review", "approved", "rejected", "active", "expired", "cancelled"];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({error: "Invalid status"});
      }

      const application = await insuranceService.updateApplicationStatus(id, status, notes);

      return res.json({
        success: true,
        data: application,
        message: `Application status updated to ${status}`,
      });
    } catch (error) {
      console.error("Error updating application status:", error);
      return res.status(500).json({error: "Failed to update application status"});
    }
  });

  // ==================== CLAIMS ====================

  // GET /insurance/claims/farmer/:farmerId - Get farmer's claims
  router.get("/claims/farmer/:farmerId", async (req: Request, res: Response) => {
    try {
      const {farmerId} = req.params;
      const numericFarmerId = await resolveFarmerId(farmerId);

      const claims = await insuranceService.getFarmerClaims(numericFarmerId);

      return res.json({
        success: true,
        data: claims,
      });
    } catch (error) {
      console.error("Error fetching farmer claims:", error);
      return res.status(500).json({error: "Failed to fetch claims"});
    }
  });

  // POST /insurance/claims - File a new claim
  router.post("/claims", validate(InsuranceClaimSchema), async (req: Request, res: Response) => {
    try {
      const claim = await insuranceService.createClaim(req.body);

      return res.status(201).json({
        success: true,
        data: claim,
        message: "Claim filed successfully",
      });
    } catch (error) {
      console.error("Error filing claim:", error);
      // Properly type the error
      const errorMessage = error instanceof Error ? error.message : "Failed to file claim";
      return res.status(500).json({error: errorMessage});
    }
  });

  return router;
};
