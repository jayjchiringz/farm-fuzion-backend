// src/services/UnipesaService.ts
/* eslint-disable @typescript-eslint/no-explicit-any */
import axios, { AxiosInstance, AxiosError } from 'axios';

export interface UnipesaConfig {
  baseUrl: string;
  apiKey: string;
  apiSecret: string;
  merchantId: string;
  terminalId?: string;
}

export interface UnipesaTransaction {
  transactionId: string;
  type: 'topup' | 'transfer_wallet' | 'transfer_external';
  status: 'pending' | 'completed' | 'failed';
  userId: string;
  counterparty: any | null;
  amount: string;
  fee: string;
  currency: 'KES';
  createdAt: string;
  completedAt: string | null;
}

export interface UnipesaUser {
  userId: string;
  externalUserId: string | null;
  phoneNumber: string;
  firstName: string;
  lastName: string;
  email: string | null;
  countryCode: string;
  kycStatus: 'pending' | 'submitted';
  wallet: {
    walletId: string;
    balance: string;
    currency: 'KES';
  };
  createdAt: string;
}

export class UnipesaService {
  private client: AxiosInstance;
  private config: UnipesaConfig;

  constructor(config: UnipesaConfig) {
    this.config = config;
    
    // ✅ Create client with API keys on ALL requests
    this.client = axios.create({
      baseURL: config.baseUrl,
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': config.apiKey,
        'X-Api-Secret': config.apiSecret,
      },
    });

    // ✅ Error interceptor - NO token refresh logic needed
    this.client.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => {
        console.error('Unipesa API Error:', error.response?.status, error.response?.data);
        throw error;
      }
    );
  }

  // ==================== USERS ====================

  /**
   * Register a user and create a wallet
   * POST /users
   */
  async registerUser(data: {
    phoneNumber: string;
    firstName: string;
    lastName: string;
    email?: string;
    countryCode?: string;
    externalUserId?: string;
  }): Promise<UnipesaUser> {
    try {
      const response = await this.client.post('/users', data);
      return response.data;
    } catch (error) {
      console.error('Register user error:', error);
      throw this.handleError(error);
    }
  }

  /**
   * Get user with wallet summary
   * GET /users/{userId}
   */
  async getUser(userId: string): Promise<UnipesaUser> {
    try {
      const response = await this.client.get(`/users/${userId}`);
      return response.data;
    } catch (error) {
      console.error('Get user error:', error);
      throw this.handleError(error);
    }
  }

  /**
   * Get wallet balance
   * GET /users/{userId}/balance
   */
  async getWalletBalance(userId: string): Promise<{
    walletId: string;
    available: string;
    currency: 'KES';
  }> {
    try {
      const response = await this.client.get(`/users/${userId}/balance`);
      return response.data;
    } catch (error) {
      console.error('Get wallet balance error:', error);
      throw this.handleError(error);
    }
  }

  /**
   * List user transactions
   * GET /users/{userId}/transactions
   */
  async getUserTransactions(userId: string, params?: {
    limit?: number;
    offset?: number;
  }): Promise<{
    items: UnipesaTransaction[];
    total: number;
  }> {
    try {
      const queryParams = new URLSearchParams();
      if (params?.limit) queryParams.append('limit', String(params.limit));
      if (params?.offset) queryParams.append('offset', String(params.offset));

      const response = await this.client.get(
        `/users/${userId}/transactions?${queryParams.toString()}`
      );
      return response.data;
    } catch (error) {
      console.error('List user transactions error:', error);
      throw this.handleError(error);
    }
  }

  // ==================== PAYMENTS ====================

  /**
   * Create a top-up
   * POST /topups
   */
  async createTopup(data: {
    userId: string;
    amount: string;
    currency: 'KES';
    method: string;
    msisdn?: string;
  }): Promise<UnipesaTransaction> {
    try {
      const response = await this.client.post('/topups', data);
      return response.data;
    } catch (error) {
      console.error('Create topup error:', error);
      throw this.handleError(error);
    }
  }

  /**
   * Create a transfer
   * POST /transfers
   */
  async createTransfer(data: {
    fromUserId: string;
    amount: string;
    currency: 'KES';
    to: {
      type: 'wallet' | 'external';
      userId?: string;
      providerId?: string;
      account?: string;
    };
  }): Promise<UnipesaTransaction> {
    try {
      const response = await this.client.post('/transfers', data);
      return response.data;
    } catch (error) {
      console.error('Create transfer error:', error);
      throw this.handleError(error);
    }
  }

  /**
   * Get transaction by ID
   * GET /transactions/{transactionId}
   */
  async getTransaction(transactionId: string): Promise<UnipesaTransaction> {
    try {
      const response = await this.client.get(`/transactions/${transactionId}`);
      return response.data;
    } catch (error) {
      console.error('Get transaction error:', error);
      throw this.handleError(error);
    }
  }

  // ==================== PROVIDERS ====================

  /**
   * List external providers available on UPP
   * GET /providers
   */
  async listProviders(): Promise<{
    items: Array<{
      id: string;
      name: string;
      countryCode: string;
      capabilities: Array<'topup' | 'payout'>;
    }>;
  }> {
    try {
      const response = await this.client.get('/providers');
      return response.data;
    } catch (error) {
      console.error('List providers error:', error);
      throw this.handleError(error);
    }
  }

  // ==================== MERCHANT ====================

  /**
   * Get merchant main account
   * GET /merchant/account
   */
  async getMerchantAccount(): Promise<{
    merchantId: string;
    terminalId: string;
    environment: 'sandbox' | 'production';
    mainAccount: {
      balance: string;
      currency: 'KES';
    };
  }> {
    try {
      const response = await this.client.get('/merchant/account');
      return response.data;
    } catch (error) {
      console.error('Get merchant account error:', error);
      throw this.handleError(error);
    }
  }

  // ==================== SERVICE ====================

  /**
   * Health check (no auth)
   * GET /health
   */
  async healthCheck(): Promise<{ status: string }> {
    try {
      const response = await this.client.get('/health');
      return response.data;
    } catch (error) {
      console.error('Health check error:', error);
      throw this.handleError(error);
    }
  }

  // ==================== HELPERS ====================

  private handleError(error: any): Error {
    if (axios.isAxiosError(error)) {
      const message = error.response?.data?.error?.message || error.message;
      const status = error.response?.status;
      return new Error(`Unipesa API Error (${status}): ${message}`);
    }
    return new Error(`Unipesa Error: ${error.message || 'Unknown error'}`);
  }
}