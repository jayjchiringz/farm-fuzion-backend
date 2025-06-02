/* eslint-disable camelcase */
import {initDbPool} from "../utils/db";
import express from "express";

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
  router.post(
    "/",
    async (
      req: express.Request,
      res: express.Response
    ) => {
      const {loan_id, farmer_id, amount, method, reference_no} = req.body;

      if (!loan_id || !farmer_id || !amount) {
        res.status(400).json({error: "Missing required fields"});
        return;
      }

      try {
        const result = await pool.query(
          `INSERT INTO loan_repayments (
           loan_id, farmer_id, amount, method, reference_no
         ) VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
          [loan_id, farmer_id, amount, method, reference_no]
        );

        // After inserting repayment
        await pool.query(
          `INSERT INTO loan_repayments (
            loan_id, farmer_id, amount, method, reference_no
          )
          VALUES ($1, $2, $3, $4, $5) RETURNING *`,
          [loan_id, farmer_id, amount, method, reference_no]
        );

        // Now update loan status if fully paid
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
  router.get(
    "/:loan_id",
    async (
      req: express.Request,
      res: express.Response
    ) => {
      try {
        const result = await pool.query(
          "SELECT * FROM loan_repayments WHERE loan_id = $1 " +
          "ORDER BY payment_date DESC",
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
