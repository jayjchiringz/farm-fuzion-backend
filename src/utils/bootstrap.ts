import {initDbPool, DbConfig} from "../utils/db";

let isBootstrapped = false;

export const bootstrapDatabase = async (config: DbConfig) => {
  if (isBootstrapped) {
    console.log("⚡ Skipping DB bootstrap (already bootstrapped)");
    return;
  }

  const pool = initDbPool(config);

  try {
    // Ensure flags table exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS __migration_flags (
        id SERIAL PRIMARY KEY,
        tag VARCHAR(100) UNIQUE NOT NULL,
        created_at TIMESTAMP DEFAULT now()
      );
    `);

    const check = await pool.query(
      "SELECT 1 FROM __migration_flags WHERE tag = 'bootstrap-v1' LIMIT 1"
    );

    if ((check.rowCount ?? 0) > 0) {
      console.log("✅ DB already bootstrapped.");
      isBootstrapped = true;
      return;
    }

    console.log("🛠️ Bootstrapping DB tables...");

    await pool.query(`
      CREATE TABLE IF NOT EXISTS farmers (
        id SERIAL PRIMARY KEY,
        first_name VARCHAR(100) NOT NULL,
        middle_name VARCHAR(100),
        last_name VARCHAR(100) NOT NULL,
        dob DATE,
        id_passport_no VARCHAR(20),
        location VARCHAR(100),
        address VARCHAR(100),
        mobile VARCHAR(20),
        email VARCHAR(255) UNIQUE NOT NULL
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS directors (
        id SERIAL PRIMARY KEY,
        first_name VARCHAR(100),
        middle_name VARCHAR(100),
        last_name VARCHAR(100),
        dob DATE,
        id_passport_no VARCHAR(50),
        location VARCHAR(100),
        address VARCHAR(100),
        mobile_no VARCHAR(20),
        email VARCHAR(255)
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS businesses (
        id SERIAL PRIMARY KEY,
        farmer_id INTEGER REFERENCES farmers(id),
        director_id INTEGER REFERENCES directors(id),
        business_reg_no VARCHAR(100),
        business_address VARCHAR(255),
        mobile_no_1 VARCHAR(20),
        mobile_no_2 VARCHAR(20),
        mobile_no_3 VARCHAR(20),
        email VARCHAR(255)
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS declarations (
        id SERIAL PRIMARY KEY,
        farmer_id INTEGER REFERENCES farmers(id),
        business_id INTEGER REFERENCES businesses(id),
        tax_id VARCHAR(50),
        tax_obligation VARCHAR(100),
        declaration_date DATE,
        account_balance NUMERIC,
        tax_amount NUMERIC
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS taxes (
        id SERIAL PRIMARY KEY,
        farmer_id INTEGER REFERENCES farmers(id),
        business_id INTEGER REFERENCES businesses(id),
        tax_id VARCHAR(50),
        tax_obligation VARCHAR(100)
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS payments (
        id SERIAL PRIMARY KEY,
        declaration_id INTEGER,
        farmer_id INTEGER REFERENCES farmers(id),
        business_id INTEGER REFERENCES businesses(id),
        tax_id VARCHAR(100),
        tax_obligation VARCHAR(100),
        payment_date DATE,
        reference_no VARCHAR(100),
        payment_type VARCHAR(100),
        paid_amount NUMERIC,
        paid BOOLEAN
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS risks (
        id SERIAL PRIMARY KEY,
        farmer_id INTEGER REFERENCES farmers(id),
        credit_check TEXT,
        fraud_screen TEXT,
        assessment_date DATE
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS financials (
        id SERIAL PRIMARY KEY,
        farmer_id INTEGER REFERENCES farmers(id),
        wallet_account_number VARCHAR(50),
        bank_branch VARCHAR(100),
        bank_code VARCHAR(50),
        account_name VARCHAR(100),
        account_number VARCHAR(50)
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS farm_products (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        farmer_id UUID,
        product_name VARCHAR(100),
        quantity NUMERIC,
        unit VARCHAR(50),
        harvest_date DATE,
        storage_location VARCHAR(255)
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS logistics (
        id SERIAL PRIMARY KEY,
        farmer_id UUID,
        business_id UUID,
        vehicle_id VARCHAR(50),
        driver_name VARCHAR(100),
        origin VARCHAR(100),
        destination VARCHAR(100),
        delivery_date DATE,
        status VARCHAR(50)
      );
    `);

    await pool.query(`
      INSERT INTO farmers (first_name, middle_name, last_name, email)
      VALUES ('Junior', 'Omosh', 'Omondi', 'jromosh@gmail.com')
      ON CONFLICT (email) DO NOTHING;
    `);

    // ✅ Flag successful bootstrap
    await pool.query(
      "INSERT INTO __migration_flags (tag) VALUES ('bootstrap-v1')"
    );

    isBootstrapped = true;
    console.log("✅ DB bootstrap complete.");
  } catch (err) {
    console.error("❌ DB Bootstrap Failed:", err);
    throw err;
  }
};
