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

  // 🚀 1. Create group_types table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS group_types (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT UNIQUE NOT NULL,
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT now(),
      updated_at TIMESTAMP DEFAULT now()
    );
  `);

  // 🚀 2. Populate with default values
  await pool.query(`
    INSERT INTO group_types (name)
    VALUES 
      ('SACCO'), 
      ('COOPERATIVE'), 
      ('ASSOCIATION'), 
      ('YOUTH GROUP'), 
      ('WOMEN GROUP')
    ON CONFLICT (name) DO NOTHING;
  `);

  // 🚀 3. Add group_type_id reference to groups
  await pool.query(`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='groups' AND column_name='group_type_id'
      ) THEN
        ALTER TABLE groups
        ADD COLUMN group_type_id UUID REFERENCES group_types(id);
      END IF;
    END$$;
  `);

  // ✅ Check if column `type` exists before referencing it
  const checkTypeCol = await pool.query(`
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'groups' AND column_name = 'type'
    LIMIT 1;
  `);

  if ((checkTypeCol.rowCount ?? 0) > 0) {
    console.log("📦 Migrating legacy group.type values...");

    // 🚀 4. Migrate old `type` values into group_types
    await pool.query(`
      INSERT INTO group_types (name)
      SELECT DISTINCT type FROM groups
      WHERE type IS NOT NULL
      ON CONFLICT (name) DO NOTHING;
    `);

    // 🚀 5. Update existing groups with correct group_type_id
    await pool.query(`
      UPDATE groups
      SET group_type_id = gt.id
      FROM group_types gt
      WHERE groups.type = gt.name;
    `);

    // 🚀 6. Drop old column
    await pool.query(`
      ALTER TABLE groups DROP COLUMN IF EXISTS type;
    `);
  } else {
    console.log("✅ No legacy `type` column found. Skipping migration.");
  }

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
      VALUES ('kinyuaomosh3192@gmail.com', 'admin')
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

  await pool.query(` 
    CREATE TABLE IF NOT EXISTS group_document_requirements (
      id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      group_id UUID REFERENCES groups(id) ON DELETE CASCADE,
      doc_type VARCHAR(100) NOT NULL,
      is_required BOOLEAN DEFAULT TRUE,
      UNIQUE(group_id, doc_type)
    );
  `);

  await pool.query(` 
    CREATE TABLE IF NOT EXISTS group_document_types (
      id SERIAL PRIMARY KEY,
      doc_type TEXT NOT NULL UNIQUE,
      is_active BOOLEAN DEFAULT TRUE
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS group_documents (
      id SERIAL PRIMARY KEY,
      group_id UUID REFERENCES groups(id) ON DELETE CASCADE,
      doc_type TEXT NOT NULL,
      file_path TEXT NOT NULL,
      uploaded_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await pool.query(` 
    CREATE TABLE IF NOT EXISTS user_roles (
      id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      created_at TIMESTAMP DEFAULT now()
    );
  `);

  await pool.query(` 
    CREATE TABLE IF NOT EXISTS wallet (
      id UUID PRIMARY KEY,
      owner_id UUID NOT NULL,
      balance NUMERIC(12, 2) DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS wallet_transaction (
      id UUID PRIMARY KEY,
      wallet_id UUID NOT NULL REFERENCES wallet(id) ON DELETE CASCADE,
      type VARCHAR(10) CHECK (type IN ('credit', 'debit')),
      amount NUMERIC(12, 2) NOT NULL,
      metadata JSONB,
      timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS otp_codes (
      id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      code VARCHAR(6) NOT NULL,
      expires_at TIMESTAMP NOT NULL,
      used BOOLEAN DEFAULT FALSE
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS mpesa_transactions (
      id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      transaction_id VARCHAR(100) NOT NULL UNIQUE,
      amount NUMERIC(12, 2) NOT NULL,
      phone_number VARCHAR(20) NOT NULL,
      status VARCHAR(20) NOT NULL CHECK (
        status IN ('pending', 'completed', 'failed')
      ),
      created_at TIMESTAMP DEFAULT now(),
      updated_at TIMESTAMP DEFAULT now()
    );
  `);

  await pool.query(`
    INSERT INTO group_document_types (doc_type)
    VALUES 
      ('Business Registration Certificate'),
      ('KRA PIN'),
      ('Bank Statement'),
      ('ID/Passport of Chairperson'),
      ('Constitution/Bylaws')
    ON CONFLICT (doc_type) DO NOTHING
  `);

  await pool.query(`
    DO $$ BEGIN
      IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name='farmers' AND column_name='county') THEN
        ALTER TABLE farmers
          ADD COLUMN county TEXT,
          ADD COLUMN sub_county TEXT,
          ADD COLUMN constituency TEXT,
          ADD COLUMN ward TEXT,
          ADD COLUMN sub_location TEXT,
          ADD COLUMN village TEXT,
          ADD COLUMN landmark TEXT;
      END IF;
    END$$;
  `);

  await pool.query(`
    DO $$ BEGIN
      IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name='groups' AND column_name='county') THEN  
      ALTER TABLE groups
        ADD COLUMN county VARCHAR,
        ADD COLUMN constituency VARCHAR,
        ADD COLUMN ward VARCHAR;
      END IF;
    END$$;
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='farmers' AND column_name='user_id'
      ) THEN
        ALTER TABLE farmers ADD COLUMN user_id UUID REFERENCES users(id);
      END IF;
    END$$;
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

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='groups' AND column_name='registration_number'
      ) THEN
        ALTER TABLE groups
          ADD COLUMN registration_number TEXT UNIQUE NOT NULL DEFAULT '';
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
