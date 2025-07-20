/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
// functions/src/api/wallet.ts
import express from "express";

export const getWalletRouter = (dbConfig?: any) => {
  const router = express.Router();

  router.get("/:walletId/transactions", async (req, res) => {
    try {
      const {walletId} = req.params;

      // Replace with real DB query
      const transactions = [
        {id: 1, type: "credit", amount: 1000,
          timestamp: new Date().toISOString()},
        {id: 2, type: "debit", amount: 200,
          timestamp: new Date().toISOString()},
      ];

      return res.status(200).json({walletId, transactions});
    } catch (err) {
      console.error("❌ Fetch transactions error:", err);
      return res.status(500).json({error: "Failed to fetch transactions"});
    }
  });

  router.get("/:walletId/balance", async (req, res) => {
    try {
      const {walletId} = req.params;

      // Replace with real DB logic
      const balance = 800;

      return res.status(200).json({walletId, balance});
    } catch (err) {
      console.error("❌ Fetch balance error:", err);
      return res.status(500).json({error: "Failed to fetch balance"});
    }
  });

  return router;
};
