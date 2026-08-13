// src/services/UnipesaService.ts
/* eslint-disable @typescript-eslint/no-explicit-any */
import axios, { AxiosInstance, AxiosError, AxiosRequestHeaders } from 'axios';

export interface UnipesaConfig {
  baseUrl: string;
  apiKey: string;
  apiSecret: string;
  merchantId: string;
  terminalId?: string;
}

export interface UnipesaTransaction {
  id: string;
  amount: number;
  currency: string;
  status: 'pending' | 'completed' | 'failed' | 'cancelled';
  reference: string;
  description?: string;
  metadata?: Record<string, any>;
}

export interface UnipesaUser {
  id: string;
  email: string;
  phoneNumber: string;
  firstName?: string;
  lastName?: string;
  profile?: Record<string, any>;
}

export class UnipesaService {
  private client: AxiosInstance;
  private config: UnipesaConfig;
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private tokenExpiry: Date | null = null;

  constructor(config: UnipesaConfig) {
    this.config = config;
    this.client = axios.create({
      baseURL: config.baseUrl,
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': config.apiKey,
      },
    });

    // Add response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        if (error.response?.status === 401) {
          // Token expired, try to refresh
          await this.refreshAccessToken();
          // Retry the original request
          const originalRequest = error.config;
          if (originalRequest) {
            if (originalRequest.headers) {
              (originalRequest.headers as any).Authorization = `Bearer ${this.accessToken}`;
            }
            return this.client.request(originalRequest);
          }
        }
        throw error;
      }
    );
  }

  // ==================== AUTHENTICATION ====================

  /**
   * Sign in a user using PIN authentication
   */
  async signInWithPin(phoneNumber: string, pin: string): Promise<{ accessToken: string; refreshToken: string }> {
    try {
      const response = await this.client.post('/identity/Auth/Sign-In/Pin', {
        phoneNumber,
        pin,
      });

      this.accessToken = response.data.accessToken || null;
      this.refreshToken = response.data.refreshToken || null;
      this.tokenExpiry = new Date(Date.now() + (response.data.expiresIn || 3600) * 1000);

      return {
        accessToken: this.accessToken as string,
        refreshToken: this.refreshToken as string,
      };
    } catch (error) {
      console.error('Unipesa sign-in error:', error);
      throw this.handleError(error);
    }
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshAccessToken(): Promise<string> {
    if (!this.refreshToken) {
      throw new Error('No refresh token available');
    }

    try {
      const response = await this.client.post('/identity/Auth/Refresh-Token', {
        refreshToken: this.refreshToken,
      });

      this.accessToken = response.data.accessToken || null;
      this.tokenExpiry = new Date(Date.now() + (response.data.expiresIn || 3600) * 1000);

      return this.accessToken as string;
    } catch (error) {
      console.error('Token refresh error:', error);
      throw this.handleError(error);
    }
  }

  /**
   * Send OTP via SMS
   */
  async sendOTP(phoneNumber: string): Promise<{ otpId: string; expiresIn: number }> {
    try {
      const response = await this.client.post('/identity/Otp/Send/SMS', {
        phoneNumber,
      });
      return response.data;
    } catch (error) {
      console.error('Send OTP error:', error);
      throw this.handleError(error);
    }
  }

  /**
   * Verify OTP
   */
  async verifyOTP(otpId: string, code: string): Promise<{ verified: boolean }> {
    try {
      const response = await this.client.post('/identity/Otp/Verify/SMS', {
        otpId,
        code,
      });
      return response.data;
    } catch (error) {
      console.error('Verify OTP error:', error);
      throw this.handleError(error);
    }
  }

  /**
   * Set or reset PIN using OTP
   */
  async setPin(otpId: string, newPin: string): Promise<{ success: boolean }> {
    try {
      const response = await this.client.put('/identity/Pin/otp', {
        otpId,
        newPin,
      });
      return response.data;
    } catch (error) {
      console.error('Set PIN error:', error);
      throw this.handleError(error);
    }
  }

  /**
   * Change PIN using current PIN
   */
  async changePin(currentPin: string, newPin: string): Promise<{ success: boolean }> {
    try {
      const response = await this.client.put('/identity/Pin/current', {
        currentPin,
        newPin,
      });
      return response.data;
    } catch (error) {
      console.error('Change PIN error:', error);
      throw this.handleError(error);
    }
  }

  // ==================== USER MANAGEMENT (Wallet API v1) ====================

  /**
   * Get current user profile
   */
  async getProfile(): Promise<UnipesaUser> {
    try {
      const response = await this.client.get('/users/Profile', {
        headers: this.getAuthHeaders(),
      });
      return response.data;
    } catch (error) {
      console.error('Get profile error:', error);
      throw this.handleError(error);
    }
  }

  /**
   * Update user's name
   */
  async updateName(firstName: string, lastName: string): Promise<{ success: boolean }> {
    try {
      const response = await this.client.put(
        '/users/Profile/Name',
        { firstName, lastName },
        { headers: this.getAuthHeaders() }
      );
      return response.data;
    } catch (error) {
      console.error('Update name error:', error);
      throw this.handleError(error);
    }
  }

  /**
   * Get user account information
   */
  async getAccountInfo(): Promise<{
    id: string;
    phoneNumber: string;
    email: string;
    status: string;
  }> {
    try {
      const response = await this.client.get('/identity/Account', {
        headers: this.getAuthHeaders(),
      });
      return response.data;
    } catch (error) {
      console.error('Get account info error:', error);
      throw this.handleError(error);
    }
  }

  /**
   * Update phone number
   */
  async updatePhoneNumber(phoneNumber: string): Promise<{ success: boolean }> {
    try {
      const response = await this.client.put(
        '/identity/Account/Phone-Number',
        { phoneNumber },
        { headers: this.getAuthHeaders() }
      );
      return response.data;
    } catch (error) {
      console.error('Update phone error:', error);
      throw this.handleError(error);
    }
  }

  /**
   * Update email
   */
  async updateEmail(email: string): Promise<{ success: boolean }> {
    try {
      const response = await this.client.put(
        '/identity/Account/Email',
        { email },
        { headers: this.getAuthHeaders() }
      );
      return response.data;
    } catch (error) {
      console.error('Update email error:', error);
      throw this.handleError(error);
    }
  }

  /**
   * Register a user and create a wallet (merchant-facing)
   * POST /users
   */
  async registerUser(data: {
    phoneNumber: string;
    firstName: string;
    lastName: string;
    email?: string;
    countryCode?: string;
    externalUserId?: string;
  }): Promise<{
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
  }> {
    try {
      const response = await this.client.post(
        '/users',
        data,
        { headers: this.getAuthHeaders() }
      );
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
  async getUser(userId: string): Promise<{
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
  }> {
    try {
      const response = await this.client.get(
        `/users/${userId}`,
        { headers: this.getAuthHeaders() }
      );
      return response.data;
    } catch (error) {
      console.error('Get user error:', error);
      throw this.handleError(error);
    }
  }

  /**
   * Upload KYC data for a user
   * POST /users/{userId}/kyc
   */
  async uploadKyc(userId: string, kycData: Record<string, any>): Promise<{
    userId: string;
    kycStatus: 'pending' | 'submitted';
  }> {
    try {
      const response = await this.client.post(
        `/users/${userId}/kyc`,
        kycData,
        { headers: this.getAuthHeaders() }
      );
      return response.data;
    } catch (error) {
      console.error('Upload KYC error:', error);
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
      const response = await this.client.get(
        `/users/${userId}/balance`,
        { headers: this.getAuthHeaders() }
      );
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
    items: Array<{
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
    }>;
    total: number;
  }> {
    try {
      const queryParams = new URLSearchParams();
      if (params?.limit) queryParams.append('limit', String(params.limit));
      if (params?.offset) queryParams.append('offset', String(params.offset));

      const response = await this.client.get(
        `/users/${userId}/transactions?${queryParams.toString()}`,
        { headers: this.getAuthHeaders() }
      );
      return response.data;
    } catch (error) {
      console.error('List user transactions error:', error);
      throw this.handleError(error);
    }
  }

  // ==================== PAYMENTS (Wallet API v1) ====================

  /**
   * Create a top-up (merchant-initiated)
   * POST /topups
   */
  async createTopup(data: {
    userId: string;
    amount: string;
    currency: 'KES';
    method: string;
    msisdn?: string;
  }): Promise<any> {
    try {
      const response = await this.client.post(
        '/topups',
        data,
        { headers: this.getAuthHeaders() }
      );
      return response.data;
    } catch (error) {
      console.error('Create topup error:', error);
      throw this.handleError(error);
    }
  }

  /**
   * Create a transfer (wallet-to-wallet or wallet-to-external)
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
  }): Promise<any> {
    try {
      const response = await this.client.post(
        '/transfers',
        data,
        { headers: this.getAuthHeaders() }
      );
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
  async getTransaction(transactionId: string): Promise<any> {
    try {
      const response = await this.client.get(
        `/transactions/${transactionId}`,
        { headers: this.getAuthHeaders() }
      );
      return response.data;
    } catch (error) {
      console.error('Get transaction error:', error);
      throw this.handleError(error);
    }
  }

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
      const response = await this.client.get(
        '/providers',
        { headers: this.getAuthHeaders() }
      );
      return response.data;
    } catch (error) {
      console.error('List providers error:', error);
      throw this.handleError(error);
    }
  }

  // ==================== MERCHANT (Wallet API v1) ====================

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
      const response = await this.client.get(
        '/merchant/account',
        { headers: this.getAuthHeaders() }
      );
      return response.data;
    } catch (error) {
      console.error('Get merchant account error:', error);
      throw this.handleError(error);
    }
  }

  // ==================== SERVICE (Wallet API v1) ====================

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

  // ==================== PAYMENTS (Legacy - keep for compatibility) ====================

  /**
   * Create a new payment transaction (legacy)
   */
  async createPayment(data: {
    amount: number;
    currency: string;
    source: string;
    destination: string;
    description?: string;
    metadata?: Record<string, any>;
  }): Promise<UnipesaTransaction> {
    try {
      const response = await this.client.post(
        '/payments/Payments',
        data,
        { headers: this.getAuthHeaders() }
      );
      return response.data;
    } catch (error) {
      console.error('Create payment error:', error);
      throw this.handleError(error);
    }
  }

  /**
   * Get all available payment providers (legacy)
   */
  async getPaymentProviders(): Promise<{
    [category: string]: Array<{
      id: string;
      name: string;
      type: string;
      supportedCurrencies: string[];
    }>;
  }> {
    try {
      const response = await this.client.get('/payments/Providers', {
        headers: this.getAuthHeaders(),
      });
      return response.data;
    } catch (error) {
      console.error('Get providers error:', error);
      throw this.handleError(error);
    }
  }

  /**
   * Get terminal associated with authenticated agent
   */
  async getTerminal(): Promise<{
    id: string;
    name: string;
    status: string;
    provider: string;
  }> {
    try {
      const response = await this.client.get('/payments/Terminals', {
        headers: this.getAuthHeaders(),
      });
      return response.data;
    } catch (error) {
      console.error('Get terminal error:', error);
      throw this.handleError(error);
    }
  }

  /**
   * Register a new terminal
   */
  async registerTerminal(data: {
    name: string;
    type: string;
    provider: string;
    metadata?: Record<string, any>;
  }): Promise<{ id: string; status: string }> {
    try {
      const response = await this.client.post(
        '/payments/Terminals',
        data,
        { headers: this.getAuthHeaders() }
      );
      return response.data;
    } catch (error) {
      console.error('Register terminal error:', error);
      throw this.handleError(error);
    }
  }

  /**
   * List transactions with filters (legacy)
   */
  async listTransactions(filters?: {
    startDate?: Date;
    endDate?: Date;
    status?: string;
    type?: string;
    limit?: number;
    offset?: number;
  }): Promise<{
    transactions: UnipesaTransaction[];
    total: number;
    limit: number;
    offset: number;
  }> {
    try {
      const params = new URLSearchParams();
      if (filters?.startDate) params.append('startDate', filters.startDate.toISOString());
      if (filters?.endDate) params.append('endDate', filters.endDate.toISOString());
      if (filters?.status) params.append('status', filters.status);
      if (filters?.type) params.append('type', filters.type);
      if (filters?.limit) params.append('limit', String(filters.limit));
      if (filters?.offset) params.append('offset', String(filters.offset));

      const response = await this.client.get(
        `/payments/Transactions?${params.toString()}`,
        { headers: this.getAuthHeaders() }
      );
      return response.data;
    } catch (error) {
      console.error('List transactions error:', error);
      throw this.handleError(error);
    }
  }

  /**
   * Export transaction receipt as PDF
   */
  async exportReceipt(transactionId: string): Promise<Buffer> {
    try {
      const response = await this.client.post(
        `/payments/Transactions/${transactionId}/Export`,
        {},
        {
          headers: {
            ...this.getAuthHeaders(),
            'Accept': 'application/pdf',
          },
          responseType: 'arraybuffer',
        }
      );
      return Buffer.from(response.data);
    } catch (error) {
      console.error('Export receipt error:', error);
      throw this.handleError(error);
    }
  }

  /**
   * Mark a transaction as favourite
   */
  async markAsFavourite(transactionId: string): Promise<{ success: boolean }> {
    try {
      const response = await this.client.post(
        `/payments/Transactions/${transactionId}/Favorite`,
        {},
        { headers: this.getAuthHeaders() }
      );
      return response.data;
    } catch (error) {
      console.error('Mark favourite error:', error);
      throw this.handleError(error);
    }
  }

  /**
   * Remove a transaction from favourites
   */
  async removeFromFavourites(transactionId: string): Promise<{ success: boolean }> {
    try {
      const response = await this.client.delete(
        `/payments/Transactions/${transactionId}/Favorite`,
        { headers: this.getAuthHeaders() }
      );
      return response.data;
    } catch (error) {
      console.error('Remove favourite error:', error);
      throw this.handleError(error);
    }
  }

  // ==================== NOTIFICATIONS ====================

  /**
   * Get paginated notifications
   */
  async getNotifications(params?: {
    page?: number;
    limit?: number;
    read?: boolean;
  }): Promise<{
    notifications: Array<{
      id: string;
      title: string;
      body: string;
      read: boolean;
      createdAt: Date;
      metadata?: Record<string, any>;
    }>;
    total: number;
    page: number;
    limit: number;
  }> {
    try {
      const queryParams = new URLSearchParams();
      if (params?.page) queryParams.append('page', String(params.page));
      if (params?.limit) queryParams.append('limit', String(params.limit));
      if (params?.read !== undefined) queryParams.append('read', String(params.read));

      const response = await this.client.get(
        `/notifications/Notification?${queryParams.toString()}`,
        { headers: this.getAuthHeaders() }
      );
      return response.data;
    } catch (error) {
      console.error('Get notifications error:', error);
      throw this.handleError(error);
    }
  }

  /**
   * Get notification enabled/disabled status
   */
  async getNotificationStatus(): Promise<{ enabled: boolean }> {
    try {
      const response = await this.client.get(
        '/notifications/Notification/status',
        { headers: this.getAuthHeaders() }
      );
      return response.data;
    } catch (error) {
      console.error('Get notification status error:', error);
      throw this.handleError(error);
    }
  }

  /**
   * Enable push notifications
   */
  async enableNotifications(expoPushToken: string): Promise<{ success: boolean }> {
    try {
      const response = await this.client.post(
        '/notifications/Notification/enable',
        { expoPushToken },
        { headers: this.getAuthHeaders() }
      );
      return response.data;
    } catch (error) {
      console.error('Enable notifications error:', error);
      throw this.handleError(error);
    }
  }

  /**
   * Disable push notifications
   */
  async disableNotifications(): Promise<{ success: boolean }> {
    try {
      const response = await this.client.delete(
        '/notifications/Notification/disable',
        { headers: this.getAuthHeaders() }
      );
      return response.data;
    } catch (error) {
      console.error('Disable notifications error:', error);
      throw this.handleError(error);
    }
  }

  // ==================== HELPERS ====================

  /**
   * Get authentication headers for API requests
   */
  private getAuthHeaders(): AxiosRequestHeaders {
    if (!this.accessToken) {
      throw new Error('Not authenticated. Call signInWithPin first.');
    }

    if (this.tokenExpiry && new Date() >= this.tokenExpiry) {
      throw new Error('Token expired. Call refreshAccessToken.');
    }

    return {
      'Authorization': `Bearer ${this.accessToken}`,
    } as AxiosRequestHeaders;
  }

  /**
   * Handle API errors consistently
   */
  private handleError(error: any): Error {
    if (axios.isAxiosError(error)) {
      const message = error.response?.data?.message || error.message;
      const status = error.response?.status;
      return new Error(`Unipesa API Error (${status}): ${message}`);
    }
    return new Error(`Unipesa Error: ${error.message || 'Unknown error'}`);
  }

  /**
   * Get current auth status
   */
  isAuthenticated(): boolean {
    return !!this.accessToken && !!(this.tokenExpiry && new Date() < this.tokenExpiry);
  }

  /**
   * Get current access token
   */
  getAccessToken(): string | null {
    return this.accessToken;
  }

  /**
   * Get current refresh token
   */
  getRefreshToken(): string | null {
    return this.refreshToken;
  }

  /**
   * Clear tokens (logout)
   */
  logout(): void {
    this.accessToken = null;
    this.refreshToken = null;
    this.tokenExpiry = null;
  }
}