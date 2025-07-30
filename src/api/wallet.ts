/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-var-requires */
/* eslint-disable camelcase */
import express from "express";

export const getWalletRouter = (dbConfig: any) => {
  const router = express.Router();
  const {PGUSER, PGPASS, PGHOST, PGPORT, PGDB} = dbConfig;

  const pgp = require("pg-promise")();
  const db = pgp({
    host: PGHOST,
    port: PGPORT,
    database: PGDB,
    user: PGUSER,
    password: PGPASS,
  });

  router.get("/:farmerId/balance", async (req, res) => {
    const {farmerId} = req.params;
    try {
      const wallet = await db.oneOrNone(
        "SELECT balance FROM wallets WHERE farmer_id = $1", [farmerId]
      );
      res.json({balance: wallet?.balance ?? 0});
    } catch (err) {
      console.error("💥 Balance fetch error:", err);
      res.status(500).json({error: "Unable to fetch wallet balance"});
    }
  });

  router.get("/:farmerId/transactions", async (req, res) => {
    const {farmerId} = req.params;
    try {
      const txns = await db.any(
        `SELECT *
            FROMwallet_transactions
            WHERE farmer_id = $1 ORDER BY timestamp DESC`,
        [farmerId]);
      res.json(txns);
    } catch (err) {
      console.error("💥 Tx fetch error:", err);
      res.status(500).json({error: "Unable to fetch transactions"});
    }
  });

  router.post("/topup/:method", async (req, res) => {
    const {method} = req.params;
    /* const {farmer_id, phone, amount} = req.body;*/
    const {farmer_id, amount} = req.body;

    try {
      await db.tx(async (t: any) => {
        await t.none(
          `INSERT INTO wallet_transactions(
                farmer_id, type, amount, source) VALUES($1, 'topup', $2, $3)`,
          [farmer_id, amount, method]);
        await t.none(
          "UPDATE wallets SET balance = balance + $1 WHERE farmer_id = $2",
          [amount, farmer_id]);
      });

      res.json({success: true});
    } catch (err) {
      console.error("💥 Top-up error:", err);
      res.status(500).json({error: "Top-up failed"});
    }
  });

  return router;
};
