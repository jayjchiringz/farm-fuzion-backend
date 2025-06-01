/* eslint-disable camelcase */
import express, {RequestHandler} from "express";
import {TaxSchema} from "../validation/taxSchema";
import {initDbPool} from "../utils/db";

// 🧠 Schema validation wrapper
const WrappedTaxSchema = {
  validate: (data: Record<string, unknown>) => {
    const result = TaxSchema.safeParse(data);
    if (!result.success) {
      return {
        error: {
          details: result.error.issues.map((issue) => ({
            message: issue.message,
          })),
        },
      };
    }
    return {error: null};
  },
};

// 🛡️ Request validation middleware
export const validateRequest = (
  schema: {
    validate: (
      data: Record<string, unknown>
    ) => {
      error: {
        details: {
          message: string;
        }[];
      } | null;
    };
  }
): RequestHandler => {
  return (req, res, next) => {
    const {error} = schema.validate(req.body);
    if (error) {
      res.status(400).json({error: error.details[0].message});
      return;
    }
    next();
  };
};

// ✅ DB-safe router factory
export const getTaxesRouter = (config: {
  PGUSER: string;
  PGPASS: string;
  PGHOST: string;
  PGDB: string;
  PGPORT: string;
}) => {
  const pool = initDbPool(config);
  const router = express.Router();

  // ➕ Create Tax Obligation
  router.post("/", validateRequest(WrappedTaxSchema), async (req, res) => {
    try {
      const result = await pool.query(
        `INSERT INTO taxes 
          (farmer_id, business_id, tax_id, tax_obligation)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [
          req.body.farmer_id,
          req.body.business_id,
          req.body.tax_id,
          req.body.tax_obligation,
        ]
      );

      res.status(201).json({id: result.rows[0].id});
    } catch (err) {
      console.error("Error creating tax obligation:", err);
      res.status(500).send("Internal server error");
    }
  });

  // 📥 Get All Tax Obligations
  router.get("/", async (_, res) => {
    try {
      const result = await pool.query("SELECT * FROM taxes");
      res.json(result.rows);
    } catch (err) {
      console.error("Error fetching taxes:", err);
      res.status(500).send("Internal server error");
    }
  });

  // 🔍 Get Tax Obligations by Farmer ID
  router.get("/farmer/:farmer_id", async (req, res) => {
    try {
      const result = await pool.query(
        "SELECT * FROM taxes WHERE farmer_id = $1",
        [req.params.farmer_id]
      );
      res.json(result.rows);
    } catch (err) {
      console.error("Error fetching farmer taxes:", err);
      res.status(500).send("Internal server error");
    }
  });

  return router;
};
