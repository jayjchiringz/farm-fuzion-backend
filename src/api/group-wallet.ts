// src/api/group-wallet.ts
import express from "express";
import pgPromise from "pg-promise";
import { UnipesaService } from "../services/UnipesaService";
import { GroupWalletService } from "../services/GroupWalletService";

const pgp = pgPromise();

export const getGroupWalletRouter = async (dbConfig: any, unipesaConfig: any) => {
  const router = express.Router();
  const { PGUSER, PGPASS, PGHOST, PGPORT, PGDB } = dbConfig;
  
  const db = pgp({ host: PGHOST, port: PGPORT, database: PGDB, 
                   user: PGUSER, password: PGPASS, ssl: { rejectUnauthorized: false } });
  
  const unipesa = new UnipesaService(unipesaConfig);
  const groupWallet = new GroupWalletService(unipesa, db.$pool as any);
  
  // ==================== REGISTRATION ====================
  
  router.post("/:groupId/register", async (req, res) => {
    try {
      const { groupId } = req.params;
      const result = await groupWallet.registerGroupWallet(groupId);
      return res.json({ success: true, ...result });
    } catch (err) {
      console.error("💥 Group registration error:", err);
      return res.status(500).json({ 
        error: "Failed to register group wallet",
        details: err instanceof Error ? err.message : "Unknown error"
      });
    }
  });
  
  // ==================== BALANCE & INFO ====================
  
  router.get("/:groupId/balance", async (req, res) => {
    try {
      const { groupId } = req.params;
      const balance = await groupWallet.getGroupBalance(groupId);
      return res.json({ success: true, ...balance });
    } catch (err) {
      return res.status(500).json({ 
        error: "Failed to fetch group balance",
        details: err instanceof Error ? err.message : "Unknown error"
      });
    }
  });
  
  router.get("/:groupId/info", async (req, res) => {
    try {
      const result = await db.oneOrNone(
        `SELECT 
          g.id, g.name, g.unipesa_user_id, g.unipesa_wallet_id,
          g.wallet_status, g.approval_threshold,
          (SELECT COUNT(*) FROM group_admins WHERE group_id = g.id AND status = 'active') as admin_count,
          (SELECT COUNT(*) FROM farmers WHERE group_id = g.id) as farmer_count
         FROM groups g WHERE g.id = $1`,
        [req.params.groupId]
      );
      
      if (!result) return res.status(404).json({ error: "Group not found" });
      return res.json({ success: true, group: result });
    } catch (err) {
      return res.status(500).json({ error: "Failed to fetch group info" });
    }
  });
  
  // ==================== MULTI-SIG WORKFLOW ====================
  
  router.post("/:groupId/transactions/initiate", async (req, res) => {
    try {
      const { groupId } = req.params;
      const { transaction_type, amount, initiated_by, metadata, description } = req.body;
      
      if (!transaction_type || !amount || !initiated_by) {
        return res.status(400).json({ 
          error: "transaction_type, amount, and initiated_by required" 
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
      
      return res.status(201).json({ success: true, request: result });
    } catch (err) {
      return res.status(500).json({ 
        error: "Failed to initiate transaction",
        details: err instanceof Error ? err.message : "Unknown error"
      });
    }
  });
  
  router.post("/transactions/:requestId/approve", async (req, res) => {
    try {
      const { requestId } = req.params;
      const { user_id, decision, comments } = req.body;
      
      if (!user_id || !decision) {
        return res.status(400).json({ error: "user_id and decision required" });
      }
      
      const result = await groupWallet.approveTransaction({
        requestId,
        userId: user_id,
        decision,
        comments,
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
      });
      
      return res.json({ success: true, ...result });
    } catch (err) {
      return res.status(500).json({ 
        error: "Failed to process approval",
        details: err instanceof Error ? err.message : "Unknown error"
      });
    }
  });
  
  router.get("/:groupId/pending-approvals", async (req, res) => {
    try {
      const { groupId } = req.params;
      const { user_id } = req.query;
      
      if (!user_id) {
        return res.status(400).json({ error: "user_id required" });
      }
      
      const requests = await groupWallet.getPendingApprovals(
        groupId, 
        user_id as string
      );
      
      return res.json({ success: true, requests });
    } catch (err) {
      return res.status(500).json({ error: "Failed to fetch pending approvals" });
    }
  });
  
  router.get("/:groupId/transactions", async (req, res) => {
    try {
      const { groupId } = req.params;
      const { status, limit = 50, offset = 0 } = req.query;
      
      const result = await db.any(
        `SELECT r.*, 
          u.email as initiated_by_email,
          (SELECT COUNT(*) FROM group_transaction_approvals WHERE request_id = r.id AND decision = 'approved') as approval_count
         FROM group_transaction_requests r
         LEFT JOIN users u ON r.initiated_by = u.id
         WHERE r.group_id = $1
         ${status ? "AND r.status = $4" : ""}
         ORDER BY r.created_at DESC
         LIMIT $2 OFFSET $3`,
        status 
          ? [groupId, limit, offset, status]
          : [groupId, limit, offset]
      );
      
      return res.json({ success: true, transactions: result });
    } catch (err) {
      return res.status(500).json({ error: "Failed to fetch transactions" });
    }
  });
  
  // ==================== CONTRACTS ====================
  
  router.get("/:groupId/contracts", async (req, res) => {
    try {
      const result = await db.any(
        `SELECT c.*, f.first_name, f.last_name, f.mobile
         FROM farmer_group_contracts c
         JOIN farmers f ON c.farmer_id = f.id
         WHERE c.group_id = $1 AND c.is_active = true
         ORDER BY f.last_name`,
        [req.params.groupId]
      );
      
      return res.json({ success: true, contracts: result });
    } catch (err) {
      return res.status(500).json({ error: "Failed to fetch contracts" });
    }
  });
  
  router.post("/:groupId/contracts", async (req, res) => {
    try {
      const { groupId } = req.params;
      const { farmer_id, distribution_percentage, fixed_fee_per_transaction, created_by } = req.body;
      
      const result = await db.one(
        `INSERT INTO farmer_group_contracts 
          (farmer_id, group_id, distribution_percentage, fixed_fee_per_transaction, created_by)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (farmer_id, group_id, effective_from) 
         DO UPDATE SET 
           distribution_percentage = EXCLUDED.distribution_percentage,
           fixed_fee_per_transaction = EXCLUDED.fixed_fee_per_transaction,
           updated_at = NOW()
         RETURNING *`,
        [farmer_id, groupId, distribution_percentage || 100, 
         fixed_fee_per_transaction || 0, created_by]
      );
      
      return res.status(201).json({ success: true, contract: result });
    } catch (err) {
      return res.status(500).json({ error: "Failed to create contract" });
    }
  });
  
  // ==================== CUSTODY (Visibility) ====================
  
  router.get("/:groupId/custody", async (req, res) => {
    try {
      const result = await db.any(
        `SELECT c.*, f.first_name, f.last_name, f.mobile
         FROM cooperative_custody_records c
         JOIN farmers f ON c.farmer_id = f.id
         WHERE c.group_id = $1
         ORDER BY c.received_at DESC`,
        [req.params.groupId]
      );
      
      return res.json({ success: true, custody_records: result });
    } catch (err) {
      return res.status(500).json({ error: "Failed to fetch custody records" });
    }
  });
  
  router.get("/farmer/:farmerId/custody", async (req, res) => {
    try {
      const result = await db.any(
        `SELECT c.*, g.name as group_name
         FROM cooperative_custody_records c
         JOIN groups g ON c.group_id = g.id
         WHERE c.farmer_id = $1
         ORDER BY c.received_at DESC`,
        [req.params.farmerId]
      );
      
      return res.json({ success: true, custody_records: result });
    } catch (err) {
      return res.status(500).json({ error: "Failed to fetch farmer custody" });
    }
  });
  
  return router;
};