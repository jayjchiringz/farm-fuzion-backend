/* eslint-disable camelcase */
import {initDbPool, DbConfig} from "../utils/db";

export const bootstrapDatabase = async (config: DbConfig, force = false) => {
  const pool = initDbPool(config);

  // Always ensure flags table exists
  await pool.query(`
    CREATE TABLE IF NOT EXISTS __migration_flags (
      id SERIAL PRIMARY KEY,
      tag VARCHAR(100) UNIQUE NOT NULL,
      created_at TIMESTAMP DEFAULT now()
    );
  `);

  const MIGRATION_TAG = "bootstrap-v2"; // can bump this later

  if (!force) {
    const check = await pool.query(
      "SELECT 1 FROM __migration_flags WHERE tag = $1 LIMIT 1",
      [MIGRATION_TAG]
    );
    if ((check.rowCount ?? 0) > 0) {
      console.log(
        "✅ DB already bootstrapped. " +
        "Use FORCE_BOOTSTRAP=true to override."
      );
      return;
    }
  } else {
    console.warn("⚠️ FORCE_BOOTSTRAP=true detected: Running full schema setup");
  }

  console.log("🛠️ Bootstrapping DB schema...");

  // ... ✅ Run table creation scripts
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
      CREATE TABLE IF NOT EXISTS loans (
        id SERIAL PRIMARY KEY,
        farmer_id INTEGER REFERENCES farmers(id),
        amount NUMERIC NOT NULL,
        purpose TEXT,
        -- pending | approved | rejected | repaid
        status VARCHAR(50) DEFAULT 'pending',
        applied_at TIMESTAMP DEFAULT now(),
        approved_at TIMESTAMP,
        repayment_due DATE
      );
    `);

  await pool.query(`    
      CREATE TABLE IF NOT EXISTS loan_repayments (
        id SERIAL PRIMARY KEY,
        loan_id INTEGER REFERENCES loans(id),
        farmer_id INTEGER REFERENCES farmers(id),
        amount NUMERIC NOT NULL,
        payment_date DATE DEFAULT now(),
        method VARCHAR(50),
        reference_no VARCHAR(100)
      );
    `);

  await pool.query(`
      CREATE TABLE IF NOT EXISTS groups (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        type VARCHAR(50), -- SACCO, COOPERATIVE, ASSOCIATION
        location VARCHAR(100),
        created_at TIMESTAMP DEFAULT now()
      );
    `);

  await pool.query(`
      ALTER TABLE groups
        ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending',
        ADD COLUMN IF NOT EXISTS remarks TEXT;
    `);


  await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name='farmers' AND column_name='group_id'
        ) THEN
          ALTER TABLE farmers
          ADD COLUMN group_id UUID REFERENCES groups(id);
        END IF;
      END$$;
    `);


  // ✅ Create Users Table (Central Auth)
  await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('admin', 'sacco', 'farmer')),
        group_id UUID REFERENCES groups(id),
        created_at TIMESTAMP DEFAULT now()
      );
    `);


  await pool.query(`
      INSERT INTO users (email, role)
      VALUES ('abnyabera@gmail.com', 'admin')
      ON CONFLICT (email) DO NOTHING;
    `);

  // Ensure at least one group exists
  const groupCheck = await pool.query("SELECT id FROM groups LIMIT 1");

  let fallbackGroupId: string;

  if ((groupCheck.rowCount ?? 0) > 0) {
    fallbackGroupId = groupCheck.rows[0].id;
  } else {
    const newGroup = await pool.query(`
    INSERT INTO groups (name, type, location)
    VALUES ('Default SACCO', 'SACCO', 'Nairobi')
    RETURNING id;
  `);
    fallbackGroupId = newGroup.rows[0].id;
  }

  await pool.query(`
    INSERT INTO users (email, role, group_id)
    VALUES ('admin@farmfuzion.org', 'sacco', $1)
    ON CONFLICT (email) DO NOTHING;`,
  [fallbackGroupId]
  );

  await pool.query(`
    CREATE TABLE IF NOT EXISTS kyc_documents (
      id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      farmer_id INTEGER REFERENCES farmers(id),
      group_id UUID REFERENCES groups(id),
      doc_type VARCHAR(100),
      doc_url TEXT,
      uploaded_at TIMESTAMP DEFAULT now()
    );
  `);

  // 🩹 Update farmers: add profile picture if not exists
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='farmers' AND column_name='profile_picture'
      ) THEN
        ALTER TABLE farmers ADD COLUMN profile_picture TEXT;
      END IF;
    END$$;
  `);

  // 🩹 Update groups: add description if not exists
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='groups' AND column_name='description'
      ) THEN
        ALTER TABLE groups ADD COLUMN description TEXT;
      END IF;
    END$$;
  `);

  // Safe farmer insert with guaranteed group_id
  await pool.query(`
    INSERT INTO farmers (first_name, middle_name, last_name, email, group_id)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (email) DO NOTHING;`,
  ["Junior", "Omosh", "Omondi", "jromosh@gmail.com", fallbackGroupId]
  );

  // 🧪 Insert the tag only if not forced
  if (!force) {
    await pool.query(
      "INSERT INTO __migration_flags (tag) VALUES ($1)",
      [MIGRATION_TAG]
    );
    console.log("✅ Migration tag recorded.");
  } else {
    console.log("🚨 Skipped tag record due to forced bootstrap.");
  }

  console.log("✅ Bootstrap complete.");
};
