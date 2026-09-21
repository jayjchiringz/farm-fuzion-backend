// src/api/public-marketplace.ts
/* eslint-disable camelcase */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */
import express, {Request, Response} from "express";
import {initDbPool} from "../utils/db";
import {v4 as uuidv4} from "uuid";

interface AppConfig {
  PGUSER: string;
  PGPASS: string;
  PGHOST: string;
  PGDB: string;
  PGPORT: string;
}

export const getPublicMarketplaceRouter = (config: AppConfig) => {
  const pool = initDbPool(config);
  const router = express.Router();

  // ============================================================
  // GET /v1/products — browse available cooperative lots
  // ============================================================
  router.get("/products", async (req: Request, res: Response) => {
    try {
      const {
        category,
        search,
        min_price,
        max_price,
        sort = "newest",
        limit = "20",
        offset = "0",
      } = req.query;

      const limitNum = Math.min(parseInt(limit as string) || 20, 100);
      const offsetNum = parseInt(offset as string) || 0;

      const conditions: string[] = ["cp.available = TRUE", "cp.quantity > 0"];
      const params: any[] = [];

      if (category) {
        params.push(category);
        conditions.push(`cp.category = $${params.length}`);
      }
      if (search) {
        params.push(`%${search}%`);
        conditions.push(`(cp.product_name ILIKE $${params.length} OR g.name ILIKE $${params.length})`);
      }
      if (min_price) {
        params.push(parseFloat(min_price as string));
        conditions.push(`cp.price_per_unit >= $${params.length}`);
      }
      if (max_price) {
        params.push(parseFloat(max_price as string));
        conditions.push(`cp.price_per_unit <= $${params.length}`);
      }

      const where = "WHERE " + conditions.join(" AND ");

      let orderBy = "ORDER BY cp.created_at DESC";
      if (sort === "price_asc") orderBy = "ORDER BY cp.price_per_unit ASC";
      else if (sort === "price_desc") orderBy = "ORDER BY cp.price_per_unit DESC";
      else if (sort === "moq_asc") orderBy = "ORDER BY cp.quantity ASC";

      const countResult = await pool.query(
        `SELECT COUNT(*)::int AS total
         FROM cooperative_products cp
         LEFT JOIN groups g ON cp.group_id = g.id
         ${where}`,
        params
      );
      const total = countResult.rows[0].total;

      params.push(limitNum);
      params.push(offsetNum);

      const result = await pool.query(
        `SELECT
           cp.id,
           cp.group_id,
           cp.product_name,
           cp.category,
           cp.quantity,
           cp.unit,
           cp.price_per_unit,
           cp.currency,
           (cp.quantity * cp.price_per_unit) AS total_price,
           cp.available,
           cp.certification,
           cp.description,
           cp.created_at,
           g.name   AS cooperative_name,
           g.county AS cooperative_county,
           f.first_name || ' ' || f.last_name AS source_farmer_name
         FROM cooperative_products cp
         LEFT JOIN groups g  ON cp.group_id = g.id
         LEFT JOIN farmers f ON cp.source_farmer_id = f.id
         ${where}
         ${orderBy}
         LIMIT $${params.length - 1}
         OFFSET $${params.length}`,
        params
      );

      return res.json({
        data: result.rows,
        total,
        limit: limitNum,
        offset: offsetNum,
      });
    } catch (err) {
      console.error("💥 Public products error:", err);
      return res.status(500).json({error: "Failed to load products"});
    }
  });

  // ============================================================
  // GET /v1/stats — real counts for the hero / sidebar
  // ============================================================
  router.get("/stats", async (_req: Request, res: Response) => {
    try {
      const result = await pool.query(`
        SELECT
          (SELECT COUNT(*)::int
             FROM cooperative_products
            WHERE available = TRUE AND quantity > 0)                       AS total_products,
          (SELECT COUNT(*)::int
             FROM groups
            WHERE status = 'active')                                        AS total_cooperatives,
          (SELECT COUNT(*)::int
             FROM farmers)                                                  AS total_farmers,
          (SELECT COUNT(*)::int
             FROM bulk_orders)                                              AS total_orders,
          (SELECT COUNT(DISTINCT LOWER(TRIM(buyer_country)))::int
             FROM bulk_orders
            WHERE buyer_country IS NOT NULL
              AND TRIM(buyer_country) <> '')                                AS countries_reached
      `);

      return res.json(result.rows[0]);
    } catch (err) {
      console.error("💥 Public stats error:", err);
      // Don't 500 — return honest zeros so the hero still renders.
      return res.json({
        total_products: 0,
        total_cooperatives: 0,
        total_farmers: 0,
        total_orders: 0,
        countries_reached: 0,
      });
    }
  });

  // ============================================================
  // GET /v1/categories — distinct product categories
  // ============================================================
  router.get("/categories", async (_req: Request, res: Response) => {
    try {
      const result = await pool.query(`
        SELECT DISTINCT category
        FROM cooperative_products
        WHERE available = TRUE
          AND category IS NOT NULL
          AND TRIM(category) <> ''
        ORDER BY category ASC
      `);
      return res.json({categories: result.rows.map((r) => r.category)});
    } catch (err) {
      console.error("💥 Public categories error:", err);
      return res.json({categories: []});
    }
  });

  // ============================================================
  // POST /v1/orders — public buyer places a bulk order
  // ============================================================
  router.post("/orders", async (req: Request, res: Response) => {
    try {
      const {
        product_id,
        buyer_name,
        buyer_company,
        buyer_email,
        buyer_phone,
        buyer_country,
        quantity,
        shipping_address,
        notes,
      } = req.body;

      if (!product_id || !buyer_email || !quantity) {
        return res.status(400).json({
          error: "product_id, buyer_email and quantity are required",
        });
      }

      const qty = parseInt(quantity, 10);
      if (!Number.isFinite(qty) || qty <= 0) {
        return res.status(400).json({error: "Invalid quantity"});
      }

      const productResult = await pool.query(
        `SELECT id, group_id, product_name, price_per_unit, currency,
                quantity AS available, unit
         FROM cooperative_products
         WHERE id = $1 AND available = TRUE`,
        [product_id]
      );

      if (productResult.rows.length === 0) {
        return res.status(404).json({error: "Product not found or unavailable"});
      }

      const p = productResult.rows[0];
      if (qty > p.available) {
        return res.status(400).json({
          error: `Only ${p.available} ${p.unit} available`,
        });
      }

      const totalAmount = p.price_per_unit * qty;
      const orderId = uuidv4();

      await pool.query(
        `INSERT INTO bulk_orders (
           id, cooperative_product_id,
           buyer_name, buyer_company, buyer_email, buyer_phone, buyer_country,
           quantity, total_amount, shipping_address,
           status, created_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'pending',NOW())`,
        [
          orderId,
          product_id,
          buyer_name || null,
          buyer_company || null,
          buyer_email,
          buyer_phone || null,
          buyer_country || null,
          qty,
          totalAmount,
          shipping_address || null,
        ]
      );

      console.log(
        `📦 Public order created: ${orderId} · ${p.product_name} × ${qty} = ${totalAmount} ${p.currency || "KES"}${
          notes ? ` · notes: ${notes}` : ""
        }`
      );

      return res.status(201).json({
        id: orderId,
        total_amount: totalAmount,
        currency: p.currency || "KES",
        message: "Order created successfully",
      });
    } catch (err) {
      console.error("💥 Public order error:", err);
      return res.status(500).json({error: "Failed to create order"});
    }
  });

  return router;
};
