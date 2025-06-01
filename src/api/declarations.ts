/* eslint-disable camelcase */
import {DeclarationSchema} from "../validation/declarationSchema";
import {z} from "zod";
import express, {RequestHandler} from "express";
import {initDbPool} from "../utils/db";

export const validateRequest = (schema: z.ZodSchema): RequestHandler => {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({error: result.error.errors[0].message});
      return;
    }
    next();
  };
};

export const getDeclarationsRouter = (config: {
  PGUSER: string;
  PGPASS: string;
  PGHOST: string;
  PGDB: string;
  PGPORT: string;
}) => {
  const pool = initDbPool(config);
  const router = express.Router();

  // ➕ Create Declaration
  router.post("/", validateRequest(DeclarationSchema), async (req, res) => {
    const {
      farmer_id,
      business_id,
      tax_id,
      tax_obligation,
      declaration_date,
      account_balance,
      tax_amount,
    } = req.body;

    try {
      const result = await pool.query(
        `INSERT INTO tax_declarations 
          (
            farmer_id,
            business_id,
            tax_id,
            tax_obligation,
            declaration_date,
            account_balance,
            tax_amount
          )
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id`,
        [
          farmer_id,
          business_id,
          tax_id,
          tax_obligation,
          declaration_date,
          account_balance,
          tax_amount,
        ]
      );

      res.status(201).json({id: result.rows[0].id});
    } catch (err) {
      console.error("Error creating tax declaration:", err);
      res.status(500).send("Internal server error");
    }
  });

  // 📥 Get All Declarations
  router.get("/", async (_, res) => {
    try {
      const result = await pool.query("SELECT * FROM tax_declarations");
      res.json(result.rows);
    } catch (err) {
      console.error("Error fetching declarations:", err);
      res.status(500).send("Internal server error");
    }
  });

  // 🔍 Get by Farmer ID
  router.get("/farmer/:farmer_id", async (req, res) => {
    try {
      const result = await pool.query(
        "SELECT * FROM tax_declarations WHERE farmer_id = $1",
        [req.params.farmer_id]
      );
      res.json(result.rows);
    } catch (err) {
      console.error("Error fetching declarations by farmer:", err);
      res.status(500).send("Internal server error");
    }
  });

  return router;
};
