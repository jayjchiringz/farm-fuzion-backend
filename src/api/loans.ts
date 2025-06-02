/* eslint-disable camelcase */
import express from "express";
import {initDbPool} from "../utils/db";

export const getLoansRouter = (config: {
  PGUSER: string;
  PGPASS: string;
  PGHOST: string;
  PGDB: string;
  PGPORT: string;
}) => {
  const pool = initDbPool(config);
  const router = express.Router();

  // 📥 Apply for a loan
  router.post("/", async (req, res) => {
    const {farmer_id, amount, purpose, repayment_due} = req.body;

    if (!farmer_id || !amount) {
      res.status(400).json({error: "farmer_id and amount required"});
      return;
    }

    try {
      const result = await pool.query(
        `INSERT INTO loans (farmer_id, amount, purpose, repayment_due)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [farmer_id, amount, purpose, repayment_due]
      );
      res.status(201).json(result.rows[0]);
    } catch (err) {
      console.error("❌ Loan creation error:", err);
      res.status(500).send("Internal server error");
    }
  });

  // 📤 View all loans (admin or future reporting)
  router.get("/", async (_: express.Request, res: express.Response) => {
    try {
      const result = await pool.query("SELECT * FROM loans");
      res.json(result.rows);
    } catch (err) {
      console.error("❌ Fetch all loans failed:", err);
      res.status(500).send("Internal server error");
    }
  });

  // 📄 View loans for a specific farmer
  router.get(
    "/:farmer_id",
    async (req: express.Request, res: express.Response) => {
      try {
        const result = await pool.query(
          "SELECT * FROM loans WHERE farmer_id = $1 ORDER BY applied_at DESC",
          [req.params.farmer_id]
        );
        res.json(result.rows);
      } catch (err) {
        console.error("❌ Fetch farmer loans failed:", err);
        res.status(500).send("Internal server error");
      }
    });

  return router;
};
