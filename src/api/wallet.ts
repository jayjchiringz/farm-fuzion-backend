/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable camelcase */
import express from "express";
import pgPromise from "pg-promise";
import {MsimboService} from "../services/MsimboService";
import {ProviderDef} from "../services/msimboClient";

const pgp = pgPromise();

export const getWalletRouter = (dbConfig: any) => {
  const router = express.Router();
  const {PGUSER, PGPASS, PGHOST, PGPORT, PGDB} = dbConfig;

  const msimbo = new MsimboService();

  const db = pgp({
    host: PGHOST,
    port: PGPORT,
    database: PGDB,
    user: PGUSER,
    password: PGPASS,
    ssl: {rejectUnauthorized: false},
  });

  // Get wallet balance
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

  // Unified Get transactions (with optional filters)
  router.get("/:farmerId/transactions", async (req, res) => {
    const {farmerId} = req.params;
    const {type, start, end} = req.query;

    const conditions = ["farmer_id = $1"];
    const params: any[] = [farmerId];
    let i = 2;

    if (type) {
      conditions.push(`type = $${i++}`);
      params.push(type as string);
    }

    if (start) {
      conditions.push(`timestamp >= $${i++}`);
      params.push(start as string);
    }

    if (end) {
      conditions.push(`timestamp <= $${i++}`);
      params.push(end as string);
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    try {
      const txns = await db.any(
        `SELECT * FROM wallet_transactions ${where} ORDER BY timestamp DESC`,
        params
      );
      res.json(txns);
    } catch (err) {
      console.error("💥 Tx fetch error:", err);
      res.status(500).json({error: "Unable to fetch transactions"});
    }
  });

  // Top-up wallet via Msimbo C2B (mocked)
  router.post("/topup/:method", async (req, res) => {
    const {method} = req.params;
    const {farmer_id, amount} = req.body;
    const amt = Number(amount);

    if (!farmer_id || isNaN(amt) || amt <= 0) {
      res.status(400).json({error: "Invalid top-up request"});
      return;
    }

    try {
      // Try to fetch by auth_id
      let farmer = await db.oneOrNone(
        "SELECT id, mobile FROM farmers WHERE auth_id = $1",
        [farmer_id]
      );

      // 🚨 Hard-coded fallback for demo
      if (!farmer) {
        console.warn(`
          ⚠️ Farmer not found by auth_id, using fallback demo farmer.`
        );
        farmer = {id: 1, mobile: "254707098495"}; // default demo farmer row
      } else if (!farmer.mobile) {
        farmer.mobile = "254707098495"; // default mobile if missing
      }

      const farmerDbId = farmer.id;
      const phone_number = farmer.mobile;

      // Mock result
      const result = {
        transaction_id: `MOCK-${Date.now()}`,
        order_id: `TOPUP-${Date.now()}`,
        status: "completed",
        message: "Simulated top-up success",
      };

      await db.tx(async (t) => {
        await t.none(
          `INSERT INTO wallet_transactions
            (farmer_id, type, amount, direction, method, status, meta)
          VALUES ($1, 'topup', $2, 'in', $3, 'completed', $4)`,
          [farmerDbId, amt, method, JSON.stringify(result)]
        );

        const wallet = await t.oneOrNone(
          "SELECT balance FROM wallets WHERE farmer_id = $1",
          [farmerDbId]
        );

        if (wallet) {
          await t.none(
            `UPDATE wallets SET balance = balance + $1, updated_at = NOW()
            WHERE farmer_id = $2`,
            [amt, farmerDbId]
          );
        } else {
          await t.none(
            "INSERT INTO wallets(farmer_id, balance) VALUES ($1, $2)",
            [farmerDbId, amt]
          );
        }
      });

      res.json({success: true, transaction: result, phone_number});
    } catch (err) {
      console.error("💥 Top-up error:", err);
      res.status(500).json({error: "Top-up initiation failed"});
    }
  });

  // Withdraw from wallet with Msimbo
  router.post("/withdraw/:method", async (req, res) => {
    const {method} = req.params;
    const {farmer_id, amount, destination} = req.body;
    const amt = Number(amount);

    if (!farmer_id || !destination || isNaN(amt) || amt <= 0) {
      res.status(400).json({error: "Invalid withdrawal"});
      return;
    }

    try {
      const balance = await db.oneOrNone(
        "SELECT balance FROM wallets WHERE farmer_id = $1",
        [farmer_id]
      );
      if (!balance || Number(balance.balance) < amt) {
        res.status(400).json({error: "Insufficient funds"});
        return;
      }

      const result = await msimbo.b2cPayment({
        customer_id: destination,
        order_id: `WITHDRAW-${Date.now()}`,
        amount: amt.toFixed(2),
        currency: "KES",
        provider_id: ProviderDef.NUMBER_14,
        callback_url: `${process.env.BASE_URL}/wallet/callback`,
      });

      await db.tx(async (t) => {
        await t.none(
          `INSERT INTO wallet_transactions
            (farmer_id, type, amount, destination, direction, method,
            status, meta)
          VALUES ($1, 'withdraw', $2, $3, 'out', $4, 'pending', $5)`,
          [farmer_id, amt, destination, method, JSON.stringify(result)]
        );

        await t.none(
          `UPDATE wallets SET balance = balance - $1, updated_at = NOW()
          WHERE farmer_id = $2`,
          [amt, farmer_id]
        );
      });

      res.json({success: true, transaction: result});
    } catch (err) {
      if (
        typeof err === "object" &&
        err !== null &&
        "response" in err &&
        (err as any).response?.data
      ) {
        console.error("💥 Withdraw error:", (err as any).response.data);
      } else {
        console.error("💥 Withdraw error:", err);
      }
      res.status(500).json({error: "Withdrawal failed"});
    }
  });

  // 🔁 Transfer funds between farmers
  router.post("/transfer", async (req, res) => {
    const {farmer_id, destination, amount} = req.body;
    const amt = Number(amount);

    if (!farmer_id || !destination || isNaN(amt) || amt <= 0) {
      res.status(400).json({error: "Invalid transfer request"});
      return;
    }

    try {
      const senderWallet = await db.oneOrNone(
        "SELECT balance FROM wallets WHERE farmer_id = $1",
        [farmer_id]
      );

      if (!senderWallet || Number(senderWallet.balance) < amt) {
        res.status(400).json({error: "Insufficient balance"});
        return;
      }

      await db.tx(async (t) => {
        await t.none(
          `INSERT INTO wallet_transactions
            (farmer_id, type, amount, destination, direction, method, status)
          VALUES ($1, 'transfer', $2, $3, 'out', 'wallet', 'completed')`,
          [farmer_id, amt, destination]
        );

        await t.none(
          `UPDATE wallets SET balance = balance - $1, updated_at = NOW()
            WHERE farmer_id = $2`,
          [amt, farmer_id]
        );

        await t.none(
          `INSERT INTO wallet_transactions
            (farmer_id, type, amount, source, direction, method, status)
          VALUES ($1, 'transfer', $2, $3, 'in', 'wallet', 'completed')`,
          [destination, amt, farmer_id]
        );

        const destWallet = await t.oneOrNone(
          "SELECT 1 FROM wallets WHERE farmer_id = $1",
          [destination]
        );

        if (destWallet) {
          await t.none(
            `UPDATE wallets SET balance = balance + $1, updated_at = NOW()
              WHERE farmer_id = $2`,
            [amt, destination]
          );
        } else {
          await t.none(
            "INSERT INTO wallets(farmer_id, balance) VALUES ($1, $2)",
            [destination, amt]
          );
        }
      });

      res.json({success: true});
    } catch (err) {
      console.error("💥 Transfer error:", err);
      res.status(500).json({error: "Transfer failed"});
    }
  });

  // 🧾 PayBill or BuyGoods
  router.post("/paybill", async (req, res) => {
    const {farmer_id, destination, amount} = req.body;
    const amt = Number(amount);

    if (!farmer_id || !destination || isNaN(amt) || amt <= 0) {
      res.status(400).json({error: "Invalid payment request"});
      return;
    }

    try {
      const current = await db.oneOrNone(
        "SELECT balance FROM wallets WHERE farmer_id = $1",
        [farmer_id]
      );

      if (!current || Number(current.balance) < amt) {
        res.status(400).json({error: "Insufficient funds"});
        return;
      }

      await db.tx(async (t) => {
        await t.none(
          `INSERT INTO wallet_transactions
            (farmer_id, type, amount, destination, direction,
            method, status, meta)
          VALUES ($1, 'paybill', $2, $3, 'out', 'paybill', 'completed', $4)`,
          // eslint-disable-next-line max-len
          [farmer_id, amt, destination, JSON.stringify({purpose: "bill payment"})]
        );

        await t.none(
          `UPDATE wallets SET balance = balance - $1, updated_at = NOW()
          WHERE farmer_id = $2`,
          [amt, farmer_id]
        );
      });

      res.json({success: true});
    } catch (err) {
      console.error("💥 PayBill error:", err);
      res.status(500).json({error: "PayBill failed"});
    }
  });

  // Wallet summary
  router.get("/:farmerId/summary", async (req, res) => {
    const {farmerId} = req.params;

    try {
      const [topups, withdrawals] = await Promise.all([
        db.oneOrNone(
          `SELECT COALESCE(SUM(amount),0) as total FROM wallet_transactions
          WHERE farmer_id = $1 AND type = 'topup'`,
          [farmerId]
        ),
        db.oneOrNone(
          `SELECT COALESCE(SUM(amount),0) as total FROM wallet_transactions
          WHERE farmer_id = $1 AND type = 'withdraw'`,
          [farmerId]
        ),
      ]);

      res.json({
        totalTopups: topups?.total ?? 0,
        totalWithdrawals: withdrawals?.total ?? 0,
      });
    } catch (err) {
      console.error("💥 Summary error:", err);
      res.status(500).json({error: "Unable to summarize transactions"});
    }
  });

  // Payment callback
  router.post("/callback", async (req, res) => {
    try {
      const {transaction_id, order_id, status, farmer_id} = req.body;

      await db.none(
        `UPDATE wallet_transactions
        SET status = $1, updated_at = NOW()
        WHERE meta->>'transaction_id' = $2
          AND meta->>'order_id' = $3
          AND farmer_id = $4`,
        [status, transaction_id, order_id, farmer_id]
      );

      res.json({success: true});
    } catch (err) {
      console.error("💥 Callback error:", err);
      res.status(500).json({error: "Callback processing failed"});
    }
  });

  return router;
};
