// src/services/GroupWalletService.ts
import { UnipesaService } from './UnipesaService';
import { Pool } from 'pg';

export class GroupWalletService {
  constructor(
    private unipesa: UnipesaService,
    private pool: Pool
  ) {}

  // ==================== GROUP WALLET ====================
  
  async registerGroupWallet(groupId: string) {
    // Check if already registered
    const existing = await this.pool.query(
      `SELECT unipesa_user_id FROM groups WHERE id = $1`,
      [groupId]
    );
    
    if (existing.rows[0]?.unipesa_user_id) {
      return { 
        success: true, 
        alreadyRegistered: true,
        unipesaUserId: existing.rows[0].unipesa_user_id 
      };
    }
    
    // Fetch group details
    const groupResult = await this.pool.query(
      `SELECT g.id, g.name, g.county, g.location, g.group_type_id
       FROM groups g WHERE g.id = $1`,
      [groupId]
    );
    
    if (!groupResult.rows[0]) {
      throw new Error('Group not found');
    }
    
    const group = groupResult.rows[0];
    
    // Register with Unipesa
    const user = await this.unipesa.registerUser({
      phoneNumber: group.mobile || `+254000000000`, // Fallback
      firstName: group.name,
      lastName: 'Group',
      externalUserId: `group_${group.id}`,
      countryCode: 'KE',
    });
    
    // Store in DB
    await this.pool.query(
      `UPDATE groups 
       SET unipesa_user_id = $1, 
           unipesa_wallet_id = $2,
           wallet_status = 'active'
       WHERE id = $3`,
      [user.userId, user.wallet.walletId, groupId]
    );
    
    return {
      success: true,
      unipesaUserId: user.userId,
      walletId: user.wallet.walletId,
    };
  }
  
  async getGroupBalance(groupId: string) {
    const result = await this.pool.query(
      `SELECT unipesa_user_id FROM groups WHERE id = $1`,
      [groupId]
    );
    
    if (!result.rows[0]?.unipesa_user_id) {
      throw new Error('Group wallet not registered');
    }
    
    return await this.unipesa.getWalletBalance(result.rows[0].unipesa_user_id);
  }
  
  // ==================== MULTI-SIG WORKFLOW ====================
  
  async initiateTransaction(params: {
    groupId: string;
    transactionType: string;
    amount: number;
    initiatedBy: string;
    metadata?: any;
    description?: string;
  }) {
    const { groupId, transactionType, amount, initiatedBy, metadata = {}, description } = params;
    
    // Validate group has active wallet
    const groupCheck = await this.pool.query(
      `SELECT unipesa_user_id, approval_threshold 
       FROM groups WHERE id = $1 AND wallet_status = 'active'`,
      [groupId]
    );
    
    if (!groupCheck.rows[0]) {
      throw new Error('Group wallet not active');
    }
    
    // Validate initiator is a group admin
    const adminCheck = await this.pool.query(
      `SELECT 1 FROM group_admins 
       WHERE group_id = $1 AND user_id = $2 AND status = 'active'`,
      [groupId, initiatedBy]
    );
    
    if (!adminCheck.rows[0]) {
      throw new Error('Only group admins can initiate transactions');
    }
    
    const requiredApprovals = groupCheck.rows[0].approval_threshold || 2;
    
    // Create request
    const result = await this.pool.query(
      `INSERT INTO group_transaction_requests 
        (group_id, transaction_type, amount, metadata, description, 
         initiated_by, required_approvals, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
       RETURNING *`,
      [groupId, transactionType, amount, metadata, description, initiatedBy, requiredApprovals]
    );
    
    // Audit log
    await this.logAudit(groupId, initiatedBy, 'transaction_initiated', 
      'group_transaction_requests', result.rows[0].id, null, result.rows[0]);
    
    return result.rows[0];
  }
  
  async approveTransaction(params: {
    requestId: string;
    userId: string;
    decision: 'approved' | 'rejected';
    comments?: string;
    ipAddress?: string;
    userAgent?: string;
  }) {
    const { requestId, userId, decision, comments, ipAddress, userAgent } = params;
    
    // Fetch request
    const reqResult = await this.pool.query(
      `SELECT * FROM group_transaction_requests 
       WHERE id = $1 AND status IN ('pending', 'partially_approved')`,
      [requestId]
    );
    
    if (!reqResult.rows[0]) {
      throw new Error('Request not found or already finalized');
    }
    
    const request = reqResult.rows[0];
    
    // Validate user is a group admin
    const adminCheck = await this.pool.query(
      `SELECT 1 FROM group_admins 
       WHERE group_id = $1 AND user_id = $2 AND status = 'active'`,
      [request.group_id, userId]
    );
    
    if (!adminCheck.rows[0]) {
      throw new Error('Only group admins can approve transactions');
    }
    
    // Prevent self-approval (optional, but recommended)
    if (request.initiated_by === userId && decision === 'approved') {
      throw new Error('Initiator cannot approve their own transaction');
    }
    
    // Record approval
    await this.pool.query(
      `INSERT INTO group_transaction_approvals 
        (request_id, user_id, decision, comments, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (request_id, user_id) DO NOTHING`,
      [requestId, userId, decision, comments, ipAddress, userAgent]
    );
    
    // Count approvals
    const countResult = await this.pool.query(
      `SELECT 
        COUNT(*) FILTER (WHERE decision = 'approved') as approvals,
        COUNT(*) FILTER (WHERE decision = 'rejected') as rejections
       FROM group_transaction_approvals WHERE request_id = $1`,
      [requestId]
    );
    
    const approvals = parseInt(countResult.rows[0].approvals);
    const rejections = parseInt(countResult.rows[0].rejections);
    
    // Update status
    let newStatus = request.status;
    if (approvals >= request.required_approvals) {
      newStatus = 'approved';
    } else if (rejections > 0) {
      newStatus = 'rejected';
    } else if (approvals > 0) {
      newStatus = 'partially_approved';
    }
    
    await this.pool.query(
      `UPDATE group_transaction_requests 
       SET status = $1, current_approvals = $2, updated_at = NOW()
       WHERE id = $3`,
      [newStatus, approvals, requestId]
    );
    
    // Audit
    await this.logAudit(request.group_id, userId, `transaction_${decision}`, 
      'group_transaction_requests', requestId, { status: request.status }, { status: newStatus });
    
    // Auto-execute if approved
    if (newStatus === 'approved') {
      await this.executeApprovedTransaction(requestId);
    }
    
    return { status: newStatus, approvals, rejections };
  }
  
  async executeApprovedTransaction(requestId: string) {
    const reqResult = await this.pool.query(
      `SELECT r.*, g.unipesa_user_id as group_unipesa_id
       FROM group_transaction_requests r
       JOIN groups g ON r.group_id = g.id
       WHERE r.id = $1 AND r.status = 'approved'`,
      [requestId]
    );
    
    if (!reqResult.rows[0]) {
      throw new Error('Request not found or not approved');
    }
    
    const request = reqResult.rows[0];
    
    try {
      const result = await this.executeByType(request);
      
      await this.pool.query(
        `UPDATE group_transaction_requests 
         SET status = 'executed', 
             unipesa_transaction_id = $1, 
             executed_at = NOW(),
             updated_at = NOW()
         WHERE id = $2`,
        [result.transactionId || result.unipesaId, requestId]
      );
      
      return result;
    } catch (error: any) {
      await this.pool.query(
        `UPDATE group_transaction_requests 
         SET status = 'failed', 
             execution_error = $1, 
             updated_at = NOW()
         WHERE id = $2`,
        [error.message, requestId]
      );
      throw error;
    }
  }
  
  private async executeByType(request: any) {
    // Route to specific handler based on transaction_type
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
        return { message: 'Bulk sale receipt - funds already in group wallet' };
      default:
        throw new Error(`Unknown transaction type: ${request.transaction_type}`);
    }
  }
  
  private async executeDistribution(request: any) {
    // Transfer from group wallet to farmer wallet
    const { farmer_id, amount } = request.metadata;
    
    if (!farmer_id) {
      throw new Error('Missing farmer_id in metadata');
    }
    
    const farmerResult = await this.pool.query(
      `SELECT unipesa_user_id FROM farmers WHERE id = $1`,
      [farmer_id]
    );
    
    if (!farmerResult.rows[0]?.unipesa_user_id) {
      throw new Error('Farmer has no Unipesa wallet');
    }
    
    const groupResult = await this.pool.query(
      `SELECT unipesa_user_id FROM groups WHERE id = $1`,
      [request.group_id]
    );
    
    const transfer = await this.unipesa.createTransfer({
      fromUserId: groupResult.rows[0].unipesa_user_id,
      amount: parseFloat(request.amount).toFixed(2),
      currency: 'KES',
      to: {
        type: 'wallet',
        userId: farmerResult.rows[0].unipesa_user_id,
      },
    });
    
    // Record transaction
    await this.pool.query(
      `INSERT INTO wallet_transactions
        (farmer_id, type, amount, source, direction, method, status, 
         meta, reference_no, group_id, is_group_transaction)
       VALUES ($1, 'transfer', $2, $3, 'in', 'unipesa', $4, $5, $6, $7, true)`,
      [farmer_id, request.amount, `group_${request.group_id}`, 
       transfer.status, JSON.stringify(request.metadata),
       transfer.transactionId, request.group_id]
    );
    
    return transfer;
  }
  
  private async executeFeeCollection(request: any) {
    // Transfer from farmer wallet to group wallet
    const { farmer_id } = request.metadata;
    
    const farmerResult = await this.pool.query(
      `SELECT unipesa_user_id FROM farmers WHERE id = $1`,
      [farmer_id]
    );
    
    const groupResult = await this.pool.query(
      `SELECT unipesa_user_id FROM groups WHERE id = $1`,
      [request.group_id]
    );
    
    const transfer = await this.unipesa.createTransfer({
      fromUserId: farmerResult.rows[0].unipesa_user_id,
      amount: parseFloat(request.amount).toFixed(2),
      currency: 'KES',
      to: {
        type: 'wallet',
        userId: groupResult.rows[0].unipesa_user_id,
      },
    });
    
    return transfer;
  }
  
  private async executeExternalPayment(request: any) {
    // Transfer from group wallet to external provider
    const { providerId = 'MPESA', account } = request.metadata;
    
    const groupResult = await this.pool.query(
      `SELECT unipesa_user_id FROM groups WHERE id = $1`,
      [request.group_id]
    );
    
    return await this.unipesa.createTransfer({
      fromUserId: groupResult.rows[0].unipesa_user_id,
      amount: parseFloat(request.amount).toFixed(2),
      currency: 'KES',
      to: {
        type: 'external',
        providerId,
        account,
      },
    });
  }
  
  async getPendingApprovals(groupId: string, userId: string) {
    const result = await this.pool.query(
      `SELECT 
        r.*,
        u.email as initiated_by_email,
        (SELECT json_agg(json_build_object(
          'user_id', a.user_id,
          'decision', a.decision,
          'comments', a.comments,
          'created_at', a.created_at
        )) FROM group_transaction_approvals a WHERE a.request_id = r.id) as approvals
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
    
    return result.rows;
  }
  
  private async logAudit(
    groupId: string, userId: string, action: string,
    entityType: string, entityId: string,
    oldValues: any, newValues: any
  ) {
    await this.pool.query(
      `INSERT INTO group_wallet_audit 
        (group_id, user_id, action, entity_type, entity_id, old_values, new_values)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [groupId, userId, action, entityType, entityId, 
       oldValues ? JSON.stringify(oldValues) : null,
       newValues ? JSON.stringify(newValues) : null]
    );
  }
}