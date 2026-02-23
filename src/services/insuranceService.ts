/* eslint-disable require-jsdoc */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable max-len */
// functions/src/services/insuranceService.ts
import {Pool} from "pg";
import {
  InsuranceProvider,
  InsuranceProduct,
  InsuranceApplication,
  InsuranceClaim,
} from "../validation/insuranceSchema";

export class InsuranceService {
  constructor(private pool: Pool) {}

  // ==================== PROVIDERS ====================
  async getProviders(activeOnly = true): Promise<any[]> {
    const query = activeOnly ?
      "SELECT * FROM insurance_providers WHERE status = 'active' ORDER BY name" :
      "SELECT * FROM insurance_providers ORDER BY name";

    const result = await this.pool.query(query);
    return result.rows;
  }

  async createProvider(data: InsuranceProvider): Promise<any> {
    const result = await this.pool.query(
      `INSERT INTO insurance_providers (
        name, logo_url, description, website, contact_phone, contact_email, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [data.name, data.logo_url, data.description, data.website, data.contact_phone, data.contact_email, data.status]
    );
    return result.rows[0];
  }

  // ==================== PRODUCTS ====================
  async getProducts(filters?: {
    type?: string;
    provider_id?: string;
    min_premium?: number;
    max_premium?: number;
    popular_only?: boolean;
  }): Promise<any[]> {
    let query = `
      SELECT 
        p.*,
        pr.name as provider_name,
        pr.logo_url as provider_logo
      FROM insurance_products p
      LEFT JOIN insurance_providers pr ON p.provider_id = pr.id
      WHERE p.status = 'active'
    `;
    const params: any[] = [];
    let paramCount = 0;

    if (filters?.type) {
      paramCount++;
      query += ` AND p.type = $${paramCount}`;
      params.push(filters.type);
    }

    if (filters?.provider_id) {
      paramCount++;
      query += ` AND p.provider_id = $${paramCount}`;
      params.push(filters.provider_id);
    }

    if (filters?.min_premium) {
      paramCount++;
      query += ` AND p.premium_max >= $${paramCount}`;
      params.push(filters.min_premium);
    }

    if (filters?.max_premium) {
      paramCount++;
      query += ` AND p.premium_min <= $${paramCount}`;
      params.push(filters.max_premium);
    }

    if (filters?.popular_only) {
      query += " AND p.popular = true";
    }

    query += " ORDER BY p.popular DESC, p.premium_min ASC";

    const result = await this.pool.query(query, params);
    return result.rows;
  }

  async getProductById(id: string): Promise<any> {
    const result = await this.pool.query(
      `SELECT 
        p.*,
        pr.name as provider_name,
        pr.logo_url as provider_logo,
        pr.contact_phone,
        pr.contact_email
      FROM insurance_products p
      LEFT JOIN insurance_providers pr ON p.provider_id = pr.id
      WHERE p.id = $1`,
      [id]
    );
    return result.rows[0];
  }

  async createProduct(data: InsuranceProduct): Promise<any> {
    const result = await this.pool.query(
      `INSERT INTO insurance_products (
        provider_id, name, type, description, coverage_details,
        premium_min, premium_max, coverage_period, eligibility_requirements,
        features, documents_required, status, popular, external_product_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING *`,
      [
        data.provider_id,
        data.name,
        data.type,
        data.description,
        JSON.stringify(data.coverage_details || {}),
        data.premium_min,
        data.premium_max,
        data.coverage_period,
        JSON.stringify(data.eligibility_requirements || []),
        data.features || [],
        JSON.stringify(data.documents_required || {}),
        data.status,
        data.popular,
        data.external_product_id,
      ]
    );
    return result.rows[0];
  }

  // ==================== APPLICATIONS ====================
  async getFarmerApplications(farmerId: number): Promise<any[]> {
    const result = await this.pool.query(
      `SELECT 
        a.*,
        p.name as product_name,
        p.type as product_type,
        pr.name as provider_name
      FROM insurance_applications a
      LEFT JOIN insurance_products p ON a.product_id = p.id
      LEFT JOIN insurance_providers pr ON p.provider_id = pr.id
      WHERE a.farmer_id = $1
      ORDER BY a.applied_at DESC`,
      [farmerId]
    );
    return result.rows;
  }

  async createApplication(data: InsuranceApplication): Promise<any> {
    // Validate dates
    const startDate = new Date(data.start_date);
    const endDate = new Date(data.end_date);

    if (endDate <= startDate) {
      throw new Error("End date must be after start date");
    }

    const result = await this.pool.query(
      `INSERT INTO insurance_applications (
        farmer_id, product_id, coverage_amount, premium,
        start_date, end_date, status, documents, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [
        data.farmer_id,
        data.product_id,
        data.coverage_amount,
        data.premium,
        data.start_date,
        data.end_date,
        data.status || "submitted",
        JSON.stringify(data.documents || {}),
        data.notes,
      ]
    );
    return result.rows[0];
  }

  async updateApplicationStatus(id: string, status: string, notes?: string): Promise<any> {
    const result = await this.pool.query(
      `UPDATE insurance_applications 
       SET status = $1, notes = COALESCE($2, notes), updated_at = NOW()
       WHERE id = $3 RETURNING *`,
      [status, notes, id]
    );
    return result.rows[0];
  }

  // ==================== CLAIMS ====================
  async getFarmerClaims(farmerId: number): Promise<any[]> {
    const result = await this.pool.query(
      `SELECT 
        c.*,
        a.product_id,
        p.name as product_name
      FROM insurance_claims c
      LEFT JOIN insurance_applications a ON c.application_id = a.id
      LEFT JOIN insurance_products p ON a.product_id = p.id
      WHERE a.farmer_id = $1
      ORDER BY c.filed_at DESC`,
      [farmerId]
    );
    return result.rows;
  }

  async createClaim(data: InsuranceClaim): Promise<any> {
    // Generate claim number
    const claimNumber = `CLM-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;

    const result = await this.pool.query(
      `INSERT INTO insurance_claims (
        application_id, claim_number, incident_date, description,
        amount_claimed, documents, status
      ) VALUES ($1, $2, $3, $4, $5, $6, 'submitted') RETURNING *`,
      [
        data.application_id,
        claimNumber,
        data.incident_date,
        data.description,
        data.amount_claimed,
        JSON.stringify(data.documents || {}),
      ]
    );
    return result.rows[0];
  }
}

