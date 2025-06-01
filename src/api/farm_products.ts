/* eslint-disable camelcase */
import express, {Request, Response, NextFunction} from "express";
import {z} from "zod";
import {FarmProductSchema} from "../validation/farmProductSchema";
import {initDbPool} from "../utils/db";

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

  router.post("/", validateRequest(FarmProductSchema), async (req, res) => {
    const {
      farmer_id,
      product_name,
      quantity,
      unit,
      harvest_date,
      storage_location,
    } = req.body;

    try {
      const result = await pool.query(
        `INSERT INTO farm_products 
          (
            farmer_id, product_name, quantity, unit,
            harvest_date, storage_location
          )
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [
          farmer_id,
          product_name,
          quantity,
          unit,
          harvest_date || null,
          storage_location || null,
        ]
      );
      res.status(201).json({id: result.rows[0].id});
    } catch (err) {
      console.error("Error adding farm product:", err);
      res.status(500).send("Internal server error");
    }
  });

  router.get("/", async (_, res) => {
    try {
      const result = await pool.query(
        "SELECT * FROM farm_products ORDER BY created_at DESC"
      );
      res.json(result.rows);
    } catch (err) {
      console.error("Error fetching products:", err);
      res.status(500).send("Internal server error");
    }
  });

  router.get("/farmer/:farmer_id", async (req, res) => {
    try {
      const {farmer_id} = req.params;
      const result = await pool.query(
        "SELECT * FROM farm_products WHERE farmer_id = $1 " +
        "ORDER BY created_at DESC",
        [farmer_id]
      );
      res.json(result.rows);
    } catch (err) {
      console.error("Error fetching farmer products:", err);
      res.status(500).send("Internal server error");
    }
  });

  return router;
};
