/* eslint-disable require-jsdoc */
/* eslint-disable quotes */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable camelcase */
import {initDbPool} from "../utils/db";
import express from "express";

// Add the same resolveFarmerId helper here
async function resolveFarmerId(db: any, farmerId: string | number): Promise<number> {
  const normalized = String(farmerId).trim();

  if (!isNaN(Number(normalized)) && normalized !== '') {
    return parseInt(normalized, 10);
  }

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (uuidRegex.test(normalized)) {
    const farmerResult = await db.query(
      "SELECT id FROM farmers WHERE user_id = $1",
      [normalized]
    );
    if (farmerResult.rows.length > 0) {
      return farmerResult.rows[0].id;
    }
  }

  throw new Error(`Could not resolve farmer ID: ${normalized}`);
}

export const getLoanRepaymentsRouter = (config: {
  PGUSER: string;
  PGPASS: string;
  PGHOST: string;
  PGDB: string;
  PGPORT: string;
}): express.Router => {
  const pool = initDbPool(config);
  const router = express.Router();

  // 💰 Submit loan repayment
  router.post("/", async (req: express.Request, res: express.Response) => {
    const {loan_id, farmer_id, amount, method, reference_no} = req.body;

    if (!loan_id || !farmer_id || !amount) {
      res.status(400).json({error: "Missing required fields"});
      return;
    }

    try {
      // Resolve farmer ID to numeric
      const numericFarmerId = await resolveFarmerId(pool, farmer_id);

      const result = await pool.query(
        `INSERT INTO loan_repayments (
           loan_id, farmer_id, amount, method, reference_no
         ) VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [loan_id, numericFarmerId, amount, method, reference_no]
      );

      // Update loan status if fully paid
      await pool.query(`
        UPDATE loans
        SET status = 'repaid'
        WHERE id = $1 AND (
          (
            SELECT COALESCE(SUM(amount), 0)
            FROM loan_repayments
            WHERE loan_id = $1
          ) >= (
            SELECT amount
            FROM loans
            WHERE id = $1
          )
        );
      `, [loan_id]);

      res.status(201).json(result.rows[0]);
    } catch (err) {
      console.error("❌ Repayment failed:", err);
      res.status(500).send("Internal server error");
    }
  });

  // 📊 View repayments for a loan
  router.get("/:loan_id", async (req: express.Request, res: express.Response) => {
    try {
      const result = await pool.query(
        "SELECT * FROM loan_repayments WHERE loan_id = $1 ORDER BY payment_date DESC",
        [req.params.loan_id]
      );
      res.json(result.rows);
    } catch (err) {
      console.error("❌ Fetch repayments failed:", err);
      res.status(500).send("Internal server error");
    }
  });

  return router;
};
