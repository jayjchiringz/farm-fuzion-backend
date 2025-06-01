/* eslint-disable camelcase */
import express from "express";
import {LogisticsSchema} from "../validation/logisticsSchema";
import {z} from "zod";
import {initDbPool} from "../utils/db";

const validateRequest = (schema: z.ZodSchema) => (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
): void => {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({error: result.error.errors[0].message});
    return;
  }
  next();
};

export const getLogisticsRouter = (config: {
  PGUSER: string;
  PGPASS: string;
  PGHOST: string;
  PGDB: string;
  PGPORT: string;
}) => {
  const pool = initDbPool(config);
  const router = express.Router();

  router.post("/", validateRequest(LogisticsSchema), async (req, res) => {
    const {
      farmer_id,
      business_id,
      vehicle_id,
      driver_name,
      origin,
      destination,
      delivery_date,
      status = "scheduled",
    } = req.body;

    try {
      const result = await pool.query(
        `INSERT INTO logistics 
          (
            farmer_id,
            business_id,
            vehicle_id,
            driver_name,
            origin,
            destination,
            delivery_date,
            status
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          RETURNING id`,
        [
          farmer_id,
          business_id,
          vehicle_id,
          driver_name,
          origin,
          destination,
          delivery_date,
          status,
        ]
      );

      res.status(201).json({id: result.rows[0].id});
    } catch (err) {
      console.error("Error creating logistics record:", err);
      res.status(500).send("Internal server error");
    }
  });

  router.get("/", async (_, res) => {
    try {
      const result = await pool.query(
        "SELECT * FROM logistics ORDER BY created_at DESC"
      );
      res.json(result.rows);
    } catch (err) {
      console.error("Error fetching logistics:", err);
      res.status(500).send("Internal server error");
    }
  });

  router.get("/farmer/:farmer_id", async (req, res) => {
    try {
      const {farmer_id} = req.params;
      const result = await pool.query(
        "SELECT * FROM logistics WHERE farmer_id = $1 ORDER BY created_at DESC",
        [farmer_id]
      );
      res.json(result.rows);
    } catch (err) {
      console.error("Error fetching logistics by farmer:", err);
      res.status(500).send("Internal server error");
    }
  });

  router.put("/:id/status", async (req, res) => {
    const {id} = req.params;
    const {status} = req.body;

    if (!["scheduled", "en_route", "delivered"].includes(status)) {
      res.status(400).json({error: "Invalid status value"});
      return;
    }

    try {
      await pool.query("UPDATE logistics SET status = $1 WHERE id = $2", [
        status,
        id,
      ]);
      res.status(200).json({message: "Status updated"});
    } catch (err) {
      console.error("Error updating logistics status:", err);
      res.status(500).send("Internal server error");
    }
  });

  return router;
};
