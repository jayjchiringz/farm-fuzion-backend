/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable camelcase */
import express from "express";
import {initDbPool} from "../utils/db";
import {Pool, PoolClient} from "pg";

// Add the resolveFarmerId helper (same as in marketplace.ts)
async function resolveFarmerId(db: Pool | PoolClient, farmerId: string | number): Promise<number> {
  const normalized = String(farmerId).trim();
  console.log("🔍 [resolveFarmerId] Input:", normalized);

  // If it's already a valid number, return it
  if (!isNaN(Number(normalized)) && normalized !== "") {
    return parseInt(normalized, 10);
  }

  // Check if it's a UUID and look up the numeric ID
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (uuidRegex.test(normalized)) {
    console.log("🟢 Input is valid UUID, looking up numeric ID...");
    const farmerResult = await db.query(
      "SELECT id FROM farmers WHERE user_id = $1",
      [normalized]
    );
    if (farmerResult.rows.length > 0) {
      const numericId = farmerResult.rows[0].id;
      console.log("✅ Resolved UUID to numeric ID:", numericId);
      return numericId;
    }
  }

  throw new Error(`Could not resolve farmer ID: ${normalized}`);
}

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
      // Resolve the farmer ID to numeric
      const numericFarmerId = await resolveFarmerId(pool, farmer_id);

      const result = await pool.query(
        `INSERT INTO loans (farmer_id, amount, purpose, repayment_due)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [numericFarmerId, amount, purpose, repayment_due]
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
      const result = await pool.query("SELECT * FROM loans ORDER BY applied_at DESC");
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
        // Resolve the farmer ID to numeric
        const numericFarmerId = await resolveFarmerId(pool, req.params.farmer_id);

        const result = await pool.query(
          "SELECT * FROM loans WHERE farmer_id = $1 ORDER BY applied_at DESC",
          [numericFarmerId]
        );
        res.json(result.rows);
      } catch (err) {
        console.error("❌ Fetch farmer loans failed:", err);
        res.status(500).send("Internal server error");
      }
    });

  return router;
};
