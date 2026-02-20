/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable camelcase */
import express from "express";
import pgPromise from "pg-promise";
// import {MsimboService} from "../services/MsimboService";
// import {ProviderDef} from "../services/msimboClient";

const pgp = pgPromise();

// Helper to resolve farmerId (accepts both UUID and numeric)
async function resolveFarmerId(db: any, farmerId: string | number): Promise<string> {
  const normalized = String(farmerId);
  console.log("🔍 Resolving farmerId:", normalized);

  // If direct match works
  const exists = await db.oneOrNone(
    "SELECT 1 FROM wallet_transactions WHERE farmer_id::text = $1 LIMIT 1",
    [normalized]
  );
  if (exists) {
    console.log("✅ Direct match found:", normalized);
    return normalized;
  }

  // Try mapping via farmers table
  const farmer = await db.oneOrNone(
    "SELECT id FROM farmers WHERE id::text = $1 OR auth_id::text = $1 OR user_id::text = $1",
    [normalized]
  );
  if (farmer) {
    console.log("✅ Mapped to farmer.id:", farmer.id);
    return String(farmer.id);
  }

  console.warn("⚠️ No match found for", farmerId, "→ falling back to '1'");
  return "1";
}

export const getWalletRouter = async (dbConfig: any) => {
  const router = express.Router();
  const {PGUSER, PGPASS, PGHOST, PGPORT, PGDB} = dbConfig;

  // const msimbo = new MsimboService();

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
      const resolvedId = await resolveFarmerId(db, farmerId);

      const result = await db.one(
        `
        SELECT 
          COALESCE(SUM(
            CASE 
              WHEN direction = 'in' AND status = 'completed' THEN amount
              WHEN direction = 'out' AND status = 'completed' THEN -amount
              ELSE 0
            END
          ), 0) AS balance
        FROM wallet_transactions
        WHERE farmer_id = $1
        `,
        [resolvedId]
      );

      res.json({balance: Number(result.balance)});
    } catch (err) {
      console.error("💥 Balance fetch error:", err);
      res.status(500).json({error: "Unable to fetch wallet balance"});
    }
  });

  // Unified Get transactions
  router.get("/:farmerId/transactions", async (req, res) => {
    const {farmerId} = req.params;
    const {type, start, end} = req.query;

    try {
      const resolvedId = await resolveFarmerId(db, farmerId);

      const conditions = ["farmer_id = $1"];
      const params: any[] = [resolvedId];
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

      const where = conditions.length ? `
        WHERE ${conditions.join(" AND ")}` : "";

      const txns = await db.any(
        `SELECT * FROM wallet_transactions ${where} ORDER BY timestamp DESC`,
        params
      );

      console.log("📦 Raw txns from DB:", txns); // 👈 add this

      res.json(
        txns.map((t: any, idx: number) => ({
          id: t.id || `row-${idx}`, // 👈 fallback if missing
          ...t,
          amount: Number(t.amount),
        }))
      );
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
      // ✅ Resolve farmerId to match DB primary key
      const resolvedId = await resolveFarmerId(db, farmer_id);

      // Fetch farmer record (use resolved id)
      let farmer = await db.oneOrNone(
        `SELECT id, COALESCE(mobile, '254707098495') as mobile
        FROM farmers WHERE id = $1`,
        [resolvedId]
      );

      if (!farmer) {
        console.warn("⚠️ Farmer not found, using demo fallback");
        farmer = {id: resolvedId, mobile: "254707098495"};
      }

      const farmerDbId = String(farmer.id);
      const phone_number = farmer.mobile;

      const result = {
        transaction_id: `MOCK-${Date.now()}`,
        order_id: `TOPUP-${Date.now()}`,
        status: "completed",
        message: "Simulated top-up success",
      };

      // Record transaction + update balance
      console.log("💸 Starting top-up:", {farmerDbId, amt, method});
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
            `UPDATE wallets
            SET balance = balance + $1, updated_at = NOW()
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

  // Withdraw from wallet with Msimbo (mocked)
  router.post("/withdraw/:method", async (req, res) => {
    const {method} = req.params;
    const {farmer_id, amount, destination} = req.body;
    const amt = Number(amount);

    if (!farmer_id || !destination || isNaN(amt) || amt <= 0) {
      res.status(400).json({error: "Invalid withdrawal"});
      return;
    }

    try {
      const resolvedId = await resolveFarmerId(db, farmer_id);

      const balance = await db.oneOrNone(
        "SELECT balance FROM wallets WHERE farmer_id = $1",
        [resolvedId]
      );

      if (!balance || Number(balance.balance) < amt) {
        res.status(400).json({error: "Insufficient funds"});
        return;
      }

      const result = {
        transaction_id: `MOCK-WITHDRAW-${Date.now()}`,
        order_id: `WITHDRAW-${Date.now()}`,
        amount: amt.toFixed(2),
        currency: "KES",
        status: "pending",
        message: "Mocked withdrawal initiated",
        destination,
        method,
      };

      console.log("💸 [MOCK] Starting withdrawal:", {resolvedId, amt, method});

      await db.tx(async (t) => {
        await t.none(
          `INSERT INTO wallet_transactions
            (farmer_id, type, amount, destination, direction, method,
            status, meta)
          VALUES ($1, 'withdraw', $2, $3, 'out', $4, 'pending', $5)`,
          [resolvedId, amt, destination, method, JSON.stringify(result)]
        );

        await t.none(
          `UPDATE wallets
          SET balance = balance - $1, updated_at = NOW()
          WHERE farmer_id = $2`,
          [amt, resolvedId]
        );
      });

      // 🔁 Auto-trigger mock callback after 2s
      setTimeout(async () => {
        try {
          await db.none(
            `UPDATE wallet_transactions
            SET status = 'completed',
                meta = jsonb_set(meta, '{status}', '"completed"')
            WHERE meta->>'transaction_id' = $1
              AND meta->>'order_id' = $2
              AND farmer_id = $3`,
            [result.transaction_id, result.order_id, resolvedId]
          );
          console.log("✅ [MOCK] Withdrawal completed:", result.transaction_id);
        } catch (err) {
          console.error("💥 [MOCK] Callback update failed:", err);
        }
      }, 2000);

      res.json({success: true, transaction: result});
    } catch (err) {
      console.error("💥 Withdraw error:", err);
      res.status(500).json({error: "Withdrawal failed"});
    }
  });

  // 🔁 Transfer funds between farmers
  // a. Search for a farmer by name, phone, or ID
  router.get("/search-farmers", async (req, res) => {
    const {q} = req.query; // the search query

    if (!q || typeof q !== "string") {
      res.status(400).json({error: "Missing search query"});
      return;
    }

    try {
      const farmers = await db.any(
        `SELECT id, first_name, middle_name, last_name, mobile
        FROM farmers
        WHERE id::text = $1
            OR user_id::text = $1
            OR auth_id::text = $1
            OR mobile ILIKE $2
            OR first_name ILIKE $2
            OR middle_name ILIKE $2
            OR last_name ILIKE $2`,
        [q, `%${q}%`]
      );

      res.json(farmers);
    } catch (err) {
      console.error("💥 Search error:", err);
      res.status(500).json({error: "Failed to search farmers"});
    }
  });

  // b. Mocked transfer with confirmation
  router.post("/transfer", async (req, res) => {
    const {farmer_id, destination, amount, confirm} = req.body;
    const amt = Number(amount);

    if (!farmer_id || !destination || isNaN(amt) || amt <= 0) {
      res.status(400).json({error: "Invalid transfer request"});
      return;
    }

    try {
      // ✅ Normalize both sender + recipient IDs
      const senderId = await resolveFarmerId(db, farmer_id);
      const recipientId = await resolveFarmerId(db, destination);

      // Check sender balance
      const senderWallet = await db.oneOrNone(
        "SELECT balance FROM wallets WHERE farmer_id = $1",
        [senderId]
      );

      if (!senderWallet || Number(senderWallet.balance) < amt) {
        res.status(400).json({error: "Insufficient balance"});
        return;
      }

      // Step 1: Preview (no confirm yet)
      if (!confirm) {
        const destFarmer = await db.oneOrNone(
          `SELECT id, first_name, middle_name, last_name, mobile
          FROM farmers WHERE id = $1`,
          [recipientId]
        );

        if (!destFarmer) {
          res.status(404).json({error: "Recipient not found"});
          return;
        }

        res.json({
          preview: true,
          from: senderId,
          to: destFarmer,
          amount: amt,
          message: `Confirm transfer of ${amt} KES to ${destFarmer.first_name} ${destFarmer.last_name} (${destFarmer.mobile})`,
        });
        return;
      }

      // Step 2: Execute after confirm
      await db.tx(async (t) => {
        // sender → debit
        await t.none(
          `INSERT INTO wallet_transactions
            (farmer_id, type, amount, destination, direction, method, status, meta)
          VALUES ($1, 'transfer', $2, $3, 'out', 'wallet', 'completed', $4)`,
          [senderId, amt, recipientId, JSON.stringify({mock: true})]
        );

        await t.none(
          `UPDATE wallets SET balance = balance - $1, updated_at = NOW()
          WHERE farmer_id = $2`,
          [amt, senderId]
        );

        // receiver → credit
        await t.none(
          `INSERT INTO wallet_transactions
            (farmer_id, type, amount, source, direction, method, status, meta)
          VALUES ($1, 'transfer', $2, $3, 'in', 'wallet', 'completed', $4)`,
          [recipientId, amt, senderId, JSON.stringify({mock: true})]
        );

        const destWallet = await t.oneOrNone(
          "SELECT 1 FROM wallets WHERE farmer_id = $1",
          [recipientId]
        );

        if (destWallet) {
          await t.none(
            `UPDATE wallets SET balance = balance + $1, updated_at = NOW()
            WHERE farmer_id = $2`,
            [amt, recipientId]
          );
        } else {
          await t.none(
            "INSERT INTO wallets(farmer_id, balance) VALUES ($1, $2)",
            [recipientId, amt]
          );
        }
      });

      res.json({success: true, executed: true});
    } catch (err) {
      console.error("💥 Transfer error:", err);
      res.status(500).json({error: "Transfer failed"});
    }
  });

  // In wallet.ts - USE 'transfer' INSTEAD OF 'payment'
  router.post("/payment", async (req, res) => {
    console.log("💰 [WALLET] Payment request received");

    const {farmer_id, amount, destination} = req.body;
    const amt = Number(amount);

    if (!farmer_id || !destination || isNaN(amt) || amt <= 0) {
      return res.status(400).json({
        success: false,
        error: "Invalid payment request",
      });
    }

    try {
      const payerId = await resolveFarmerId(db, farmer_id);
      const recipientId = await resolveFarmerId(db, destination);

      // Check balance
      const payerWallet = await db.oneOrNone(
        "SELECT balance FROM wallets WHERE farmer_id = $1",
        [payerId]
      );

      if (!payerWallet || Number(payerWallet.balance) < amt) {
        return res.status(400).json({
          success: false,
          error: "Insufficient funds",
        });
      }

      const transactionId = `PAY-${Date.now()}`;

      await db.tx(async (t) => {
        // Debit payer - USE 'transfer' (allowed)
        await t.none(
          `INSERT INTO wallet_transactions
            (farmer_id, type, amount, destination, direction, method, status)
          VALUES ($1, 'transfer', $2, $3, 'out', 'wallet', 'completed')`,
          [payerId, amt, recipientId]
        );

        await t.none(
          "UPDATE wallets SET balance = balance - $1 WHERE farmer_id = $2",
          [amt, payerId]
        );

        // Credit recipient - USE 'transfer' (allowed)
        await t.none(
          `INSERT INTO wallet_transactions
            (farmer_id, type, amount, source, direction, method, status)
          VALUES ($1, 'transfer', $2, $3, 'in', 'wallet', 'completed')`,
          [recipientId, amt, payerId]
        );

        await t.none(
          "UPDATE wallets SET balance = balance + $1 WHERE farmer_id = $2",
          [amt, recipientId]
        );
      });

      console.log("✅ [WALLET] Payment successful");
      return res.json({
        success: true,
        transaction: {
          id: transactionId,
          type: "transfer",
          amount: amt,
          from: payerId,
          to: recipientId,
        },
      });
    } catch (err) {
      console.error("💥 [WALLET] Payment error:", err);
      return res.status(500).json({
        success: false,
        error: "Payment failed",
      });
    }
  });

  // Wallet summary
  router.get("/:farmerId/summary", async (req, res) => {
    const {farmerId} = req.params;

    try {
      const resolvedId = await resolveFarmerId(db, farmerId);

      const [topups, withdrawals] = await Promise.all([
        db.oneOrNone(
          `SELECT COALESCE(SUM(amount),0) as total FROM wallet_transactions
          WHERE farmer_id = $1 AND type = 'topup'`,
          [resolvedId]
        ),
        db.oneOrNone(
          `SELECT COALESCE(SUM(amount),0) as total FROM wallet_transactions
          WHERE farmer_id = $1 AND type = 'withdraw'`,
          [resolvedId]
        ),
      ]);

      res.json({
        totalTopups: Number(topups?.total ?? 0),
        totalWithdrawals: Number(withdrawals?.total ?? 0),
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
        SET status = $1,
            meta = jsonb_set(meta, '{status}', to_jsonb($1::text))
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
