/* eslint-disable camelcase */
import express, {Request, Response, NextFunction} from "express";
import {z} from "zod";
import {initDbPool} from "../utils/db";
import {FarmProductSchema, FarmProduct} from "../validation/farmProductSchema";

const validateRequest = (schema: z.ZodSchema) => (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({error: result.error.errors[0].message});
    return;
  }
  next();
};

export const getFarmProductsRouter = (config: {
  PGUSER: string;
  PGPASS: string;
  PGHOST: string;
  PGDB: string;
  PGPORT: string;
}) => {
  const pool = initDbPool(config);
  const router = express.Router();

  // ➕ Add new product
  router.post(
    "/",
    validateRequest(FarmProductSchema),
    async (req: Request<object, object, FarmProduct>, res: Response) => {
      const {
        farmer_id,
        product_name,
        quantity,
        unit,
        harvest_date,
        storage_location,
        category,
        price,
        status,
      } = req.body;

      try {
        const result = await pool.query(
          `INSERT INTO farm_products 
            (
              farmer_id, product_name, quantity, unit, harvest_date,
              storage_location, category, price, status, created_at, updated_at
            )
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW(),NOW())
           RETURNING id`,
          [
            farmer_id,
            product_name,
            quantity,
            unit,
            harvest_date || null,
            storage_location || null,
            category || null,
            price ?? 0,
            status || "available",
          ]
        );
        res.status(201).json({id: result.rows[0].id});
      } catch (err) {
        console.error("Error adding farm product:", err);
        res.status(500).send("Internal server error");
      }
    }
  );

  // 📦 Get all products (with optional filters)
  router.get("/", async (req, res) => {
    try {
      const {category, status} = req.query;

      let baseQuery = "SELECT * FROM farm_products WHERE 1=1";
      const params: unknown[] = [];

      if (category) {
        params.push(category);
        baseQuery += ` AND category = $${params.length}`;
      }

      if (status) {
        params.push(status);
        baseQuery += ` AND status = $${params.length}`;
      }

      baseQuery += " ORDER BY created_at DESC";

      const result = await pool.query(baseQuery, params);
      res.json(result.rows);
    } catch (err) {
      console.error("Error fetching products:", err);
      res.status(500).send("Internal server error");
    }
  });

  // 👩‍🌾 Get farmer-specific products
  router.get("/farmer/:farmer_id", async (req, res) => {
    try {
      const {farmer_id} = req.params;
      const result = await pool.query(
        `SELECT * FROM farm_products WHERE farmer_id = $1
        ORDER BY created_at DESC`,
        [farmer_id]
      );
      res.json(result.rows);
    } catch (err) {
      console.error("Error fetching farmer products:", err);
      res.status(500).send("Internal server error");
    }
  });

  // ✏️ Update product
  router.put("/:id", async (req, res) => {
    const {id} = req.params;
    const {product_name, quantity, unit, price, status, category} = req.body;

    try {
      const result = await pool.query(
        `UPDATE farm_products
         SET product_name = COALESCE($1, product_name),
             quantity = COALESCE($2, quantity),
             unit = COALESCE($3, unit),
             price = COALESCE($4, price),
             status = COALESCE($5, status),
             category = COALESCE($6, category),
             updated_at = NOW()
         WHERE id = $7
         RETURNING *`,
        [product_name, quantity, unit, price, status, category, id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({error: "Product not found"});
      }

      return res.json(result.rows[0]);
    } catch (err) {
      console.error("Error updating product:", err);
      return res.status(500).send("Internal server error");
    }
  });

  // 🗑️ Delete product
  router.delete("/:id", async (req, res) => {
    const {id} = req.params;
    try {
      const result = await pool.query(
        "DELETE FROM farm_products WHERE id = $1 RETURNING id",
        [id]
      );
      if (result.rows.length === 0) {
        return res.status(404).json({error: "Product not found"});
      }
      return res.json({message: "Product deleted", id});
    } catch (err) {
      console.error("Error deleting product:", err);
      return res.status(500).send("Internal server error");
    }
  });

  return router;
};
