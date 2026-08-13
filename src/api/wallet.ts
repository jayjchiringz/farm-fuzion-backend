// src/api/wallet.ts
/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable camelcase */
import express from "express";
import pgPromise from "pg-promise";
import { UnipesaService } from "../services/UnipesaService";

const pgp = pgPromise();

// Helper to resolve farmerId (accepts both UUID and numeric)
async function resolveFarmerId(db: any, farmerId: string | number): Promise<string> {
  const normalized = String(farmerId);
  console.log("🔍 [resolveFarmerId] Input:", normalized);

  // Check if it's a UUID
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (uuidRegex.test(normalized)) {
    console.log("🟢 Input is UUID, looking up numeric ID...");
    const farmer = await db.oneOrNone(
      "SELECT id FROM farmers WHERE user_id::text = $1",
      [normalized]
    );
    if (farmer) {
      console.log("✅ Resolved UUID to numeric ID:", farmer.id);
      return String(farmer.id);
    }
    console.log("⚠️ UUID not found in farmers table, using as-is");
    return normalized;
  }

  if (!isNaN(Number(normalized))) {
    console.log("🟢 Input is numeric ID:", normalized);
    return normalized;
  }

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

// Helper to get farmer's phone number from DB
async function getFarmerPhone(db: any, farmerId: string): Promise<string> {
  const farmer = await db.oneOrNone(
    "SELECT mobile FROM farmers WHERE id = $1",
    [farmerId]
  );
  return farmer?.mobile || null;
}

// Helper to get farmer details
async function getFarmerDetails(db: any, farmerId: string): Promise<any> {
  return await db.oneOrNone(
    "SELECT id, first_name, last_name, mobile FROM farmers WHERE id = $1",
    [farmerId]
  );
}

// Helper to map Unipesa transaction to our format
function mapUnipesaTransaction(tx: any) {
  return {
    id: tx.transactionId,
    type: tx.type === 'topup' ? 'topup' : 
          tx.type === 'transfer_wallet' ? 'transfer' : 
          tx.type === 'transfer_external' ? 'withdraw' : 'payment',
    amount: parseFloat(tx.amount),
    transaction_type: tx.type === 'topup' ? 'Received' : 
                      tx.type === 'transfer_wallet' ? 'Transfer' : 'Payment',
    direction: tx.type === 'topup' ? 'in' : 'out',
    source: tx.counterparty?.source || 'unknown',
    destination: tx.counterparty?.destination || 'unknown',
    status: tx.status,
    fee: parseFloat(tx.fee || '0'),
    reference: tx.transactionId,
    meta: tx.counterparty || {},
    created_at: tx.createdAt || new Date().toISOString(),
    completed_at: tx.completedAt || null,
    description: `${tx.type} transaction`,
  };
}

export const getWalletRouter = async (dbConfig: any, unipesaConfig: any) => {
  const router = express.Router();
  const { PGUSER, PGPASS, PGHOST, PGPORT, PGDB } = dbConfig;

  const db = pgp({
    host: PGHOST,
    port: PGPORT,
    database: PGDB,
    user: PGUSER,
    password: PGPASS,
    ssl: { rejectUnauthorized: false },
  });

  // Initialize Unipesa service
  const unipesa = new UnipesaService(unipesaConfig);

  // Store user sessions (in production, use Redis or similar)
  const userSessions = new Map<string, { 
    unipesa: UnipesaService; 
    farmerId: string;
    userId?: string; // Unipesa user ID
  }>();

  // ==================== AUTHENTICATION ENDPOINTS ====================

  /**
   * Authenticate a farmer with Unipesa
   * POST /wallet/auth/pin
   */
  router.post("/auth/pin", async (req, res) => {
    const { farmerId, pin } = req.body;

    if (!farmerId || !pin) {
      return res.status(400).json({ error: "Farmer ID and PIN required" });
    }

    try {
      const resolvedId = await resolveFarmerId(db, farmerId);
      const phone = await getFarmerPhone(db, resolvedId);

      if (!phone) {
        return res.status(404).json({ error: "Farmer phone number not found" });
      }

      // Authenticate with Unipesa
      const tokens = await unipesa.signInWithPin(phone, pin);

      // Get the Unipesa user ID from profile
      const profile = await unipesa.getProfile();
      const account = await unipesa.getAccountInfo();

      // Store session
      userSessions.set(resolvedId, {
        unipesa: unipesa,
        farmerId: resolvedId,
        userId: account.id,
      });

      res.json({
        success: true,
        message: "Authenticated successfully",
        tokens: {
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
        },
        user: {
          unipesaUserId: account.id,
          phone: phone,
        },
      });
    } catch (err) {
      console.error("💥 Auth error:", err);
      res.status(401).json({ 
        success: false, 
        error: "Authentication failed",
        details: err instanceof Error ? err.message : "Unknown error",
      });
    }
  });

  /**
   * Send OTP for PIN setup/reset
   * POST /wallet/auth/otp/send
   */
  router.post("/auth/otp/send", async (req, res) => {
    const { farmerId } = req.body;

    try {
      const resolvedId = await resolveFarmerId(db, farmerId);
      const phone = await getFarmerPhone(db, resolvedId);

      if (!phone) {
        return res.status(404).json({ error: "Farmer phone number not found" });
      }

      const result = await unipesa.sendOTP(phone);
      res.json({
        success: true,
        otpId: result.otpId,
        expiresIn: result.expiresIn,
      });
    } catch (err) {
      console.error("💥 Send OTP error:", err);
      res.status(500).json({
        success: false,
        error: "Failed to send OTP",
        details: err instanceof Error ? err.message : "Unknown error",
      });
    }
  });

  /**
   * Verify OTP and set PIN
   * POST /wallet/auth/otp/verify-and-set-pin
   */
  router.post("/auth/otp/verify-and-set-pin", async (req, res) => {
    const { otpId, code, newPin } = req.body;

    if (!otpId || !code || !newPin) {
      return res.status(400).json({ error: "OTP ID, code, and new PIN required" });
    }

    try {
      // Verify OTP
      const verification = await unipesa.verifyOTP(otpId, code);
      
      if (!verification.verified) {
        return res.status(400).json({ 
          success: false, 
          error: "Invalid OTP code" 
        });
      }

      // Set new PIN
      await unipesa.setPin(otpId, newPin);
      
      res.json({
        success: true,
        message: "PIN set successfully",
      });
    } catch (err) {
      console.error("💥 Verify OTP error:", err);
      res.status(500).json({
        success: false,
        error: "Failed to verify OTP and set PIN",
        details: err instanceof Error ? err.message : "Unknown error",
      });
    }
  });

  /**
   * Change PIN using current PIN
   * PUT /wallet/auth/pin/change
   */
  router.put("/auth/pin/change", async (req, res) => {
    const { farmerId, currentPin, newPin } = req.body;

    if (!farmerId || !currentPin || !newPin) {
      return res.status(400).json({ error: "Farmer ID, current PIN, and new PIN required" });
    }

    try {
      const resolvedId = await resolveFarmerId(db, farmerId);
      
      // Get or create Unipesa session
      let session = userSessions.get(resolvedId);
      if (!session) {
        const phone = await getFarmerPhone(db, resolvedId);
        if (!phone) {
          return res.status(404).json({ error: "Farmer phone number not found" });
        }
        const tokens = await unipesa.signInWithPin(phone, currentPin);
        const account = await unipesa.getAccountInfo();
        session = { unipesa, farmerId: resolvedId, userId: account.id };
        userSessions.set(resolvedId, session);
      }

      await session.unipesa.changePin(currentPin, newPin);
      
      res.json({
        success: true,
        message: "PIN changed successfully",
      });
    } catch (err) {
      console.error("💥 Change PIN error:", err);
      res.status(500).json({
        success: false,
        error: "Failed to change PIN",
        details: err instanceof Error ? err.message : "Unknown error",
      });
    }
  });

  /**
   * Refresh access token
   * POST /wallet/auth/refresh
   */
  router.post("/auth/refresh", async (req, res) => {
    const { farmerId } = req.body;

    try {
      const resolvedId = await resolveFarmerId(db, farmerId);
      const session = userSessions.get(resolvedId);

      if (!session) {
        return res.status(401).json({ error: "No active session" });
      }

      const newToken = await session.unipesa.refreshAccessToken();
      
      res.json({
        success: true,
        accessToken: newToken,
      });
    } catch (err) {
      console.error("💥 Refresh token error:", err);
      res.status(401).json({
        success: false,
        error: "Failed to refresh token",
        details: err instanceof Error ? err.message : "Unknown error",
      });
    }
  });

  /**
   * Logout - clear session
   * POST /wallet/auth/logout
   */
  router.post("/auth/logout", async (req, res) => {
    const { farmerId } = req.body;

    try {
      const resolvedId = await resolveFarmerId(db, farmerId);
      const session = userSessions.get(resolvedId);
      
      if (session) {
        session.unipesa.logout();
        userSessions.delete(resolvedId);
      }

      res.json({
        success: true,
        message: "Logged out successfully",
      });
    } catch (err) {
      console.error("💥 Logout error:", err);
      res.status(500).json({
        success: false,
        error: "Failed to logout",
      });
    }
  });

  // ==================== USER REGISTRATION ====================

  /**
   * Register a farmer's wallet with Unipesa
   * POST /wallet/register
   */
  router.post("/register", async (req, res) => {
    const { farmerId, pin } = req.body;

    if (!farmerId || !pin) {
      return res.status(400).json({ error: "Farmer ID and PIN required" });
    }

    try {
      const resolvedId = await resolveFarmerId(db, farmerId);
      const farmer = await getFarmerDetails(db, resolvedId);

      if (!farmer) {
        return res.status(404).json({ error: "Farmer not found" });
      }

      if (!farmer.mobile) {
        return res.status(400).json({ error: "Farmer has no phone number" });
      }

      // First, register the user with Unipesa
      const user = await unipesa.registerUser({
        phoneNumber: farmer.mobile,
        firstName: farmer.first_name || 'FarmFuzion',
        lastName: farmer.last_name || 'User',
        externalUserId: resolvedId,
        countryCode: 'KE',
      });

      // Then set their PIN
      // Note: We need an OTP flow here - send OTP first, then set PIN
      // This is a simplified version - in production, you'd want a full OTP flow
      
      // Send OTP
      const otpResult = await unipesa.sendOTP(farmer.mobile);
      
      // In a real implementation, you'd have the user verify the OTP
      // For now, we'll return the OTP ID so the frontend can handle verification

      res.json({
        success: true,
        message: "Wallet registered successfully",
        unipesaUserId: user.userId,
        walletId: user.wallet.walletId,
        otpId: otpResult.otpId,
        requiresOtpVerification: true,
      });
    } catch (err) {
      console.error("💥 Register wallet error:", err);
      res.status(500).json({
        success: false,
        error: "Failed to register wallet",
        details: err instanceof Error ? err.message : "Unknown error",
      });
    }
  });

  // ==================== WALLET ENDPOINTS (OpenAPI v1 compatible) ====================

  /**
   * Get wallet balance from Unipesa
   * GET /wallet/:farmerId/balance
   */
  router.get("/:farmerId/balance", async (req, res) => {
    const { farmerId } = req.params;
    console.log("🔵 [WALLET] Balance request for farmer:", farmerId);

    try {
      const resolvedId = await resolveFarmerId(db, farmerId);
      const session = userSessions.get(resolvedId);

      if (!session) {
        return res.status(401).json({ error: "Not authenticated with Unipesa" });
      }

      if (!session.userId) {
        // If we don't have the Unipesa user ID, try to get it
        const account = await session.unipesa.getAccountInfo();
        session.userId = account.id;
      }

      // Use the proper balance API
      const balance = await session.unipesa.getWalletBalance(session.userId);

      console.log("🟢 [WALLET] Balance result:", balance);
      res.json({
        success: true,
        walletId: balance.walletId,
        balance: parseFloat(balance.available),
        currency: balance.currency,
      });
    } catch (err) {
      console.error("💥 [WALLET] Balance fetch error:", err);
      res.status(500).json({ 
        error: "Unable to fetch wallet balance",
        details: err instanceof Error ? err.message : "Unknown error",
      });
    }
  });

  /**
   * Get transactions from Unipesa
   * GET /wallet/:farmerId/transactions
   */
  router.get("/:farmerId/transactions", async (req, res) => {
    const { farmerId } = req.params;
    const { limit = 50, offset = 0, status, type } = req.query;

    try {
      const resolvedId = await resolveFarmerId(db, farmerId);
      const session = userSessions.get(resolvedId);

      if (!session) {
        return res.status(401).json({ error: "Not authenticated with Unipesa" });
      }

      if (!session.userId) {
        const account = await session.unipesa.getAccountInfo();
        session.userId = account.id;
      }

      // Fetch transactions from Unipesa using the proper API
      const result = await session.unipesa.getUserTransactions(session.userId, {
        limit: parseInt(limit as string),
        offset: parseInt(offset as string),
      });

      // Map to our format
      const transactions = result.items.map(mapUnipesaTransaction);

      // Get current balance
      const balance = await session.unipesa.getWalletBalance(session.userId);

      console.log(`Found ${transactions.length} transactions for farmer ${resolvedId}`);

      return res.json({
        success: true,
        balance: parseFloat(balance.available),
        transactions,
        pagination: {
          total: result.total,
          limit: parseInt(limit as string),
          offset: parseInt(offset as string),
        },
      });
    } catch (err) {
      console.error("💥 Error fetching transactions:", err);
      return res.status(500).json({
        success: false,
        error: "Failed to fetch transactions",
        details: err instanceof Error ? err.message : "Unknown error",
      });
    }
  });

  // ==================== PAYMENTS ====================

  /**
   * Top up a user wallet
   * POST /wallet/topup/:method
   */
  router.post("/topup/:method", async (req, res) => {
    const { method } = req.params;
    const { farmer_id, amount } = req.body;
    const amt = Number(amount);

    if (!farmer_id || isNaN(amt) || amt <= 0) {
      return res.status(400).json({ error: "Invalid top-up request" });
    }

    try {
      const resolvedId = await resolveFarmerId(db, farmer_id);
      const session = userSessions.get(resolvedId);

      if (!session) {
        return res.status(401).json({ error: "Not authenticated with Unipesa" });
      }

      if (!session.userId) {
        const account = await session.unipesa.getAccountInfo();
        session.userId = account.id;
      }

      // Create top-up using the proper API
      const topup = await session.unipesa.createTopup({
        userId: session.userId,
        amount: amt.toFixed(2),
        currency: 'KES',
        method: method.toUpperCase(),
      });

      // Record in local DB
      const reference_no = topup.transactionId || topup.id;
      await db.none(
        `INSERT INTO wallet_transactions
          (farmer_id, type, amount, direction, method, status, meta, reference_no)
        VALUES ($1, 'topup', $2, 'in', $3, $4, $5, $6)`,
        [
          resolvedId,
          amt,
          method,
          topup.status,
          JSON.stringify({
            unipesaTransactionId: topup.transactionId,
            method,
          }),
          reference_no,
        ]
      );

      res.json({
        success: true,
        transaction: {
          reference: reference_no,
          unipesaId: topup.transactionId,
          amount: amt,
          status: topup.status,
        },
      });
    } catch (err) {
      console.error("💥 Top-up error:", err);
      res.status(500).json({
        success: false,
        error: "Top-up failed",
        details: err instanceof Error ? err.message : "Unknown error",
      });
    }
  });

  /**
   * Transfer funds using Unipesa (wallet-to-wallet or wallet-to-external)
   * POST /wallet/transfer
   */
  router.post("/transfer", async (req, res) => {
    const { farmer_id, destination, amount, confirm, description, to_type } = req.body;
    const amt = Number(amount);

    if (!farmer_id || !destination || isNaN(amt) || amt <= 0) {
      return res.status(400).json({ error: "Invalid transfer request" });
    }

    try {
      const senderId = await resolveFarmerId(db, farmer_id);
      const session = userSessions.get(senderId);

      if (!session) {
        return res.status(401).json({ error: "Not authenticated with Unipesa" });
      }

      if (!session.userId) {
        const account = await session.unipesa.getAccountInfo();
        session.userId = account.id;
      }

      const senderDetails = await getFarmerDetails(db, senderId);

      // Determine transfer type: wallet-to-wallet or external
      const toType = to_type || 'wallet';
      let transferData: any = {
        fromUserId: session.userId,
        amount: amt.toFixed(2),
        currency: 'KES',
        to: {
          type: toType,
        },
      };

      if (toType === 'wallet') {
        // Wallet-to-wallet transfer
        const recipientId = await resolveFarmerId(db, destination);
        const recipientDetails = await getFarmerDetails(db, recipientId);
        
        // Get recipient's Unipesa user ID
        // We need to look up the recipient's Unipesa account
        // For now, we'll use the phone number to find them
        const recipientPhone = recipientDetails?.mobile;
        if (!recipientPhone) {
          return res.status(404).json({ error: "Recipient phone number not found" });
        }

        transferData.to.userId = recipientPhone; // Unipesa uses phone number as identifier
        transferData.to.userId = destination; // Or we can use the Unipesa user ID if we have it

        // Preview mode
        if (!confirm) {
          return res.json({
            preview: true,
            from: senderId,
            to: {
              id: recipientId,
              name: `${recipientDetails?.first_name || ''} ${recipientDetails?.last_name || ''}`,
              phone: recipientPhone,
            },
            amount: amt,
            message: `Confirm transfer of ${amt} KES to ${recipientDetails?.first_name || ''} ${recipientDetails?.last_name || ''}`,
          });
        }
      } else {
        // External transfer (withdrawal to provider)
        transferData.to.providerId = destination;
        transferData.to.account = req.body.account || destination;

        // Preview mode
        if (!confirm) {
          return res.json({
            preview: true,
            from: senderId,
            to: {
              provider: destination,
              account: req.body.account || destination,
            },
            amount: amt,
            message: `Confirm withdrawal of ${amt} KES to ${destination}`,
          });
        }
      }

      // Execute transfer
      const transfer = await session.unipesa.createTransfer(transferData);

      // Record in local DB
      const reference_no = transfer.transactionId || transfer.id;
      await db.tx(async (t) => {
        // Sender debit
        await t.none(
          `INSERT INTO wallet_transactions
            (farmer_id, type, amount, destination, direction, method, status, meta, reference_no)
          VALUES ($1, $2, $3, $4, 'out', 'unipesa', $5, $6, $7)`,
          [
            senderId,
            toType === 'wallet' ? 'transfer' : 'withdraw',
            amt,
            destination,
            transfer.status,
            JSON.stringify({
              transfer: true,
              unipesaTransactionId: transfer.transactionId,
              toType,
              description: description || `Transfer to ${destination}`,
            }),
            reference_no,
          ]
        );

        // If wallet-to-wallet, credit recipient
        if (toType === 'wallet') {
          const recipientId = await resolveFarmerId(db, destination);
          await t.none(
            `INSERT INTO wallet_transactions
              (farmer_id, type, amount, source, direction, method, status, meta, reference_no)
            VALUES ($1, 'transfer', $2, $3, 'in', 'unipesa', $4, $5, $6)`,
            [
              recipientId,
              amt,
              senderId,
              transfer.status,
              JSON.stringify({
                transfer: true,
                unipesaTransactionId: transfer.transactionId,
                description: `Received transfer from ${senderId}`,
              }),
              reference_no,
            ]
          );
        }
      });

      res.json({
        success: true,
        executed: true,
        transaction: {
          reference: reference_no,
          unipesaId: transfer.transactionId,
          amount: amt,
          from: senderId,
          to: destination,
          status: transfer.status,
        },
      });
    } catch (err) {
      console.error("💥 Transfer error:", err);
      res.status(500).json({ 
        error: "Transfer failed",
        details: err instanceof Error ? err.message : "Unknown error",
      });
    }
  });

  /**
   * Make a payment to a merchant (PayBill/Till)
   * POST /wallet/payment
   */
  router.post("/payment", async (req, res) => {
    console.log("💰 [WALLET] Payment request received:", req.body);

    const { farmer_id, amount, destination, service, merchant, description, account } = req.body;
    const amt = Number(amount);

    if (!farmer_id || !destination || isNaN(amt) || amt <= 0) {
      return res.status(400).json({
        success: false,
        error: "Invalid payment request",
      });
    }

    try {
      const senderId = await resolveFarmerId(db, farmer_id);
      const session = userSessions.get(senderId);

      if (!session) {
        return res.status(401).json({ 
          success: false, 
          error: "Not authenticated with Unipesa" 
        });
      }

      if (!session.userId) {
        const accountInfo = await session.unipesa.getAccountInfo();
        session.userId = accountInfo.id;
      }

      // Parse destination to determine provider and account
      let providerId = 'MPESA'; // Default
      let accountNumber = destination;

      // Check if it's a PayBill or Till format
      if (destination.startsWith('PAYBILL:')) {
        const parts = destination.replace('PAYBILL:', '').split('|ACC:');
        providerId = 'MPESA'; // MPESA handles PayBills
        accountNumber = parts[0];
        // Store the account number as the destination
      } else if (destination.startsWith('TILL:')) {
        const tillNumber = destination.replace('TILL:', '');
        providerId = 'MPESA';
        accountNumber = tillNumber;
      }

      // Create transfer to external provider
      const transfer = await session.unipesa.createTransfer({
        fromUserId: session.userId,
        amount: amt.toFixed(2),
        currency: 'KES',
        to: {
          type: 'external',
          providerId: providerId,
          account: accountNumber,
        },
      });

      // Record transaction in local DB
      const reference_no = transfer.transactionId || transfer.id;
      await db.none(
        `INSERT INTO wallet_transactions
          (farmer_id, type, amount, destination, direction, method, status, meta, reference_no)
        VALUES ($1, $2, $3, $4, 'out', 'unipesa', $5, $6, $7)`,
        [
          senderId,
          'paybill',
          amt,
          destination,
          transfer.status,
          JSON.stringify({
            service,
            merchant,
            transactionType: "payment",
            unipesaTransactionId: transfer.transactionId,
            description: description || `Payment to ${merchant || destination}`,
            provider: providerId,
          }),
          reference_no,
        ]
      );

      console.log("✅ [WALLET] Payment completed via Unipesa:", {
        reference_no,
        sender: senderId,
        destination,
        amount: amt,
        status: transfer.status,
      });

      return res.json({
        success: true,
        transaction: {
          reference: reference_no,
          unipesaId: transfer.transactionId,
          amount: amt,
          from: senderId,
          to: destination,
          status: transfer.status,
        },
      });
    } catch (err) {
      console.error("💥 [WALLET] Payment error:", err);
      return res.status(500).json({
        success: false,
        error: "Payment failed",
        details: err instanceof Error ? err.message : "Unknown error",
      });
    }
  });

  // ==================== PROVIDERS ====================

  /**
   * Get available payment providers from Unipesa
   * GET /wallet/providers
   */
  router.get("/providers", async (req, res) => {
    try {
      const { farmerId } = req.query;
      if (!farmerId) {
        return res.status(400).json({ error: "Farmer ID required" });
      }

      const resolvedId = await resolveFarmerId(db, farmerId as string);
      const session = userSessions.get(resolvedId);

      if (!session) {
        return res.status(401).json({ error: "Not authenticated with Unipesa" });
      }

      const providers = await session.unipesa.listProviders();
      res.json({
        success: true,
        providers: providers.items,
      });
    } catch (err) {
      console.error("💥 Get providers error:", err);
      res.status(500).json({ 
        error: "Failed to get providers",
        details: err instanceof Error ? err.message : "Unknown error",
      });
    }
  });

  /**
   * Get merchant account info
   * GET /wallet/merchant/account
   */
  router.get("/merchant/account", async (req, res) => {
    try {
      const { farmerId } = req.query;
      if (!farmerId) {
        return res.status(400).json({ error: "Farmer ID required" });
      }

      const resolvedId = await resolveFarmerId(db, farmerId as string);
      const session = userSessions.get(resolvedId);

      if (!session) {
        return res.status(401).json({ error: "Not authenticated with Unipesa" });
      }

      const account = await session.unipesa.getMerchantAccount();
      res.json({
        success: true,
        account,
      });
    } catch (err) {
      console.error("💥 Get merchant account error:", err);
      res.status(500).json({
        error: "Failed to get merchant account",
        details: err instanceof Error ? err.message : "Unknown error",
      });
    }
  });

  // ==================== HEALTH ====================

  /**
   * Health check
   * GET /wallet/health
   */
  router.get("/health", async (req, res) => {
    try {
      const status = await unipesa.healthCheck();
      res.json({
        status: status.status,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      res.status(503).json({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  });

  // ==================== UTILITY ENDPOINTS ====================

  // Keep search-farmers endpoint
  router.get("/search-farmers", async (req, res) => {
    const { q } = req.query;

    if (!q || typeof q !== "string") {
      return res.status(400).json({ error: "Missing search query" });
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
      res.status(500).json({ error: "Failed to search farmers" });
    }
  });

  return router;
};