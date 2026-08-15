// src/api/wallet.ts
/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable camelcase */
import express from "express";
import pgPromise from "pg-promise";
import { UnipesaService } from "../services/UnipesaService";
import { generateOtp, sendOtpByEmail } from "../services/otp";

const pgp = pgPromise();

// ✅ Shared session store - persists across requests
const userSessions = new Map<string, {
  unipesa: UnipesaService;
  farmerId: string;
  userId?: string;
}>();

// Global OTP store (in production, use Redis)
declare global {
  var otpStore: Map<string, { otp: string; expires: number }>;
}

if (!global.otpStore) {
  global.otpStore = new Map();
}

// Clean up expired OTPs every minute
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of global.otpStore.entries()) {
    if (value.expires < now) {
      global.otpStore.delete(key);
      console.log(`🧹 Cleaned up expired OTP for ${key}`);
    }
  }
}, 60 * 1000);

// Helper to resolve farmerId (accepts both UUID and numeric)
async function resolveFarmerId(db: any, farmerId: string | number): Promise<string> {
  const normalized = String(farmerId);

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (uuidRegex.test(normalized)) {
    const farmer = await db.oneOrNone(
      "SELECT id FROM farmers WHERE user_id::text = $1",
      [normalized]
    );
    if (farmer) {
      return String(farmer.id);
    }
    return normalized;
  }

  if (!isNaN(Number(normalized))) {
    return normalized;
  }

  const farmer = await db.oneOrNone(
    "SELECT id FROM farmers WHERE id::text = $1 OR auth_id::text = $1 OR user_id::text = $1",
    [normalized]
  );
  if (farmer) {
    return String(farmer.id);
  }

  return "1";
}

// Helper to get farmer's phone number from DB
async function getFarmerPhone(db: any, farmerId: string): Promise<string | null> {
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

  const unipesa = new UnipesaService(unipesaConfig);

  // ============================================================
  // ✅ ALL AUTHENTICATION ROUTES MUST COME FIRST
  // ============================================================

  /**
   * Request OTP for wallet authentication (sent via email)
   * POST /wallet/auth/otp/request
   */
  router.post("/auth/otp/request", async (req, res) => {
    const { farmerId } = req.body;

    if (!farmerId) {
      return res.status(400).json({ error: "Farmer ID required" });
    }

    try {
      console.log(`📧 [OTP Request] Starting for farmer: ${farmerId}`);
      
      const resolvedId = await resolveFarmerId(db, farmerId);
      console.log(`📧 [OTP Request] Resolved ID: ${resolvedId}`);
      
      // Get farmer details including email
      const farmerWithEmail = await db.oneOrNone(
        `SELECT f.id, f.first_name, f.last_name, f.mobile, u.email 
        FROM farmers f
        LEFT JOIN users u ON f.user_id = u.id
        WHERE f.id = $1`,
        [resolvedId]
      );

      if (!farmerWithEmail) {
        console.log(`❌ [OTP Request] Farmer not found: ${resolvedId}`);
        return res.status(404).json({ error: "Farmer not found" });
      }

      const phone = farmerWithEmail.mobile;
      const email = farmerWithEmail.email;

      console.log(`📧 [OTP Request] Farmer found:`, {
        id: farmerWithEmail.id,
        name: `${farmerWithEmail.first_name} ${farmerWithEmail.last_name}`,
        phone: phone,
        email: email,
      });

      if (!phone) {
        console.log(`❌ [OTP Request] No phone number for farmer: ${resolvedId}`);
        return res.status(404).json({ error: "Farmer phone number not found" });
      }

      if (!email) {
        console.log(`❌ [OTP Request] No email for farmer: ${resolvedId}`);
        return res.status(404).json({ 
          error: "Farmer email not found. Please update your profile with an email address." 
        });
      }

      // Generate OTP locally (6 digits)
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      console.log(`📧 [OTP Request] Generated OTP for ${email}: ${otp}`);
      
      // Store OTP with 5-minute expiration
      global.otpStore.set(email, {
        otp: otp,
        expires: Date.now() + 5 * 60 * 1000,
      });
      console.log(`📧 [OTP Request] OTP stored with 5-minute expiry`);

      // Check email configuration
      console.log(`📧 [OTP Request] Checking email config:`);
      console.log(`  - MAIL_USER: ${process.env.MAIL_USER ? '✅ Set' : '❌ Missing'}`);
      console.log(`  - MAIL_PASS: ${process.env.MAIL_PASS ? '✅ Set' : '❌ Missing'}`);
      console.log(`  - NODE_ENV: ${process.env.NODE_ENV || 'development'}`);

      // Send OTP via email using your internal system
      if (!process.env.MAIL_USER || !process.env.MAIL_PASS) {
        console.error('❌ Email configuration missing. Please set MAIL_USER and MAIL_PASS.');
        
        // For sandbox, return OTP for testing instead of failing
        if (process.env.NODE_ENV !== 'production') {
          console.log(`⚠️ [OTP Request] Sandbox mode: Returning OTP in response for testing`);
          return res.json({
            success: true,
            otpId: email,
            expiresIn: 300,
            message: "OTP generated (email not configured - sandbox mode)",
            debug_otp: otp,
            debug_email: email,
          });
        }
        
        return res.status(500).json({
          success: false,
          error: "Email service not configured",
          details: "Please contact support.",
        });
      }

      const emailConfig = {
        MAIL_USER: process.env.MAIL_USER!,
        MAIL_PASS: process.env.MAIL_PASS!,
      };

      console.log(`📧 [OTP Request] Attempting to send email to: ${email}`);
      
      try {
        await sendOtpByEmail(email, otp, emailConfig);
        console.log(`✅ [OTP Request] Email sent successfully to ${email}`);
      } catch (emailError) {
        console.error(`❌ [OTP Request] Failed to send email:`, emailError);
        
        // For sandbox, return OTP in response so testing can continue
        if (process.env.NODE_ENV !== 'production') {
          console.log(`⚠️ [OTP Request] Sandbox mode: Returning OTP despite email failure`);
          return res.json({
            success: true,
            otpId: email,
            expiresIn: 300,
            message: "OTP generated (email send failed - sandbox mode)",
            debug_otp: otp,
            debug_email: email,
            debug_email_error: emailError instanceof Error ? emailError.message : 'Unknown error',
          });
        }
        
        throw emailError;
      }

      return res.json({
        success: true,
        otpId: email,
        expiresIn: 300,
        message: "OTP sent to your email",
      });
    } catch (err) {
      console.error("💥 [OTP Request] Error:", err);
      return res.status(500).json({
        success: false,
        error: "Failed to send OTP",
        details: err instanceof Error ? err.message : "Unknown error",
      });
    }
  });

  /**
   * Verify OTP and authenticate wallet
   * POST /wallet/auth/otp/verify
   */
  router.post("/auth/otp/verify", async (req, res) => {
    const { farmerId, otpId, code } = req.body;

    if (!farmerId || !otpId || !code) {
      return res.status(400).json({ error: "Farmer ID, OTP ID, and code required" });
    }

    try {
      const resolvedId = await resolveFarmerId(db, farmerId);
      
      // Get farmer email
      const farmerWithEmail = await db.oneOrNone(
        `SELECT f.id, u.email 
        FROM farmers f
        LEFT JOIN users u ON f.user_id = u.id
        WHERE f.id = $1`,
        [resolvedId]
      );

      if (!farmerWithEmail || !farmerWithEmail.email) {
        return res.status(404).json({ error: "Farmer email not found" });
      }

      const email = farmerWithEmail.email;
      const phone = await getFarmerPhone(db, resolvedId);

      if (!phone) {
        return res.status(404).json({ error: "Farmer phone number not found" });
      }

      // Verify OTP from local store
      const storedOTP = global.otpStore.get(email);
      if (!storedOTP) {
        return res.status(400).json({
          success: false,
          error: "OTP expired or not found. Please request a new OTP.",
        });
      }

      if (storedOTP.expires < Date.now()) {
        global.otpStore.delete(email);
        return res.status(400).json({
          success: false,
          error: "OTP has expired. Please request a new OTP.",
        });
      }

      if (storedOTP.otp !== code) {
        return res.status(400).json({
          success: false,
          error: "Invalid OTP code. Please try again.",
        });
      }

      // OTP is valid - clean up
      global.otpStore.delete(email);

      // ✅ Create a session directly after OTP verification
      const tempUnipesa = new UnipesaService(unipesaConfig);
      
      try {
        // Try to get account info - this confirms the user has a wallet
        // If this fails, the user might not have a wallet yet
        const account = await tempUnipesa.getAccountInfo();
        
        // ✅ Store session with both UUID and numeric ID
        userSessions.set(farmerId, {
          unipesa: tempUnipesa,
          farmerId: farmerId,
          userId: account.id,
        });
        userSessions.set(resolvedId, {
          unipesa: tempUnipesa,
          farmerId: resolvedId,
          userId: account.id,
        });
        
        console.log(`✅ [OTP VERIFY] Session created for farmer ${resolvedId} (UUID: ${farmerId})`);
        
        return res.json({
          success: true,
          message: "Authenticated successfully",
          user: {
            unipesaUserId: account.id,
            phone: phone,
          },
          tokens: {
            accessToken: tempUnipesa.getAccessToken(),
            refreshToken: tempUnipesa.getRefreshToken(),
          },
        });
      } catch (accountError: any) {
        // If getAccountInfo fails, the user might not have a wallet
        console.log(`⚠️ [OTP VERIFY] Could not get account info: ${accountError.message}`);
        
        // Try to check if user has a wallet by attempting to get user info
        try {
          // For sandbox, we'll check if the user exists by trying to get their info
          // This is a workaround since we can't directly check
          const userInfo = await tempUnipesa.getUser(phone);
          if (userInfo) {
            userSessions.set(farmerId, {
              unipesa: tempUnipesa,
              farmerId: farmerId,
              userId: userInfo.userId,
            });
            userSessions.set(resolvedId, {
              unipesa: tempUnipesa,
              farmerId: resolvedId,
              userId: userInfo.userId,
            });
            
            console.log(`✅ [OTP VERIFY] Session created with userInfo for farmer ${resolvedId}`);
            
            return res.json({
              success: true,
              message: "Authenticated successfully",
              user: {
                unipesaUserId: userInfo.userId,
                phone: phone,
              },
            });
          }
        } catch (userError) {
          console.log(`⚠️ [OTP VERIFY] Could not get user info: ${userError}`);
        }
        
        // If all else fails, the user needs to set up their wallet
        return res.json({
          success: true,
          authenticated: false,
          hasWallet: false,
          needsSetup: true,
          requiresOTP: false,
          message: "OTP verified. Please set up your wallet.",
        });
      }

    } catch (err) {
      console.error("💥 Verify OTP error:", err);
      return res.status(500).json({
        success: false,
        error: "OTP verification failed",
        details: err instanceof Error ? err.message : "Unknown error",
      });
    }
  });

  /**
   * Send OTP for PIN setup/reset (kept for compatibility)
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
      return res.json({
        success: true,
        otpId: result.otpId,
        expiresIn: result.expiresIn,
      });
    } catch (err) {
      console.error("💥 Send OTP error:", err);
      return res.status(500).json({
        success: false,
        error: "Failed to send OTP",
        details: err instanceof Error ? err.message : "Unknown error",
      });
    }
  });

  /**
   * Verify OTP and set PIN (kept for compatibility)
   * POST /wallet/auth/otp/verify-and-set-pin
   */
  router.post("/auth/otp/verify-and-set-pin", async (req, res) => {
    const { otpId, code, newPin } = req.body;

    if (!otpId || !code || !newPin) {
      return res.status(400).json({ error: "OTP ID, code, and new PIN required" });
    }

    try {
      const verification = await unipesa.verifyOTP(otpId, code);

      if (!verification.verified) {
        return res.status(400).json({
          success: false,
          error: "Invalid OTP code"
        });
      }

      await unipesa.setPin(otpId, newPin);

      return res.json({
        success: true,
        message: "PIN set successfully",
      });
    } catch (err) {
      console.error("💥 Verify OTP error:", err);
      return res.status(500).json({
        success: false,
        error: "Failed to verify OTP and set PIN",
        details: err instanceof Error ? err.message : "Unknown error",
      });
    }
  });

  /**
   * Change PIN using current PIN (kept for compatibility)
   * PUT /wallet/auth/pin/change
   */
  router.put("/auth/pin/change", async (req, res) => {
    const { farmerId, currentPin, newPin } = req.body;

    if (!farmerId || !currentPin || !newPin) {
      return res.status(400).json({ error: "Farmer ID, current PIN, and new PIN required" });
    }

    try {
      const resolvedId = await resolveFarmerId(db, farmerId);

      let session = userSessions.get(resolvedId);
      if (!session) {
        const phone = await getFarmerPhone(db, resolvedId);
        if (!phone) {
          return res.status(404).json({ error: "Farmer phone number not found" });
        }
        // Try PIN authentication - if it fails, suggest OTP
        try {
          const tokens = await unipesa.signInWithPin(phone, currentPin);
          const account = await unipesa.getAccountInfo();
          session = { unipesa, farmerId: resolvedId, userId: account.id };
          userSessions.set(resolvedId, session);
        } catch (pinError: any) {
          if (pinError.message?.includes('404') || pinError.message?.includes('Not Found')) {
            return res.status(400).json({
              success: false,
              error: "PIN authentication not available. Please use OTP flow.",
              requiresOTP: true,
            });
          }
          throw pinError;
        }
      }

      await session.unipesa.changePin(currentPin, newPin);

      return res.json({
        success: true,
        message: "PIN changed successfully",
      });
    } catch (err) {
      console.error("💥 Change PIN error:", err);
      return res.status(500).json({
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

      return res.json({
        success: true,
        accessToken: newToken,
      });
    } catch (err) {
      console.error("💥 Refresh token error:", err);
      return res.status(401).json({
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

      return res.json({
        success: true,
        message: "Logged out successfully",
      });
    } catch (err) {
      console.error("💥 Logout error:", err);
      return res.status(500).json({
        success: false,
        error: "Failed to logout",
      });
    }
  });

  // ==================== WALLET STATUS CHECK (Auto-Auth) ====================

  /**
   * Check wallet status for a farmer - DOES NOT register
   * POST /wallet/auto-auth
   */
  router.post("/auto-auth", async (req, res) => {
    const { farmerId } = req.body;

    if (!farmerId) {
      return res.status(400).json({ error: "Farmer ID required" });
    }

    try {
      const resolvedId = await resolveFarmerId(db, farmerId);
      const phone = await getFarmerPhone(db, resolvedId);

      if (!phone) {
        return res.status(404).json({
          success: false,
          error: "Farmer phone number not found",
          needsSetup: true,
        });
      }

      // ✅ Check if we already have an authenticated session - try both UUID and numeric
      let existingSession = userSessions.get(farmerId);
      if (!existingSession) {
        existingSession = userSessions.get(resolvedId);
      }
      
      if (existingSession && existingSession.unipesa.isAuthenticated()) {
        console.log(`✅ Already authenticated for farmer ${resolvedId}`);
        return res.json({
          success: true,
          authenticated: true,
          hasWallet: true,
          needsSetup: false,
          needsPin: false,
          requiresOTP: false,
          farmerId: resolvedId,
          phone: phone,
        });
      }

      // Check if farmer has a wallet
      let hasWallet = false;
      let needsSetup = true;
      let needsPin = false;
      let authenticated = false;
      let requiresOTP = false;

      try {
        const tempUnipesa = new UnipesaService(unipesaConfig);

        // Try to check if user exists by attempting registration
        try {
          // This will fail with 409 if user already exists
          await tempUnipesa.registerUser({
            phoneNumber: phone,
            firstName: 'Check',
            lastName: 'Existing',
            externalUserId: resolvedId,
            countryCode: 'KE',
          });
          // If we get here, registration succeeded → user has NO wallet
          hasWallet = false;
          needsSetup = true;
          needsPin = false;
          authenticated = false;
          requiresOTP = false;
          console.log(`📝 Farmer ${resolvedId} has no wallet. Needs setup.`);
        } catch (registerError: any) {
          // Check for 409 Conflict - user already exists
          const errorMsg = registerError.message || '';
          const isConflict = errorMsg.includes('409') || 
                            errorMsg.includes('Conflict') || 
                            errorMsg.includes('already registered');
          
          if (isConflict) {
            // ✅ User ALREADY HAS a wallet
            hasWallet = true;
            needsSetup = false;
            needsPin = true;
            authenticated = false;
            requiresOTP = true;  // ✅ Signal OTP flow
            console.log(`✅ Farmer ${resolvedId} has a Unipesa wallet. Requires OTP.`);
            
            // ✅ REMOVED: No PIN testing - we use OTP flow exclusively
            // The frontend will handle OTP flow
          } else {
            // Some other error - treat as no wallet
            hasWallet = false;
            needsSetup = true;
            needsPin = false;
            authenticated = false;
            requiresOTP = false;
            console.error("💥 Register check error:", registerError);
          }
        }
      } catch (err) {
        console.error("💥 Auto-auth check error:", err);
        hasWallet = false;
        needsSetup = true;
        needsPin = false;
        authenticated = false;
        requiresOTP = false;
      }

      return res.json({
        success: true,
        authenticated: authenticated,
        hasWallet: hasWallet,
        needsSetup: needsSetup,
        needsPin: needsPin,
        requiresOTP: requiresOTP,
        farmerId: resolvedId,
        phone: phone,
      });

    } catch (err) {
      console.error("💥 Auto-auth error:", err);
      return res.status(500).json({
        success: false,
        error: "Failed to check wallet status",
        details: err instanceof Error ? err.message : "Unknown error",
      });
    }
  });

  // ==================== USER REGISTRATION ====================

  /**
   * Register a farmer's wallet with Unipesa (creates wallet)
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

      // Register user with Unipesa - THIS CREATES THE WALLET
      const user = await unipesa.registerUser({
        phoneNumber: farmer.mobile,
        firstName: farmer.first_name || 'FarmFuzion',
        lastName: farmer.last_name || 'User',
        externalUserId: resolvedId,
        countryCode: 'KE',
      });

      // Send OTP for PIN verification
      const otpResult = await unipesa.sendOTP(farmer.mobile);

      return res.json({
        success: true,
        message: "Wallet registered successfully",
        unipesaUserId: user.userId,
        walletId: user.wallet.walletId,
        otpId: otpResult.otpId,
        requiresOtpVerification: true,
      });
    } catch (err) {
      console.error("💥 Register wallet error:", err);
      return res.status(500).json({
        success: false,
        error: "Failed to register wallet",
        details: err instanceof Error ? err.message : "Unknown error",
      });
    }
  });

  // ============================================================
  // ✅ DEBUG ROUTE
  // ============================================================
  router.get("/debug", (req, res) => {
    return res.json({
      status: "ok",
      message: "Wallet router is working",
      routes: [
        "POST /auth/otp/request",
        "POST /auth/otp/verify",
        "POST /auto-auth",
        "POST /register",
        "GET /:farmerId/status",
        "GET /:farmerId/balance",
        "GET /:farmerId/transactions",
        "POST /topup/:method",
        "POST /transfer",
        "POST /payment",
        "GET /providers",
        "GET /merchant/account",
        "GET /health",
      ],
      timestamp: new Date().toISOString(),
    });
  });

  // ============================================================
  // ⚠️ PARAMETERIZED ROUTES MUST COME LAST
  // ============================================================

  router.get("/:farmerId/status", async (req, res) => {
    const { farmerId } = req.params;

    try {
      const resolvedId = await resolveFarmerId(db, farmerId);
      const session = userSessions.get(resolvedId);
      const phone = await getFarmerPhone(db, resolvedId);

      const isAuthenticated = session && session.unipesa.isAuthenticated();
      let hasWallet = false;
      let walletId = null;

      if (isAuthenticated && session.userId) {
        try {
          const balance = await session.unipesa.getWalletBalance(session.userId);
          hasWallet = true;
          walletId = balance.walletId;
        } catch (err) {
          hasWallet = true;
        }
      }

      return res.json({
        success: true,
        farmerId: resolvedId,
        phone: phone,
        isAuthenticated: isAuthenticated,
        hasWallet: hasWallet,
        walletId: walletId,
        needsSetup: !hasWallet && !!phone,
        needsPin: hasWallet && !isAuthenticated,
        requiresOTP: hasWallet && !isAuthenticated,
      });
    } catch (err) {
      console.error("💥 Status check error:", err);
      return res.status(500).json({
        success: false,
        error: "Failed to check wallet status",
      });
    }
  });

  router.get("/:farmerId/balance", async (req, res) => {
    const { farmerId } = req.params;

    try {
      // ✅ Try to get session with the ID as-is (UUID)
      let session = userSessions.get(farmerId);
      
      // ✅ If not found, try resolving to numeric ID
      if (!session) {
        const resolvedId = await resolveFarmerId(db, farmerId);
        session = userSessions.get(resolvedId);
      }

      if (!session) {
        console.log(`❌ [BALANCE] No session found for farmer: ${farmerId}`);
        return res.status(401).json({ error: "Not authenticated with Unipesa" });
      }

      // ✅ Ensure userId is set
      if (!session.userId) {
        try {
          const account = await session.unipesa.getAccountInfo();
          session.userId = account.id;
          // Update the session with the userId
          userSessions.set(farmerId, session);
          const resolvedId = await resolveFarmerId(db, farmerId);
          userSessions.set(resolvedId, session);
        } catch (err) {
          console.error("❌ [BALANCE] Failed to get account info:", err);
          return res.status(401).json({ error: "Session expired. Please re-authenticate." });
        }
      }

      const balance = await session.unipesa.getWalletBalance(session.userId);

      return res.json({
        success: true,
        walletId: balance.walletId,
        balance: parseFloat(balance.available),
        currency: balance.currency,
      });
    } catch (err) {
      console.error("💥 [WALLET] Balance fetch error:", err);
      return res.status(500).json({
        error: "Unable to fetch wallet balance",
        details: err instanceof Error ? err.message : "Unknown error",
      });
    }
  });

  router.get("/:farmerId/transactions", async (req, res) => {
    const { farmerId } = req.params;
    const { limit = 50, offset = 0 } = req.query;

    try {
      // ✅ Try to get session with the ID as-is (UUID)
      let session = userSessions.get(farmerId);
      
      // ✅ If not found, try resolving to numeric ID
      if (!session) {
        const resolvedId = await resolveFarmerId(db, farmerId);
        session = userSessions.get(resolvedId);
      }

      if (!session) {
        console.log(`❌ [TRANSACTIONS] No session found for farmer: ${farmerId}`);
        return res.status(401).json({ error: "Not authenticated with Unipesa" });
      }

      // ✅ Ensure userId is set
      if (!session.userId) {
        try {
          const account = await session.unipesa.getAccountInfo();
          session.userId = account.id;
          // Update the session with the userId
          userSessions.set(farmerId, session);
          const resolvedId = await resolveFarmerId(db, farmerId);
          userSessions.set(resolvedId, session);
        } catch (err) {
          console.error("❌ [TRANSACTIONS] Failed to get account info:", err);
          return res.status(401).json({ error: "Session expired. Please re-authenticate." });
        }
      }

      const result = await session.unipesa.getUserTransactions(session.userId, {
        limit: parseInt(limit as string),
        offset: parseInt(offset as string),
      });

      const transactions = result.items.map(mapUnipesaTransaction);
      const balance = await session.unipesa.getWalletBalance(session.userId);

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

      const topup = await session.unipesa.createTopup({
        userId: session.userId,
        amount: amt.toFixed(2),
        currency: 'KES',
        method: method.toUpperCase(),
      });

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

      return res.json({
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
      return res.status(500).json({
        success: false,
        error: "Top-up failed",
        details: err instanceof Error ? err.message : "Unknown error",
      });
    }
  });

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
        const recipientId = await resolveFarmerId(db, destination);
        const recipientDetails = await getFarmerDetails(db, recipientId);

        const recipientPhone = recipientDetails?.mobile;
        if (!recipientPhone) {
          return res.status(404).json({ error: "Recipient phone number not found" });
        }

        transferData.to.userId = destination;

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
        transferData.to.providerId = destination;
        transferData.to.account = req.body.account || destination;

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

      const transfer = await session.unipesa.createTransfer(transferData);

      const reference_no = transfer.transactionId || transfer.id;
      await db.tx(async (t) => {
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

      return res.json({
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
      return res.status(500).json({
        error: "Transfer failed",
        details: err instanceof Error ? err.message : "Unknown error",
      });
    }
  });

  router.post("/payment", async (req, res) => {
    const { farmer_id, amount, destination, service, merchant, description } = req.body;
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

      let providerId = 'MPESA';
      let accountNumber = destination;

      if (destination.startsWith('PAYBILL:')) {
        const parts = destination.replace('PAYBILL:', '').split('|ACC:');
        providerId = 'MPESA';
        accountNumber = parts[0];
      } else if (destination.startsWith('TILL:')) {
        const tillNumber = destination.replace('TILL:', '');
        providerId = 'MPESA';
        accountNumber = tillNumber;
      }

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
      return res.json({
        success: true,
        providers: providers.items,
      });
    } catch (err) {
      console.error("💥 Get providers error:", err);
      return res.status(500).json({
        error: "Failed to get providers",
        details: err instanceof Error ? err.message : "Unknown error",
      });
    }
  });

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
      return res.json({
        success: true,
        account,
      });
    } catch (err) {
      console.error("💥 Get merchant account error:", err);
      return res.status(500).json({
        error: "Failed to get merchant account",
        details: err instanceof Error ? err.message : "Unknown error",
      });
    }
  });

  // ==================== HEALTH ====================

  router.get("/health", async (req, res) => {
    try {
      const status = await unipesa.healthCheck();
      return res.json({
        status: status.status,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      return res.status(503).json({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  });

  // ==================== UTILITY ENDPOINTS ====================

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

      return res.json(farmers);
    } catch (err) {
      console.error("💥 Search error:", err);
      return res.status(500).json({ error: "Failed to search farmers" });
    }
  });

  return router;
};
