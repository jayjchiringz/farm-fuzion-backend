/* eslint-disable camelcase */
import {FinancialSchema} from "../validation/financialSchema";
import {z} from "zod";
import express, {RequestHandler} from "express";
import {initDbPool} from "../utils/db";

export const validateRequest = (schema: z.ZodTypeAny): RequestHandler => {
  return (req, res, next) => {
    try {
      schema.parse(req.body);
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).send(error.errors[0].message);
      } else {
        res.status(400).send("Invalid request");
      }
    }
  };
};

export const getFinancialsRouter = (config: {
  PGUSER: string;
  PGPASS: string;
  PGHOST: string;
  PGDB: string;
  PGPORT: string;
}) => {
  const pool = initDbPool(config);
  const router = express.Router();

  router.post("/", validateRequest(FinancialSchema), async (req, res) => {
    const {
      farmer_id,
      wallet_account_number,
      bank_branch,
      bank_code,
      account_name,
      account_number,
    } = req.body;

    try {
      const result = await pool.query(
        `INSERT INTO farmer_financials (
          farmer_id, wallet_account_number, bank_branch,
          bank_code, account_name, account_number
        ) VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id`,
        [
          farmer_id,
          wallet_account_number,
          bank_branch,
          bank_code,
          account_name,
          account_number,
        ]
      );
      res.status(201).json({id: result.rows[0].id});
    } catch (err) {
      console.error("Error creating financial record:", err);
      res.status(500).send("Internal server error");
    }
  });

  router.get("/", async (_, res) => {
    try {
      const result = await pool.query("SELECT * FROM farmer_financials");
      res.json(result.rows);
    } catch (err) {
      console.error("Error fetching financial records:", err);
      res.status(500).send("Internal server error");
    }
  });

  router.get("/:farmer_id", async (req, res) => {
    try {
      const result = await pool.query(
        "SELECT * FROM farmer_financials WHERE farmer_id = $1",
        [req.params.farmer_id]
      );
      res.json(result.rows);
    } catch (err) {
      console.error("Error fetching financial data:", err);
      res.status(500).send("Internal server error");
    }
  });

  return router;
};
