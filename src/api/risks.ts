/* eslint-disable camelcase */
import express, {Request, Response, NextFunction} from "express";
import {RiskSchema} from "../validation/riskSchema";
import {initDbPool} from "../utils/db";

export const validateRequest =
  (schema: {
    safeParse: (data: unknown) => {
      success: boolean;
      error?: { issues: { message: string }[] };
    };
  }) =>
    (req: Request, res: Response, next: NextFunction): void => {
      if (req.body && typeof req.body === "object") {
        const validationResult = schema.safeParse(req.body);
        if (!validationResult.success) {
          res.status(400).json({
            error: validationResult.error?.issues[0].message,
          });
        } else {
          next();
        }
      } else {
        res.status(400).json({error: "Invalid request body"});
      }
    };

export const getRisksRouter = (config: {
  PGUSER: string;
  PGPASS: string;
  PGHOST: string;
  PGDB: string;
  PGPORT: string;
}) => {
  const pool = initDbPool(config);
  const router = express.Router();

  // ➕ Create a Farmer Risk Assessment
  router.post("/", validateRequest(RiskSchema), async (req, res) => {
    const {farmer_id, credit_check, fraud_screen, assessment_date} = req.body;

    try {
      const result = await pool.query(
        `INSERT INTO farmer_risk_assessments 
          (farmer_id, credit_check, fraud_screen, assessment_date)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [farmer_id, credit_check, fraud_screen, assessment_date]
      );

      res.status(201).json({id: result.rows[0].id});
    } catch (err) {
      console.error("Error creating risk assessment:", err);
      res.status(500).send("Internal server error");
    }
  });

  // 📥 Get All Risk Assessments
  router.get("/", async (_, res) => {
    try {
      const result = await pool.query("SELECT * FROM farmer_risk_assessments");
      res.json(result.rows);
    } catch (err) {
      console.error("Error fetching risk assessments:", err);
      res.status(500).send("Internal server error");
    }
  });

  // 🔍 Get Risk Assessment by Farmer ID
  router.get("/:farmer_id", async (req, res) => {
    try {
      const result = await pool.query(
        "SELECT * FROM farmer_risk_assessments WHERE farmer_id = $1",
        [req.params.farmer_id]
      );
      res.json(result.rows);
    } catch (err) {
      console.error("Error fetching risk data:", err);
      res.status(500).send("Internal server error");
    }
  });

  return router;
};
