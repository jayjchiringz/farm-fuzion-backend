// src/api/group-wallet.ts
/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable camelcase */
import express from "express";
import pgPromise from "pg-promise";
import { UnipesaService } from "../services/UnipesaService";
import { GroupWalletService } from "../services/GroupWalletService";

const pgp = pgPromise();

// ============================================================
// HELPER: Resolve group ID (validates UUID format)
// ============================================================
async function validateGroupId(db: any, groupId: string): Promise<string> {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(groupId)) {
    throw new Error("Invalid group ID format");
  }

  const group = await db.oneOrNone(
    `SELECT id FROM groups WHERE id = $1`,
    [groupId]
  );

  if (!group) {
    throw new Error("Group not found");
  }

  return group.id;
}

// ============================================================
// HELPER: Check if user is an active group admin
// ============================================================
async function requireGroupAdmin(
  db: any,
  groupId: string,
  userId: string
): Promise<any> {
  const admin = await db.oneOrNone(
    `SELECT ga.id, ga.user_id, ga.group_id, ga.first_name, ga.last_name
     FROM group_admins ga
     WHERE ga.group_id = $1 
       AND ga.user_id = $2 
       AND ga.status = 'active'`,
    [groupId, userId]
  );

  if (!admin) {
    throw new Error("User is not an active group admin");
  }

  return admin;
}

// ============================================================
// MAIN ROUTER FACTORY
// ============================================================
export const getGroupWalletRouter = async (dbConfig: any, unipesaConfig: any) => {
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
  const groupWallet = new GroupWalletService(unipesa, db as any);

  // ============================================================
  // HEALTH & DEBUG
  // ============================================================

  router.get("/health", async (req, res) => {
    try {
      const status = await unipesa.healthCheck();
      return res.json({
        success: true,
        status: status.status,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      return res.status(503).json({
        success: false,
        status: "unhealthy",
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  });

  router.get("/debug", (req, res) => {
    return res.json({
      status: "ok",
      message: "Group wallet router is working",
      routes: [
        "POST /:groupId/register",
        "GET /:groupId/info",
        "GET /:groupId/balance",
        "GET /:groupId/unipesa-transactions",
        "GET /:groupId/signatories",
        "POST /:groupId/transactions/initiate",
        "POST /transactions/:requestId/approve",
        "GET /:groupId/pending-approvals",
        "GET /:groupId/transactions",
        "GET /transactions/:requestId",
        "GET /:groupId/contracts",
        "POST /:groupId/contracts",
        "GET /:groupId/custody",
        "GET /farmer/:farmerId/custody",
        "POST /farmer/:farmerId/custody",
      ],
      timestamp: new Date().toISOString(),
    });
  });

  // ============================================================
  // GROUP WALLET REGISTRATION & INFO
  // ============================================================

  /**
   * Register group wallet with Unipesa
   * POST /:groupId/register
   */
  router.post("/:groupId/register", async (req, res) => {
    try {
      const { groupId } = req.params;

      await validateGroupId(db, groupId);

      const result = await groupWallet.registerGroupWallet(groupId);

      return res.json({
        success: true,
        ...result,
      });
    } catch (err) {
      console.error("💥 Group registration error:", err);
      return res.status(500).json({
        success: false,
        error: "Failed to register group wallet",
        details: err instanceof Error ? err.message : "Unknown error",
      });
    }
  });

  /**
   * Get group wallet info + status
   * GET /:groupId/info
   */
  router.get("/:groupId/info", async (req, res) => {
    try {
      const { groupId } = req.params;

      const group = await db.oneOrNone(
        `SELECT 
          g.id, 
          g.name, 
          g.unipesa_user_id, 
          g.unipesa_wallet_id,
          g.wallet_status, 
          g.approval_threshold,
          g.status as group_status,
          (SELECT COUNT(*)::int FROM group_admins 
           WHERE group_id = g.id AND status = 'active') as admin_count,
          (SELECT COUNT(*)::int FROM farmers 
           WHERE group_id = g.id) as farmer_count
         FROM groups g 
         WHERE g.id = $1`,
        [groupId]
      );

      if (!group) {
        return res.status(404).json({ error: "Group not found" });
      }

      return res.json({
        success: true,
        group: {
          id: group.id,
          name: group.name,
          groupStatus: group.group_status,
          walletStatus: group.wallet_status,
          unipesaUserId: group.unipesa_user_id,
          unipesaWalletId: group.unipesa_wallet_id,
          approvalThreshold: group.approval_threshold,
          adminCount: group.admin_count,
          farmerCount: group.farmer_count,
        },
      });
    } catch (err) {
      console.error("💥 Group info error:", err);
      return res.status(500).json({
        error: "Failed to fetch group info",
        details: err instanceof Error ? err.message : "Unknown error",
      });
    }
  });

  // ============================================================
  // GROUP WALLET BALANCE & TRANSACTIONS
  // ============================================================

  /**
   * Get group wallet balance
   * GET /:groupId/balance
   */
  router.get("/:groupId/balance", async (req, res) => {
    try {
      const { groupId } = req.params;

      const balance = await groupWallet.getGroupBalance(groupId);

      return res.json({
        success: true,
        ...balance,
      });
    } catch (err) {
      console.error("💥 Group balance error:", err);
      return res.status(500).json({
        error: "Failed to fetch group balance",
        details: err instanceof Error ? err.message : "Unknown error",
      });
    }
  });

  /**
   * Get group's Unipesa transaction history
   * GET /:groupId/unipesa-transactions
   */
  router.get("/:groupId/unipesa-transactions", async (req, res) => {
    try {
      const { groupId } = req.params;
      const { limit = 50, offset = 0 } = req.query;

      const result = await groupWallet.getGroupUnipesaTransactions(groupId, {
        limit: parseInt(limit as string),
        offset: parseInt(offset as string),
      });

      return res.json({
        success: true,
        transactions: result.items,
        total: result.total,
        limit: parseInt(limit as string),
        offset: parseInt(offset as string),
      });
    } catch (err) {
      console.error("💥 Group transactions error:", err);
      return res.status(500).json({
        error: "Failed to fetch group transactions",
        details: err instanceof Error ? err.message : "Unknown error",
      });
    }
  });

  // ============================================================
  // SIGNATORIES (Group Admins)
  // ============================================================

  /**
   * Get all group signatories
   * GET /:groupId/signatories
   */
  router.get("/:groupId/signatories", async (req, res) => {
    try {
      const { groupId } = req.params;

      await validateGroupId(db, groupId);

      const signatories = await groupWallet.getGroupSignatories(groupId);

      return res.json({
        success: true,
        signatories,
        count: signatories.length,
      });
    } catch (err) {
      console.error("💥 Signatories error:", err);
      return res.status(500).json({
        error: "Failed to fetch signatories",
        details: err instanceof Error ? err.message : "Unknown error",
      });
    }
  });

  // ============================================================
  // MULTI-SIGNATURE WORKFLOW
  // ============================================================

  /**
   * Initiate a new group transaction (requires approval)
   * POST /:groupId/transactions/initiate
   */
  router.post("/:groupId/transactions/initiate", async (req, res) => {
    try {
      const { groupId } = req.params;
      const {
        transaction_type,
        amount,
        initiated_by,
        metadata,
        description,
      } = req.body;

      // Validate required fields
      if (!transaction_type || !amount || !initiated_by) {
        return res.status(400).json({
          error: "Missing required fields",
          required: ["transaction_type", "amount", "initiated_by"],
        });
      }

      // Validate transaction type
      const validTypes = [
        "bulk_sale_receipt",
        "distribution_to_farmer",
        "bulk_distribution",
        "fee_collection",
        "external_payment",
        "withdrawal",
      ];

      if (!validTypes.includes(transaction_type)) {
        return res.status(400).json({
          error: "Invalid transaction type",
          valid: validTypes,
        });
      }

      const result = await groupWallet.initiateTransaction({
        groupId,
        transactionType: transaction_type,
        amount: parseFloat(amount),
        initiatedBy: initiated_by,
        metadata,
        description,
      });

      return res.status(201).json({
        success: true,
        message: "Transaction initiated. Awaiting approvals.",
        ...result,
      });
    } catch (err) {
      console.error("💥 Initiate transaction error:", err);
      return res.status(500).json({
        error: "Failed to initiate transaction",
        details: err instanceof Error ? err.message : "Unknown error",
      });
    }
  });

  /**
   * Approve or reject a transaction
   * POST /transactions/:requestId/approve
   */
  router.post("/transactions/:requestId/approve", async (req, res) => {
    try {
      const { requestId } = req.params;
      const { user_id, decision, comments } = req.body;

      if (!user_id || !decision) {
        return res.status(400).json({
          error: "Missing required fields",
          required: ["user_id", "decision"],
        });
      }

      if (!["approved", "rejected"].includes(decision)) {
        return res.status(400).json({
          error: "Decision must be 'approved' or 'rejected'",
        });
      }

      const result = await groupWallet.submitApproval({
        requestId,
        userId: user_id,
        decision,
        comments,
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
      });

      return res.json({
        success: true,
        message: `Transaction ${decision}`,
        ...result,
      });
    } catch (err) {
      console.error("💥 Approval error:", err);
      return res.status(500).json({
        error: "Failed to process approval",
        details: err instanceof Error ? err.message : "Unknown error",
      });
    }
  });

  /**
   * Get pending approvals for a user in a group
   * GET /:groupId/pending-approvals?user_id=<uuid>
   */
  router.get("/:groupId/pending-approvals", async (req, res) => {
    try {
      const { groupId } = req.params;
      const { user_id } = req.query;

      if (!user_id) {
        return res.status(400).json({ error: "user_id query parameter required" });
      }

      const requests = await groupWallet.getPendingApprovals(
        groupId,
        user_id as string
      );

      return res.json({
        success: true,
        requests,
        count: requests.length,
      });
    } catch (err) {
      console.error("💥 Pending approvals error:", err);
      return res.status(500).json({
        error: "Failed to fetch pending approvals",
        details: err instanceof Error ? err.message : "Unknown error",
      });
    }
  });

  /**
   * Get all group transactions (with filters)
   * GET /:groupId/transactions?status=pending&limit=50&offset=0
   */
  router.get("/:groupId/transactions", async (req, res) => {
    try {
      const { groupId } = req.params;
      const { status, limit = 50, offset = 0 } = req.query;

      const transactions = await groupWallet.getGroupTransactionRequests(
        groupId,
        {
          status: status as string | undefined,
          limit: parseInt(limit as string),
          offset: parseInt(offset as string),
        }
      );

      return res.json({
        success: true,
        transactions,
        count: transactions.length,
      });
    } catch (err) {
      console.error("💥 Group transactions error:", err);
      return res.status(500).json({
        error: "Failed to fetch transactions",
        details: err instanceof Error ? err.message : "Unknown error",
      });
    }
  });

  /**
   * Get single transaction with full details + approvals
   * GET /transactions/:requestId
   */
  router.get("/transactions/:requestId", async (req, res) => {
    try {
      const { requestId } = req.params;

      const transaction = await groupWallet.getTransactionDetails(requestId);

      if (!transaction) {
        return res.status(404).json({ error: "Transaction not found" });
      }

      return res.json({
        success: true,
        transaction,
      });
    } catch (err) {
      console.error("💥 Transaction details error:", err);
      return res.status(500).json({
        error: "Failed to fetch transaction details",
        details: err instanceof Error ? err.message : "Unknown error",
      });
    }
  });

  // ============================================================
  // FARMER-GROUP CONTRACTS
  // ============================================================

  /**
   * Get all active contracts for a group
   * GET /:groupId/contracts
   */
  router.get("/:groupId/contracts", async (req, res) => {
    try {
      const { groupId } = req.params;

      const contracts = await db.any(
        `SELECT 
          c.id,
          c.farmer_id,
          c.distribution_percentage,
          c.fixed_fee_per_transaction,
          c.effective_from,
          c.effective_to,
          c.is_active,
          c.signed_by_farmer,
          c.signed_by_group,
          c.terms,
          c.created_at,
          f.first_name,
          f.last_name,
          f.mobile
         FROM farmer_group_contracts c
         JOIN farmers f ON c.farmer_id = f.id
         WHERE c.group_id = $1 AND c.is_active = true
         ORDER BY f.last_name ASC`,
        [groupId]
      );

      return res.json({
        success: true,
        contracts,
        count: contracts.length,
      });
    } catch (err) {
      console.error("💥 Contracts error:", err);
      return res.status(500).json({
        error: "Failed to fetch contracts",
        details: err instanceof Error ? err.message : "Unknown error",
      });
    }
  });

  /**
   * Create or update a farmer-group contract
   * POST /:groupId/contracts
   */
  router.post("/:groupId/contracts", async (req, res) => {
    try {
      const { groupId } = req.params;
      const {
        farmer_id,
        distribution_percentage = 100,
        fixed_fee_per_transaction = 0,
        terms = {},
        created_by,
      } = req.body;

      if (!farmer_id) {
        return res.status(400).json({ error: "farmer_id is required" });
      }

      // Verify farmer belongs to this group
      const farmer = await db.oneOrNone(
        `SELECT id, group_id FROM farmers WHERE id = $1`,
        [farmer_id]
      );

      if (!farmer) {
        return res.status(404).json({ error: "Farmer not found" });
      }

      if (farmer.group_id !== groupId) {
        return res.status(400).json({
          error: "Farmer does not belong to this group",
        });
      }

      // Upsert contract (one active contract per farmer-group)
      const contract = await db.one(
        `INSERT INTO farmer_group_contracts 
          (farmer_id, group_id, distribution_percentage, 
           fixed_fee_per_transaction, terms, created_by)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (farmer_id, group_id, effective_from) 
         DO UPDATE SET 
           distribution_percentage = EXCLUDED.distribution_percentage,
           fixed_fee_per_transaction = EXCLUDED.fixed_fee_per_transaction,
           terms = EXCLUDED.terms,
           updated_at = NOW()
         RETURNING *`,
        [
          farmer_id,
          groupId,
          distribution_percentage,
          fixed_fee_per_transaction,
          JSON.stringify(terms),
          created_by || null,
        ]
      );

      return res.status(201).json({
        success: true,
        contract,
      });
    } catch (err) {
      console.error("💥 Create contract error:", err);
      return res.status(500).json({
        error: "Failed to create contract",
        details: err instanceof Error ? err.message : "Unknown error",
      });
    }
  });

  // ============================================================
  // COOPERATIVE CUSTODY (Value Chain Visibility)
  // ============================================================

  /**
   * Get all custody records for a group
   * GET /:groupId/custody?status=in_custody
   */
  router.get("/:groupId/custody", async (req, res) => {
    try {
      const { groupId } = req.params;
      const { status } = req.query;

      let query = `
        SELECT 
          c.*,
          f.first_name,
          f.last_name,
          f.mobile
        FROM cooperative_custody_records c
        JOIN farmers f ON c.farmer_id = f.id
        WHERE c.group_id = $1
      `;
      const params: any[] = [groupId];

      if (status) {
        params.push(status);
        query += ` AND c.status = $${params.length}`;
      }

      query += ` ORDER BY c.received_at DESC`;

      const records = await db.any(query, params);

      // Compute summary
      const summary = await db.one(
        `SELECT 
          COUNT(*)::int as total_records,
          COALESCE(SUM(quantity), 0) as total_quantity,
          COALESCE(SUM(expected_total_value), 0) as total_expected_value,
          COUNT(*) FILTER (WHERE status = 'in_custody')::int as in_custody_count,
          COUNT(*) FILTER (WHERE status = 'sold')::int as sold_count,
          COUNT(*) FILTER (WHERE status = 'distributed')::int as distributed_count
         FROM cooperative_custody_records 
         WHERE group_id = $1`,
        [groupId]
      );

      return res.json({
        success: true,
        records,
        summary,
      });
    } catch (err) {
      console.error("💥 Custody error:", err);
      return res.status(500).json({
        error: "Failed to fetch custody records",
        details: err instanceof Error ? err.message : "Unknown error",
      });
    }
  });

  /**
   * Get custody records for a specific farmer
   * GET /farmer/:farmerId/custody
   */
  router.get("/farmer/:farmerId/custody", async (req, res) => {
    try {
      const { farmerId } = req.params;

      const records = await db.any(
        `SELECT 
          c.*,
          g.name as group_name
         FROM cooperative_custody_records c
         JOIN groups g ON c.group_id = g.id
         WHERE c.farmer_id = $1
         ORDER BY c.received_at DESC`,
        [farmerId]
      );

      return res.json({
        success: true,
        records,
        count: records.length,
      });
    } catch (err) {
      console.error("💥 Farmer custody error:", err);
      return res.status(500).json({
        error: "Failed to fetch farmer custody",
        details: err instanceof Error ? err.message : "Unknown error",
      });
    }
  });

  /**
   * Create a custody record (farmer drops produce at cooperative)
   * POST /farmer/:farmerId/custody
   */
  router.post("/farmer/:farmerId/custody", async (req, res) => {
    try {
      const { farmerId } = req.params;
      const {
        group_id,
        farm_product_id,
        product_name,
        quantity,
        unit,
        expected_price_per_unit,
        notes,
      } = req.body;

      if (!group_id || !product_name || !quantity || !unit) {
        return res.status(400).json({
          error: "Missing required fields",
          required: ["group_id", "product_name", "quantity", "unit"],
        });
      }

      // Verify farmer belongs to group
      const farmer = await db.oneOrNone(
        `SELECT id, group_id FROM farmers WHERE id = $1`,
        [farmerId]
      );

      if (!farmer) {
        return res.status(404).json({ error: "Farmer not found" });
      }

      if (farmer.group_id !== group_id) {
        return res.status(400).json({
          error: "Farmer does not belong to this group",
        });
      }

      const expectedTotalValue =
        expected_price_per_unit && quantity
          ? parseFloat(expected_price_per_unit) * parseFloat(quantity)
          : null;

      const record = await db.one(
        `INSERT INTO cooperative_custody_records
          (group_id, farmer_id, farm_product_id, product_name, 
           quantity, unit, expected_price_per_unit, expected_total_value,
           notes, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'in_custody')
         RETURNING *`,
        [
          group_id,
          farmerId,
          farm_product_id || null,
          product_name,
          quantity,
          unit,
          expected_price_per_unit || null,
          expectedTotalValue,
          notes || null,
        ]
      );

      return res.status(201).json({
        success: true,
        record,
      });
    } catch (err) {
      console.error("💥 Create custody error:", err);
      return res.status(500).json({
        error: "Failed to create custody record",
        details: err instanceof Error ? err.message : "Unknown error",
      });
    }
  });

  return router;
};
