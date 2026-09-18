// src/services/GroupWalletService.ts
/* eslint-disable @typescript-eslint/no-explicit-any */
import { UnipesaService } from './UnipesaService';

interface DbConnection {
  oneOrNone: (query: string, params?: any[]) => Promise<any>;
  one: (query: string, params?: any[]) => Promise<any>;
  none: (query: string, params?: any[]) => Promise<any>;
  any: (query: string, params?: any[]) => Promise<any[]>;
  tx: (callback: (t: DbConnection) => Promise<any>) => Promise<any>;
}

export interface GroupTransactionRequest {
  id: string;
  group_id: string;
  transaction_type: string;
  amount: number;
  currency: string;
  metadata: any;
  description: string | null;
  status: 'pending' | 'partially_approved' | 'approved' | 'rejected' | 'executed' | 'failed' | 'cancelled';
  required_approvals: number;
  current_approvals: number;
  initiated_by: string;
  initiated_at: Date;
  unipesa_transaction_id: string | null;
  executed_at: Date | null;
}

export class GroupWalletService {
  private unipesa: UnipesaService;
  private db: DbConnection;

  constructor(unipesa: UnipesaService, db: DbConnection) {
    this.unipesa = unipesa;
    this.db = db;
  }

  // ==================== GROUP WALLET REGISTRATION ====================

  /**
   * Register a group wallet with Unipesa
   * Called when group is approved or manually initiated
   */
  async registerGroupWallet(groupId: string) {
    // Check if already registered
    const existing = await this.db.oneOrNone(
      `SELECT unipesa_user_id, unipesa_wallet_id, wallet_status, approval_threshold
       FROM groups WHERE id = $1`,
      [groupId]
    );

    if (!existing) {
      throw new Error('Group not found');
    }

    if (existing.unipesa_user_id && existing.wallet_status === 'active') {
      return {
        success: true,
        alreadyRegistered: true,
        unipesaUserId: existing.unipesa_user_id,
        walletId: existing.unipesa_wallet_id,
        approvalThreshold: existing.approval_threshold,
      };
    }

    // Fetch group details for registration
    const group = await this.db.oneOrNone(
      `SELECT id, name, county, location, registration_number
       FROM groups WHERE id = $1`,
      [groupId]
    );

    // Get first active group admin's phone (for Unipesa registration)
    const admin = await this.db.oneOrNone(
      `SELECT ga.mobile
       FROM group_admins ga
       WHERE ga.group_id = $1 AND ga.status = 'active'
       ORDER BY ga.created_at ASC
       LIMIT 1`,
      [groupId]
    );

    const phoneNumber = admin?.mobile || '+254700000000'; // Fallback

    // Register with Unipesa (uses externalUserId = group_id)
    const unipesaUser = await this.unipesa.registerUser({
      phoneNumber,
      firstName: group.name.substring(0, 50),
      lastName: 'Group',
      externalUserId: `group_${group.id}`,
      countryCode: 'KE',
    });

    // Store in groups table
    await this.db.none(
      `UPDATE groups 
       SET unipesa_user_id = $1, 
           unipesa_wallet_id = $2,
           wallet_status = 'active'
       WHERE id = $3`,
      [unipesaUser.userId, unipesaUser.wallet.walletId, groupId]
    );

    // Audit log
    await this.logAudit(groupId, null, 'group_wallet_registered', 
      'groups', groupId, null, {
        unipesaUserId: unipesaUser.userId,
        walletId: unipesaUser.wallet.walletId,
      });

    return {
      success: true,
      unipesaUserId: unipesaUser.userId,
      walletId: unipesaUser.wallet.walletId,
      approvalThreshold: existing.approval_threshold || 2,
    };
  }

  /**
   * Get group wallet balance
   */
  async getGroupBalance(groupId: string) {
    const group = await this.db.oneOrNone(
      `SELECT unipesa_user_id, wallet_status FROM groups WHERE id = $1`,
      [groupId]
    );

    if (!group) {
      throw new Error('Group not found');
    }

    if (!group.unipesa_user_id || group.wallet_status !== 'active') {
      throw new Error('Group wallet not registered or inactive');
    }

    const balance = await this.unipesa.getWalletBalance(group.unipesa_user_id);
    return {
      walletId: balance.walletId,
      balance: parseFloat(balance.available),
      currency: balance.currency,
      raw: balance,
    };
  }

  /**
   * Get group transaction history from Unipesa
   */
  async getGroupUnipesaTransactions(groupId: string, params?: {
    limit?: number;
    offset?: number;
  }) {
    const group = await this.db.oneOrNone(
      `SELECT unipesa_user_id FROM groups WHERE id = $1`,
      [groupId]
    );

    if (!group?.unipesa_user_id) {
      throw new Error('Group wallet not registered');
    }

    return await this.unipesa.getUserTransactions(group.unipesa_user_id, params);
  }

  // ==================== MULTI-SIGNATURE WORKFLOW ====================

  /**
   * Initiate a group transaction (requires approval)
   */
  async initiateTransaction(params: {
    groupId: string;
    transactionType: 'bulk_sale_receipt' | 'distribution_to_farmer' | 
                     'bulk_distribution' | 'fee_collection' | 
                     'external_payment' | 'withdrawal';
    amount: number;
    initiatedBy: string; // user_id (uuid)
    metadata?: any;
    description?: string;
  }) {
    const { groupId, transactionType, amount, initiatedBy, metadata = {}, description } = params;

    // Validate group wallet is active
    const group = await this.db.oneOrNone(
      `SELECT unipesa_user_id, wallet_status, approval_threshold 
       FROM groups WHERE id = $1`,
      [groupId]
    );

    if (!group) throw new Error('Group not found');
    if (group.wallet_status !== 'active') throw new Error('Group wallet not active');

    // Validate initiator is an active group admin
    const isAdmin = await this.db.oneOrNone(
      `SELECT 1 FROM group_admins 
       WHERE group_id = $1 AND user_id = $2 AND status = 'active'`,
      [groupId, initiatedBy]
    );

    if (!isAdmin) {
      throw new Error('Only active group admins can initiate transactions');
    }

    const requiredApprovals = group.approval_threshold || 2;

    // Create the request
    const result = await this.db.one(
      `INSERT INTO group_transaction_requests 
        (group_id, transaction_type, amount, metadata, description, 
         initiated_by, required_approvals, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
       RETURNING *`,
      [
        groupId, 
        transactionType, 
        amount, 
        JSON.stringify(metadata), 
        description || null, 
        initiatedBy, 
        requiredApprovals
      ]
    );

    // Audit log
    await this.logAudit(
      groupId, initiatedBy, 'transaction_initiated',
      'group_transaction_requests', result.id, null, result
    );

    return {
      request: result,
      approvalsRequired: requiredApprovals,
    };
  }

  /**
   * Approve or reject a transaction
   */
  async submitApproval(params: {
    requestId: string;
    userId: string;
    decision: 'approved' | 'rejected';
    comments?: string;
    ipAddress?: string;
    userAgent?: string;
  }) {
    const { requestId, userId, decision, comments, ipAddress, userAgent } = params;

    // Fetch the request
    const request = await this.db.oneOrNone(
      `SELECT * FROM group_transaction_requests 
       WHERE id = $1 AND status IN ('pending', 'partially_approved')`,
      [requestId]
    );

    if (!request) {
      throw new Error('Request not found or already finalized');
    }

    // Validate user is an active group admin
    const isAdmin = await this.db.oneOrNone(
      `SELECT 1 FROM group_admins 
       WHERE group_id = $1 AND user_id = $2 AND status = 'active'`,
      [request.group_id, userId]
    );

    if (!isAdmin) {
      throw new Error('Only active group admins can approve/reject transactions');
    }

    // Prevent self-approval (safer for financial controls)
    if (request.initiated_by === userId && decision === 'approved') {
      throw new Error('Initiator cannot approve their own transaction');
    }

    // Check if user already voted
    const existingVote = await this.db.oneOrNone(
      `SELECT id FROM group_transaction_approvals 
       WHERE request_id = $1 AND user_id = $2`,
      [requestId, userId]
    );

    if (existingVote) {
      throw new Error('You have already voted on this transaction');
    }

    // Record the approval
    await this.db.none(
      `INSERT INTO group_transaction_approvals 
        (request_id, user_id, decision, comments, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [requestId, userId, decision, comments || null, ipAddress || null, userAgent || null]
    );

    // Count current votes
    const votes = await this.db.one(
      `SELECT 
        COUNT(*) FILTER (WHERE decision = 'approved')::int as approvals,
        COUNT(*) FILTER (WHERE decision = 'rejected')::int as rejections
       FROM group_transaction_approvals WHERE request_id = $1`,
      [requestId]
    );

    const approvals = votes.approvals;
    const rejections = votes.rejections;

    // Determine new status
    let newStatus = request.status;
    let shouldExecute = false;

    if (approvals >= request.required_approvals) {
      newStatus = 'approved';
      shouldExecute = true;
    } else if (rejections > 0) {
      newStatus = 'rejected';
    } else if (approvals > 0) {
      newStatus = 'partially_approved';
    }

    // Update request
    await this.db.none(
      `UPDATE group_transaction_requests 
       SET status = $1, 
           current_approvals = $2, 
           updated_at = NOW()
       WHERE id = $3`,
      [newStatus, approvals, requestId]
    );

    // Audit log
    await this.logAudit(
      request.group_id, userId, `transaction_${decision}`,
      'group_transaction_requests', requestId,
      { status: request.status }, { status: newStatus }
    );

    // Auto-execute if approved
    let executionResult = null;
    if (shouldExecute) {
      try {
        executionResult = await this.executeApprovedTransaction(requestId);
      } catch (execError: any) {
        console.error('❌ Execution failed after approval:', execError);
        // The executeApprovedTransaction will handle marking as failed
      }
    }

    return {
      status: newStatus,
      approvals,
      rejections,
      requiredApprovals: request.required_approvals,
      executed: shouldExecute && executionResult !== null,
      executionResult,
    };
  }

  /**
   * Execute an approved transaction
   */
  private async executeApprovedTransaction(requestId: string) {
    // Fetch the request with group wallet info
    const request = await this.db.oneOrNone(
      `SELECT r.*, g.unipesa_user_id as group_unipesa_id
       FROM group_transaction_requests r
       JOIN groups g ON r.group_id = g.id
       WHERE r.id = $1 AND r.status = 'approved'`,
      [requestId]
    );

    if (!request) {
      throw new Error('Request not found or not in approved status');
    }

    try {
      const result = await this.executeByType(request);

      // Update request as executed
      await this.db.none(
        `UPDATE group_transaction_requests 
         SET status = 'executed', 
             unipesa_transaction_id = $1, 
             executed_at = NOW(),
             updated_at = NOW()
         WHERE id = $2`,
        [result.transactionId || null, requestId]
      );

      // Audit log
      await this.logAudit(
        request.group_id, null, 'transaction_executed',
        'group_transaction_requests', requestId,
        { status: 'approved' }, { status: 'executed', result }
      );

      return result;
    } catch (error: any) {
      // Mark as failed
      await this.db.none(
        `UPDATE group_transaction_requests 
         SET status = 'failed', 
             execution_error = $1, 
             updated_at = NOW()
         WHERE id = $2`,
        [error.message, requestId]
      );

      // Audit log
      await this.logAudit(
        request.group_id, null, 'transaction_failed',
        'group_transaction_requests', requestId,
        { status: 'approved' }, { status: 'failed', error: error.message }
      );

      throw error;
    }
  }

  /**
   * Route execution based on transaction type
   */
  private async executeByType(request: GroupTransactionRequest) {
    switch (request.transaction_type) {
      case 'distribution_to_farmer':
      case 'bulk_distribution':
        return await this.executeDistribution(request);
      case 'fee_collection':
        return await this.executeFeeCollection(request);
      case 'external_payment':
      case 'withdrawal':
        return await this.executeExternalPayment(request);
      case 'bulk_sale_receipt':
        // Bulk sale receipt is just recording that funds were received into the group wallet
        // No transfer needed - just log it
        return {
          message: 'Bulk sale receipt recorded (funds in group wallet)',
          transactionId: null,
        };
      default:
        throw new Error(`Unknown transaction type: ${request.transaction_type}`);
    }
  }

  /**
   * Distribute funds from group wallet to a farmer
   */
  private async executeDistribution(request: GroupTransactionRequest) {
    const { farmer_id, contract_id } = request.metadata;

    if (!farmer_id) {
      throw new Error('Missing farmer_id in transaction metadata');
    }

    // Get farmer's Unipesa wallet
    const farmer = await this.db.oneOrNone(
      `SELECT id, unipesa_user_id, first_name, last_name 
       FROM farmers WHERE id = $1`,
      [farmer_id]
    );

    if (!farmer) {
      throw new Error(`Farmer ${farmer_id} not found`);
    }

    if (!farmer.unipesa_user_id) {
      throw new Error(`Farmer ${farmer_id} has no Unipesa wallet`);
    }

    // Get group wallet
    const group = await this.db.oneOrNone(
      `SELECT unipesa_user_id FROM groups WHERE id = $1`,
      [request.group_id]
    );

    // Execute transfer from group wallet to farmer
    const transfer = await this.unipesa.createTransfer({
      fromUserId: group.unipesa_user_id,
      amount: parseFloat(request.amount.toString()).toFixed(2),
      currency: 'KES',
      to: {
        type: 'wallet',
        userId: farmer.unipesa_user_id,
      },
    });

    // Record in wallet_transactions for the farmer (credit)
    const reference_no = transfer.transactionId;
    await this.db.none(
      `INSERT INTO wallet_transactions
        (farmer_id, type, amount, source, direction, method, status, 
         meta, reference_no, group_id, is_group_transaction)
       VALUES ($1, 'transfer', $2, $3, 'in', 'unipesa', $4, $5, $6, $7, true)`,
      [
        farmer_id,
        request.amount,
        `group_${request.group_id}`,
        transfer.status,
        JSON.stringify({
          ...request.metadata,
          groupTransactionId: request.id,
          unipesaTransactionId: transfer.transactionId,
          description: request.description || `Distribution from group`,
        }),
        reference_no,
        request.group_id,
      ]
    );

    // Record in wallet_transactions for the group (debit)
    await this.db.none(
      `INSERT INTO wallet_transactions
        (farmer_id, type, amount, destination, direction, method, status, 
         meta, reference_no, group_id, is_group_transaction)
       VALUES ($1, 'transfer', $2, $3, 'out', 'unipesa', $4, $5, $6, $7, true)`,
      [
        `group_${request.group_id}`,
        request.amount,
        farmer_id.toString(),
        transfer.status,
        JSON.stringify({
          ...request.metadata,
          groupTransactionId: request.id,
          unipesaTransactionId: transfer.transactionId,
          recipientFarmerId: farmer_id,
        }),
        reference_no,
        request.group_id,
      ]
    );

    // If there's a custody record, update it
    if (request.metadata.custody_id) {
      await this.db.none(
        `UPDATE cooperative_custody_records 
         SET status = 'distributed',
             distributed_at = NOW(),
             farmer_share = $1,
             sale_transaction_id = $2
         WHERE id = $3`,
        [request.amount, request.id, request.metadata.custody_id]
      );
    }

    return {
      transactionId: transfer.transactionId,
      status: transfer.status,
      farmer: {
        id: farmer.id,
        name: `${farmer.first_name} ${farmer.last_name}`,
      },
      amount: request.amount,
    };
  }

  /**
   * Collect fees from a farmer's wallet to the group wallet
   */
  private async executeFeeCollection(request: GroupTransactionRequest) {
    const { farmer_id, fee_id } = request.metadata;

    if (!farmer_id) {
      throw new Error('Missing farmer_id in transaction metadata');
    }

    const farmer = await this.db.oneOrNone(
      `SELECT id, unipesa_user_id, first_name, last_name 
       FROM farmers WHERE id = $1`,
      [farmer_id]
    );

    if (!farmer?.unipesa_user_id) {
      throw new Error(`Farmer ${farmer_id} has no Unipesa wallet`);
    }

    const group = await this.db.oneOrNone(
      `SELECT unipesa_user_id FROM groups WHERE id = $1`,
      [request.group_id]
    );

    // Execute transfer from farmer to group
    const transfer = await this.unipesa.createTransfer({
      fromUserId: farmer.unipesa_user_id,
      amount: parseFloat(request.amount.toString()).toFixed(2),
      currency: 'KES',
      to: {
        type: 'wallet',
        userId: group.unipesa_user_id,
      },
    });

    const reference_no = transfer.transactionId;

    // Record farmer debit
    await this.db.none(
      `INSERT INTO wallet_transactions
        (farmer_id, type, amount, destination, direction, method, status, 
         meta, reference_no, group_id, is_group_transaction)
       VALUES ($1, 'transfer', $2, $3, 'out', 'unipesa', $4, $5, $6, $7, true)`,
      [
        farmer_id,
        request.amount,
        `group_${request.group_id}`,
        transfer.status,
        JSON.stringify({
          fee_id,
          groupTransactionId: request.id,
          unipesaTransactionId: transfer.transactionId,
          description: `Fee payment to group`,
        }),
        reference_no,
        request.group_id,
      ]
    );

    // Record group credit
    await this.db.none(
      `INSERT INTO wallet_transactions
        (farmer_id, type, amount, source, direction, method, status, 
         meta, reference_no, group_id, is_group_transaction)
       VALUES ($1, 'transfer', $2, $3, 'in', 'unipesa', $4, $5, $6, $7, true)`,
      [
        `group_${request.group_id}`,
        request.amount,
        farmer_id.toString(),
        transfer.status,
        JSON.stringify({
          fee_id,
          groupTransactionId: request.id,
          unipesaTransactionId: transfer.transactionId,
          payerFarmerId: farmer_id,
        }),
        reference_no,
        request.group_id,
      ]
    );

    return {
      transactionId: transfer.transactionId,
      status: transfer.status,
      amount: request.amount,
    };
  }

  /**
   * External payment from group wallet (e.g., insurance, supplier)
   */
  private async executeExternalPayment(request: GroupTransactionRequest) {
    const { providerId = 'MPESA', account } = request.metadata;

    if (!account) {
      throw new Error('Missing account in metadata for external payment');
    }

    const group = await this.db.oneOrNone(
      `SELECT unipesa_user_id FROM groups WHERE id = $1`,
      [request.group_id]
    );

    const transfer = await this.unipesa.createTransfer({
      fromUserId: group.unipesa_user_id,
      amount: parseFloat(request.amount.toString()).toFixed(2),
      currency: 'KES',
      to: {
        type: 'external',
        providerId,
        account,
      },
    });

    // Record in wallet_transactions
    const reference_no = transfer.transactionId;
    await this.db.none(
      `INSERT INTO wallet_transactions
        (farmer_id, type, amount, destination, direction, method, status, 
         meta, reference_no, group_id, is_group_transaction)
       VALUES ($1, 'withdraw', $2, $3, 'out', 'unipesa', $4, $5, $6, $7, true)`,
      [
        `group_${request.group_id}`,
        request.amount,
        account,
        transfer.status,
        JSON.stringify({
          providerId,
          account,
          groupTransactionId: request.id,
          unipesaTransactionId: transfer.transactionId,
          description: request.description,
        }),
        reference_no,
        request.group_id,
      ]
    );

    return {
      transactionId: transfer.transactionId,
      status: transfer.status,
      amount: request.amount,
      destination: { providerId, account },
    };
  }

  // ==================== QUERY METHODS ====================

  /**
   * Get pending approvals for a user
   */
  async getPendingApprovals(groupId: string, userId: string) {
    // First verify the user is an admin
    const isAdmin = await this.db.oneOrNone(
      `SELECT 1 FROM group_admins 
       WHERE group_id = $1 AND user_id = $2 AND status = 'active'`,
      [groupId, userId]
    );

    if (!isAdmin) {
      throw new Error('User is not an active group admin');
    }

    return await this.db.any(
      `SELECT 
        r.*,
        u.email as initiated_by_email,
        u.id as initiated_by_user_id,
        (SELECT json_agg(json_build_object(
          'user_id', a.user_id,
          'decision', a.decision,
          'comments', a.comments,
          'created_at', a.created_at,
          'user_email', u2.email
        ))
        FROM group_transaction_approvals a
        LEFT JOIN users u2 ON a.user_id = u2.id
        WHERE a.request_id = r.id) as approvals
       FROM group_transaction_requests r
       LEFT JOIN users u ON r.initiated_by = u.id
       WHERE r.group_id = $1 
         AND r.status IN ('pending', 'partially_approved')
         AND NOT EXISTS (
           SELECT 1 FROM group_transaction_approvals 
           WHERE request_id = r.id AND user_id = $2
         )
       ORDER BY r.created_at DESC`,
      [groupId, userId]
    );
  }

  /**
   * Get all transactions for a group
   */
  async getGroupTransactionRequests(groupId: string, filters?: {
    status?: string;
    limit?: number;
    offset?: number;
  }) {
    const { status, limit = 50, offset = 0 } = filters || {};

    let query = `
      SELECT 
        r.*,
        u.email as initiated_by_email,
        (SELECT COUNT(*) FROM group_transaction_approvals 
         WHERE request_id = r.id AND decision = 'approved') as approval_count,
        (SELECT COUNT(*) FROM group_transaction_approvals 
         WHERE request_id = r.id AND decision = 'rejected') as rejection_count
      FROM group_transaction_requests r
      LEFT JOIN users u ON r.initiated_by = u.id
      WHERE r.group_id = $1
    `;
    const params: any[] = [groupId];

    if (status) {
      params.push(status);
      query += ` AND r.status = $${params.length}`;
    }

    params.push(limit, offset);
    query += ` ORDER BY r.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`;

    return await this.db.any(query, params);
  }

  /**
   * Get transaction details with approvals
   */
  async getTransactionDetails(requestId: string) {
    const request = await this.db.oneOrNone(
      `SELECT 
        r.*,
        u.email as initiated_by_email,
        g.name as group_name
       FROM group_transaction_requests r
       LEFT JOIN users u ON r.initiated_by = u.id
       LEFT JOIN groups g ON r.group_id = g.id
       WHERE r.id = $1`,
      [requestId]
    );

    if (!request) return null;

    const approvals = await this.db.any(
      `SELECT 
        a.*,
        u.email as user_email,
        ga.first_name,
        ga.last_name
       FROM group_transaction_approvals a
       LEFT JOIN users u ON a.user_id = u.id
       LEFT JOIN group_admins ga ON a.user_id = ga.user_id
       WHERE a.request_id = $1
       ORDER BY a.created_at ASC`,
      [requestId]
    );

    return { ...request, approvals };
  }

  /**
   * Get group signatories (active admins)
   */
  async getGroupSignatories(groupId: string) {
    return await this.db.any(
      `SELECT 
        ga.id,
        ga.user_id,
        ga.first_name,
        ga.middle_name,
        ga.last_name,
        ga.mobile,
        ga.status,
        u.email,
        r.name as role_name
       FROM group_admins ga
       JOIN users u ON ga.user_id = u.id
       LEFT JOIN user_roles r ON u.role_id = r.id
       WHERE ga.group_id = $1
       ORDER BY ga.created_at ASC`,
      [groupId]
    );
  }

  // ==================== UTILITY ====================

  /**
   * Audit log helper
   */
  private async logAudit(
    groupId: string,
    userId: string | null,
    action: string,
    entityType: string,
    entityId: string,
    oldValues: any,
    newValues: any
  ) {
    try {
      await this.db.none(
        `INSERT INTO group_wallet_audit 
          (group_id, user_id, action, entity_type, entity_id, old_values, new_values)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          groupId,
          userId,
          action,
          entityType,
          entityId,
          oldValues ? JSON.stringify(oldValues) : null,
          newValues ? JSON.stringify(newValues) : null,
        ]
      );
    } catch (err) {
      // Don't fail the main operation if audit logging fails
      console.error('⚠️ Audit log failed:', err);
    }
  }
}
