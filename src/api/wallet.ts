/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable camelcase */
import express from "express";
import pgPromise from "pg-promise";

export const getWalletRouter = (dbConfig: any) => {
  const router = express.Router();
  const {PGUSER, PGPASS, PGHOST, PGPORT, PGDB} = dbConfig;

  const pgp = pgPromise();
  const db = pgp({
    host: PGHOST,
    port: PGPORT,
    database: PGDB,
    user: PGUSER,
    password: PGPASS,
  });

  // 🟢 Get wallet balance
  router.get("/:farmerId/balance", async (req, res) => {
    const {farmerId} = req.params;
    try {
      const wallet = await db.oneOrNone(
        "SELECT balance FROM wallets WHERE farmer_id = $1",
        [farmerId]
      );
      res.json({balance: wallet?.balance ?? 0});
    } catch (err) {
      console.error("💥 Balance fetch error:", err);
      res.status(500).json({error: "Unable to fetch wallet balance"});
    }
  });

  // 📄 Fetch wallet transactions
  router.get("/:farmerId/transactions", async (req, res) => {
    const {farmerId} = req.params;
    try {
      const txns = await db.any(
        `SELECT * FROM wallet_transactions
         WHERE farmer_id = $1 ORDER BY timestamp DESC`,
        [farmerId]
      );
      res.json(txns);
    } catch (err) {
      console.error("💥 Tx fetch error:", err);
      res.status(500).json({error: "Unable to fetch transactions"});
    }
  });

  // 🔼 Top-up wallet
  router.post("/topup/:method", async (req, res) => {
    const {method} = req.params;
    const {farmer_id, amount} = req.body;

    if (!farmer_id || !amount || Number(amount) <= 0) {
      return res.status(400).json({error: "Invalid request"});
    }

    try {
      await db.tx(async (t: any) => {
        await t.none(
          `INSERT INTO wallet_transactions(farmer_id, type, amount, source)
           VALUES($1, 'topup', $2, $3)`,
          [farmer_id, amount, method]
        );

        const walletExists = await t.oneOrNone(
          "SELECT 1 FROM wallets WHERE farmer_id = $1",
          [farmer_id]
        );

        if (walletExists) {
          await t.none(
            `UPDATE wallets
              SET balance = balance + $1, 
              updated_at = NOW() WHERE farmer_id = $2`,
            [amount, farmer_id]
          );
        } else {
          await t.none(
            "INSERT INTO wallets(farmer_id, balance) VALUES ($1, $2)",
            [farmer_id, amount]
          );
        }
      });

      return res.json({success: true});
    } catch (err) {
      console.error("💥 Top-up error:", err);
      return res.status(500).json({error: "Top-up failed"});
    }
  });

  return router;
};
