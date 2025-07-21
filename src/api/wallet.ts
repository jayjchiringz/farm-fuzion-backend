/* eslint-disable @typescript-eslint/no-explicit-any */
import express from "express";
import {Pool} from "pg";

export const getWalletRouter = (dbConfig: any) => {
  const router = express.Router();
  const pool = new Pool(dbConfig);

  // ✅ Get wallet balance
  router.get("/:walletId/balance", async (req, res) => {
    const {walletId} = req.params;
    try {
      const result = await pool.query(
        "SELECT balance FROM wallet WHERE id = $1",
        [walletId]
      );

      if (result.rowCount === 0) {
        return res.status(404).json({error: "Wallet not found"});
      }

      return res.status(200).json({
        walletId,
        balance: result.rows[0].balance,
      });
    } catch (err) {
      console.error("❌ Fetch balance error:", err);
      return res.status(500).json({error: "Failed to fetch balance"});
    }
  });

  // ✅ Get wallet transactions
  router.get("/:walletId/transactions", async (req, res) => {
    const {walletId} = req.params;
    try {
      const result = await pool.query(
        `SELECT id, type, amount, metadata, timestamp 
         FROM wallet_transaction 
         WHERE wallet_id = $1 
         ORDER BY timestamp DESC`,
        [walletId]
      );

      return res.status(200).json({
        walletId,
        transactions: result.rows,
      });
    } catch (err) {
      console.error("❌ Fetch transactions error:", err);
      return res.status(500).json({error: "Failed to fetch transactions"});
    }
  });

  return router;
};
