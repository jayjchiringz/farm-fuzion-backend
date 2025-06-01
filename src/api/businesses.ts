/* eslint-disable camelcase */
import {BusinessSchema} from "../validation/businessSchema";
import express, {Request, Response, NextFunction} from "express";
import {ZodError, ZodSchema} from "zod";
import {initDbPool} from "../utils/db";

export const validateRequest = (schema: ZodSchema<unknown>) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      schema.parse(req.body);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({error: error.errors[0].message});
      } else {
        res.status(400).json({error: "Invalid request"});
      }
    }
  };
};

export const getBusinessesRouter = (config: {
  PGUSER: string;
  PGPASS: string;
  PGHOST: string;
  PGDB: string;
  PGPORT: string;
}) => {
  const pool = initDbPool(config);
  const router = express.Router();

  // ➕ Create Business
  router.post("/", validateRequest(BusinessSchema), async (req, res) => {
    const {
      farmer_id,
      business_reg_no,
      business_address,
      director_id,
      mobile_no_1,
      mobile_no_2,
      mobile_no_3,
      email,
    } = req.body;

    try {
      const result = await pool.query(
        `INSERT INTO farmer_businesses 
          (
            farmer_id,
            business_reg_no,
            business_address,
            director_id,
            mobile_no_1,
            mobile_no_2,
            mobile_no_3,
            email
          )
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         RETURNING id`,
        [
          farmer_id,
          business_reg_no,
          business_address,
          director_id,
          mobile_no_1,
          mobile_no_2,
          mobile_no_3,
          email,
        ]
      );

      res.status(201).json({id: result.rows[0].id});
    } catch (err) {
      console.error("Error creating business:", err);
      res.status(500).send("Internal server error");
    }
  });

  // 📥 Get All Businesses
  router.get("/", async (_, res) => {
    try {
      const result = await pool.query("SELECT * FROM farmer_businesses");
      res.json(result.rows);
    } catch (err) {
      console.error("Error fetching businesses:", err);
      res.status(500).send("Internal server error");
    }
  });

  // 🔍 Get Businesses by Farmer ID
  router.get("/:farmer_id", async (req, res) => {
    try {
      const result = await pool.query(
        "SELECT * FROM farmer_businesses WHERE farmer_id = $1",
        [req.params.farmer_id]
      );
      res.json(result.rows);
    } catch (err) {
      console.error("Error fetching business by farmer:", err);
      res.status(500).send("Internal server error");
    }
  });

  return router;
};
