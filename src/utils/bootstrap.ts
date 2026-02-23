/* eslint-disable max-len */
/* eslint-disable camelcase */
import {initDbPool, DbConfig} from "../utils/db";

export const bootstrapDatabase = async (config: DbConfig, force = false) => {
  const pool = initDbPool(config);

  await pool.query(`
    CREATE EXTENSION IF NOT EXISTS pgcrypto;
  `);

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

  // Enable pgvector extension for embeddings
  await pool.query(`
    CREATE EXTENSION IF NOT EXISTS vector;
  `);

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
    DO $$
    BEGIN
      -- Add category if missing
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='farm_products' AND column_name='category'
      ) THEN
        ALTER TABLE farm_products ADD COLUMN category VARCHAR(50);
      END IF;

      -- Add price if missing
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='farm_products' AND column_name='price'
      ) THEN
        ALTER TABLE farm_products ADD COLUMN price NUMERIC(12,2) DEFAULT 0;
      END IF;

      -- Add status if missing
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='farm_products' AND column_name='status'
      ) THEN
        ALTER TABLE farm_products ADD COLUMN status VARCHAR(20) DEFAULT 'available';
      END IF;

      -- Add created_at / updated_at timestamps if missing
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='farm_products' AND column_name='created_at'
      ) THEN
        ALTER TABLE farm_products ADD COLUMN created_at TIMESTAMPTZ DEFAULT NOW();
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='farm_products' AND column_name='updated_at'
      ) THEN
        ALTER TABLE farm_products ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='farm_products' AND column_name='spoilage_reason'
      ) THEN
        ALTER TABLE farm_products ADD COLUMN spoilage_reason VARCHAR(255) DEFAULT 'Pests/Disease';
      END IF;

    END $$;
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

    await pool.query(`
      UPDATE farmers SET auth_id = gen_random_uuid() WHERE auth_id IS NULL;
    `);

    // 🚀 6. Drop old column
    await pool.query(`
      ALTER TABLE groups DROP COLUMN IF EXISTS type;
    `);
  } else {
    console.log("✅ No legacy `type` column found. Skipping migration.");
  }

  // Create market_prices if doesnt exist
  await pool.query(`
    CREATE TABLE IF NOT EXISTS market_prices (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      product_name TEXT NOT NULL,
      category TEXT NOT NULL,
      unit TEXT NOT NULL,
      wholesale_price NUMERIC,
      retail_price NUMERIC,
      broker_price NUMERIC,
      farmgate_price NUMERIC,
      region TEXT,
      source TEXT, -- e.g. "KNBS", "KEBS", "FAO", "Open Market API"
      collected_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await pool.query(`
      DO $$ 
      BEGIN
        -- ✅ Add benchmark if missing
        IF NOT EXISTS (
          SELECT 1 
          FROM information_schema.columns
          WHERE table_name='market_prices' 
          AND column_name='benchmark'
        ) THEN
          ALTER TABLE market_prices
          ADD COLUMN benchmark BOOLEAN DEFAULT false;
        END IF;
      END$$;
    `);

  await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS market_prices_unique_idx
      ON market_prices(product_name, region, source);
    `);

  await pool.query(`
      ALTER TABLE market_prices
      ADD COLUMN IF NOT EXISTS last_synced TIMESTAMP DEFAULT NOW();
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

  await pool.query(`
      ALTER TABLE farmers
        ADD COLUMN IF NOT EXISTS auth_id UUID UNIQUE;
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

  // Ensure default admin user exists
  await pool.query(`
      INSERT INTO users (email, role)
      VALUES ('stephendichu1@gmail.com', 'admin')
      ON CONFLICT (email) DO NOTHING;
    `);

  await pool.query(`
      UPDATE farmers SET auth_id = gen_random_uuid() WHERE auth_id IS NULL;
    `);

  await pool.query(`
      UPDATE farmers f
      SET user_id = u.id
      FROM users u
      WHERE f.email = u.email
      AND f.user_id IS NULL;
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
    CREATE TABLE IF NOT EXISTS wallets (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      farmer_id TEXT UNIQUE NOT NULL,
      balance NUMERIC(12,2) NOT NULL DEFAULT 0,
      updated_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS wallet_transactions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      farmer_id TEXT NOT NULL,
      type VARCHAR(20) NOT NULL CHECK (type IN ('topup', 'deduction')),
      amount NUMERIC(12,2) NOT NULL,
      source TEXT,
      timestamp TIMESTAMP DEFAULT NOW()
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

  // 🧠 Patch: Add missing columns to `wallets` and `wallet_transactions`
  await pool.query(`
    DO $$ BEGIN
      -- Patch WALLET_TRANSACTIONS table
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='wallet_transactions' AND column_name='destination'
      ) THEN
        ALTER TABLE wallet_transactions
          ADD COLUMN destination TEXT,
          ADD COLUMN direction VARCHAR(10) DEFAULT 'in',
          ADD COLUMN method VARCHAR(30),
          ADD COLUMN status VARCHAR(20) DEFAULT 'pending',
          ADD COLUMN meta JSONB;
      END IF;

      -- Patch WALLETS table (in case new structure evolves)
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='wallets' AND column_name='currency'
      ) THEN
        ALTER TABLE wallets
          ADD COLUMN currency VARCHAR(10) DEFAULT 'KES';
      END IF;
    END $$;
  `);

  await pool.query(`
    DO $$ 
    BEGIN
      -- Check if the old constraint exists
      IF EXISTS (
        SELECT 1 
        FROM pg_constraint 
        WHERE conname = 'wallet_transactions_type_check'
      ) THEN
        ALTER TABLE wallet_transactions
          DROP CONSTRAINT wallet_transactions_type_check;
      END IF;

      -- Recreate the correct constraint (only if missing)
      IF NOT EXISTS (
        SELECT 1 
        FROM pg_constraint 
        WHERE conname = 'wallet_transactions_type_check'
      ) THEN
        ALTER TABLE wallet_transactions
          ADD CONSTRAINT wallet_transactions_type_check
          CHECK (type IN (
          'topup', 'withdraw', 'transfer', 'paybill', 'deduction'
          ));
      END IF;
    END $$;
  `);

  // 🧩 Extra Wallet Migrations
  await pool.query(`
    DO $$ BEGIN
      -- Ensure reference_no exists
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='wallet_transactions' AND column_name='reference_no'
      ) THEN
        ALTER TABLE wallet_transactions ADD COLUMN reference_no TEXT;
      END IF;

      -- Ensure fee exists
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='wallet_transactions' AND column_name='fee'
      ) THEN
        ALTER TABLE wallet_transactions ADD COLUMN fee NUMERIC(12,2) DEFAULT 0;
      END IF;
    END $$;
  `);

  // ⚡ Indexes for performance
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_wallets_farmer_id ON wallets(farmer_id);
    CREATE INDEX IF NOT EXISTS idx_wallet_tx_farmer_id ON wallet_transactions(farmer_id);
    CREATE INDEX IF NOT EXISTS idx_wallet_tx_timestamp ON wallet_transactions(timestamp DESC);
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
  /*
  await pool.query(`
    INSERT INTO farmers (first_name, middle_name, last_name, email, group_id)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (email) DO NOTHING;`,
  ["SERVICE", "UPRISING", "AGENCY", "service@uprising.agency", fallbackGroupId]
  );
  */
  /*
  await pool.query(`
    DELETE FROM farmers
    WHERE email = $1;
  `, ["service@uprising.agency"]);
  */

  // 🌍 World Bank Prices Table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS worldbank_prices (
      id SERIAL PRIMARY KEY,
      date DATE NOT NULL,
      commodity TEXT NOT NULL,
      unit TEXT NOT NULL,
      price NUMERIC,
      created_at TIMESTAMP DEFAULT now(),
      UNIQUE (date, commodity, unit)
    );
  `);

  // Market Intelligence Tables
  await pool.query(`
    CREATE TABLE IF NOT EXISTS market_intelligence (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        product_name VARCHAR(100) NOT NULL,
        region VARCHAR(100),
        intelligence_type VARCHAR(50), -- 'prediction', 'recommendation', 'insight'
        data JSONB NOT NULL,
        confidence_score DECIMAL(3,2),
        valid_from TIMESTAMP DEFAULT NOW(),
        valid_to TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE if not exists farmer_profiles (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id),
        location VARCHAR(255),
        farm_size_hectares DECIMAL(10,2),
        soil_type VARCHAR(50),
        irrigation_type VARCHAR(50),
        capital_available DECIMAL(15,2),
        storage_capacity_days INTEGER,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE if not exists farming_recommendations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        farmer_id UUID REFERENCES farmer_profiles(id),
        product_name VARCHAR(100),
        recommendation_type VARCHAR(50), -- 'planting', 'harvesting', 'selling'
        action VARCHAR(20), -- 'BUY', 'SELL', 'HOLD', 'STORE'
        reason TEXT,
        confidence_score DECIMAL(3,2),
        expected_benefit DECIMAL(15,2),
        risk_level VARCHAR(20),
        implementation_date DATE,
        created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE if not exists price_predictions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        product_name VARCHAR(100),
        region VARCHAR(100),
        prediction_date DATE,
        predicted_price DECIMAL(15,2),
        lower_bound DECIMAL(15,2),
        upper_bound DECIMAL(15,2),
        model_version VARCHAR(50),
        accuracy_score DECIMAL(3,2),
        created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await pool.query(`
    DROP MATERIALIZED VIEW IF EXISTS market_prices_mv CASCADE;

    CREATE MATERIALIZED VIEW market_prices_mv AS
    SELECT 
      commodity AS product_name,
      'worldbank' AS category,
      unit,
      price AS wholesale_price,
      price AS retail_price,
      price AS broker_price,
      price AS farmgate_price,
      'global' AS region,
      'world_bank' AS source,
      (date::date)::timestamp AS collected_at, -- ✅ always timestamp (midnight)
      true AS benchmark,
      now() AS last_synced
    FROM worldbank_prices;

    -- Unique index for upserts
    CREATE UNIQUE INDEX IF NOT EXISTS market_prices_mv_unique_idx
      ON market_prices_mv (product_name, region, source, collected_at);
    `);

  await pool.query(`
    -- 1. MARKETPLACE PRODUCTS (Denormalized view of farm_products for performance)
    CREATE TABLE IF NOT EXISTS marketplace_products (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      farm_product_id UUID REFERENCES farm_products(id) ON DELETE CASCADE,
      farmer_id TEXT NOT NULL,
      product_name TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      unit TEXT NOT NULL,
      price NUMERIC(12,2) NOT NULL,
      category TEXT,
      status VARCHAR(20) DEFAULT 'available' CHECK (status IN ('available', 'sold', 'reserved', 'hidden')),
      location TEXT,
      rating DECIMAL(3,2) DEFAULT 0,
      total_sales INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      -- For search optimization
      search_vector TSVECTOR
    );
  `);

  await pool.query(`
    -- 2. SHOPPING CARTS
    CREATE TABLE IF NOT EXISTS shopping_carts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      buyer_id TEXT NOT NULL,
      seller_id TEXT NOT NULL,
      status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'pending', 'completed', 'abandoned')),
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await pool.query(`
    -- Partial unique index for one active cart per buyer-seller pair
    CREATE UNIQUE INDEX IF NOT EXISTS idx_shopping_carts_active_unique 
    ON shopping_carts(buyer_id, seller_id) 
    WHERE status = 'active';
  `);

  await pool.query(`
    -- 3. CART ITEMS
    CREATE TABLE IF NOT EXISTS cart_items (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      cart_id UUID REFERENCES shopping_carts(id) ON DELETE CASCADE,
      marketplace_product_id UUID REFERENCES marketplace_products(id),
      quantity INTEGER NOT NULL CHECK (quantity > 0),
      unit_price NUMERIC(12,2) NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await pool.query(`
    -- 4. ORDERS
    CREATE TABLE IF NOT EXISTS marketplace_orders (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      order_number TEXT UNIQUE NOT NULL,
      buyer_id TEXT NOT NULL,
      seller_id TEXT NOT NULL,
      status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'shipping', 'delivered', 'cancelled', 'refunded')),
      total_amount NUMERIC(12,2) NOT NULL,
      shipping_address TEXT,
      payment_method VARCHAR(50),
      payment_status VARCHAR(20) DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'failed', 'refunded')),
      notes TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await pool.query(`
    -- 5. ORDER ITEMS
    CREATE TABLE IF NOT EXISTS order_items (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      order_id UUID REFERENCES marketplace_orders(id) ON DELETE CASCADE,
      marketplace_product_id UUID REFERENCES marketplace_products(id),
      product_name TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      unit_price NUMERIC(12,2) NOT NULL,
      total_price NUMERIC(12,2) NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);


  /* -- ============================================*/
  /* FARM ACTIVITY PLANNING TABLES*/
  /* -- ============================================*/
  await pool.query(`
    -- 1. FARM_CROPS: Master catalog of crops with planting guidelines
    CREATE TABLE IF NOT EXISTS farm_crops (
        id SERIAL PRIMARY KEY,
        crop_name VARCHAR(100) NOT NULL UNIQUE,
        scientific_name VARCHAR(100),
        category VARCHAR(50) NOT NULL, -- 'cereal', 'legume', 'vegetable', 'fruit', 'tuber'
        growth_days INTEGER NOT NULL, -- Average days to maturity
        optimal_temp_min DECIMAL(5,2), -- Celsius
        optimal_temp_max DECIMAL(5,2), -- Celsius
        rainfall_min INTEGER, -- mm per season
        rainfall_max INTEGER, -- mm per season
        soil_ph_min DECIMAL(3,1),
        soil_ph_max DECIMAL(3,1),
        spacing_row_cm INTEGER, -- Row spacing in cm
        spacing_plant_cm INTEGER, -- Plant spacing in cm
        description TEXT,
        region_suitability JSONB, -- JSON array of suitable regions
        created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await pool.query(`
    -- 2. FARM_SEASONS: Master table for planting seasons
    CREATE TABLE IF NOT EXISTS farm_seasons (
        id SERIAL PRIMARY KEY,
        farmer_id INTEGER REFERENCES farmers(id) ON DELETE CASCADE,
        season_name VARCHAR(100) NOT NULL,
        season_type VARCHAR(50) NOT NULL, -- 'long_rains', 'short_rains', 'dry_season', 'irrigated'
        target_crop VARCHAR(100) NOT NULL,
        location VARCHAR(255) NOT NULL,
        county VARCHAR(100),
        sub_county VARCHAR(100),
        acreage DECIMAL(10,2) NOT NULL,
        start_date DATE NOT NULL,
        expected_end_date DATE NOT NULL,
        status VARCHAR(20) DEFAULT 'planned' CHECK (status IN ('planned', 'active', 'completed', 'cancelled')),
        notes TEXT,
        weather_zone VARCHAR(100),
        soil_type VARCHAR(50),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await pool.query(`
    -- 3. SEASON_ACTIVITIES: Detailed activity plan for each season
    CREATE TABLE IF NOT EXISTS season_activities (
        id SERIAL PRIMARY KEY,
        season_id INTEGER REFERENCES farm_seasons(id) ON DELETE CASCADE,
        activity_type VARCHAR(50) NOT NULL CHECK (activity_type IN (
            'land_preparation', 'planting', 'fertilizer_application', 'pest_control',
            'weeding', 'irrigation', 'harvesting', 'post_harvest', 'monitoring'
        )),
        activity_name VARCHAR(200) NOT NULL,
        description TEXT,
        planned_date DATE NOT NULL,
        actual_date DATE,
        deadline_date DATE,
        status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'delayed', 'cancelled')),
        priority VARCHAR(10) CHECK (priority IN ('low', 'medium', 'high', 'critical')),
        assigned_to VARCHAR(100),
        notes TEXT,
        cost_estimate DECIMAL(12,2),
        actual_cost DECIMAL(12,2),
        weather_notes TEXT,
        completion_percentage INTEGER DEFAULT 0 CHECK (completion_percentage BETWEEN 0 AND 100),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await pool.query(`
    -- 4. FARM_DIARY_ENTRIES: Daily farm observations and notes
    CREATE TABLE IF NOT EXISTS farm_diary_entries (
        id SERIAL PRIMARY KEY,
        farmer_id INTEGER REFERENCES farmers(id) ON DELETE CASCADE,
        season_id INTEGER REFERENCES farm_seasons(id) ON DELETE SET NULL,
        entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
        title VARCHAR(200),
        entry_type VARCHAR(50) NOT NULL CHECK (entry_type IN (
            'observation', 'issue', 'milestone', 'weather', 'expense', 'harvest', 'learning'
        )),
        content TEXT NOT NULL,
        weather_condition VARCHAR(50),
        temperature DECIMAL(5,2),
        rainfall_mm DECIMAL(5,2),
        related_activity_id INTEGER REFERENCES season_activities(id) ON DELETE SET NULL,
        tags TEXT[], -- Array of tags for filtering
        images_urls TEXT[], -- Array of image URLs
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='farm_diary_entries' AND column_name='metadata'
      ) THEN
        ALTER TABLE farm_diary_entries
          ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
      END IF;
    END$$;
  `);

  await pool.query(`
    -- 5. FARM_ALERTS_REMINDERS: System and user-generated alerts
    CREATE TABLE IF NOT EXISTS farm_alerts_reminders (
        id SERIAL PRIMARY KEY,
        farmer_id INTEGER REFERENCES farmers(id) ON DELETE CASCADE,
        season_id INTEGER REFERENCES farm_seasons(id) ON DELETE CASCADE,
        activity_id INTEGER REFERENCES season_activities(id) ON DELETE CASCADE,
        alert_type VARCHAR(50) NOT NULL CHECK (alert_type IN ('reminder', 'warning', 'system', 'weather', 'market')),
        title VARCHAR(200) NOT NULL,
        message TEXT NOT NULL,
        alert_date DATE NOT NULL,
        alert_time TIME,
        status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'read', 'dismissed')),
        priority VARCHAR(10) CHECK (priority IN ('low', 'medium', 'high', 'critical')),
        repeat_pattern VARCHAR(50), -- 'daily', 'weekly', 'monthly', 'yearly'
        repeat_until DATE,
        action_url VARCHAR(500), -- Deep link to related page
        metadata JSONB,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await pool.query(`
    -- 6. FARM_REGION_DATA: Crop suitability by region
    CREATE TABLE IF NOT EXISTS farm_region_data (
        id SERIAL PRIMARY KEY,
        county VARCHAR(100) NOT NULL,
        sub_county VARCHAR(100),
        agro_ecological_zone VARCHAR(100),
        avg_annual_rainfall_mm INTEGER,
        avg_temperature_c DECIMAL(5,2),
        main_soil_type VARCHAR(50),
        suitable_crops JSONB, -- Array of crop IDs with planting windows
        planting_calendar JSONB, -- Monthly planting guide
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(county, sub_county)
    );
  `);

  /*
  await pool.query(`
    -- 7. FARM_WEATHER_DATA: Historical and forecast weather
    CREATE TABLE IF NOT EXISTS farm_weather_data (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        farmer_id UUID REFERENCES farmers(id) ON DELETE CASCADE,
        location VARCHAR(255) NOT NULL,
        weather_date DATE NOT NULL,
        temperature_max DECIMAL(5,2),
        temperature_min DECIMAL(5,2),
        rainfall_mm DECIMAL(5,2),
        humidity_percent INTEGER,
        wind_speed_kmh DECIMAL(5,2),
        weather_condition VARCHAR(50),
        sunrise TIME,
        sunset TIME,
        source VARCHAR(50) DEFAULT 'api', -- 'api', 'manual', 'farmer_input'
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(farmer_id, location, weather_date)
    );
  `);
  */

  await pool.query(`
    CREATE TABLE IF NOT EXISTS farm_weather_data (
      id SERIAL PRIMARY KEY,                    -- Changed from UUID to SERIAL
      farmer_id INTEGER REFERENCES farmers(id) ON DELETE CASCADE,  -- Changed from UUID to INTEGER
      location VARCHAR(255) NOT NULL,
      weather_date DATE NOT NULL,
      temperature_max DECIMAL(5,2),
      temperature_min DECIMAL(5,2),
      rainfall_mm DECIMAL(5,2),
      humidity_percent INTEGER,
      wind_speed_kmh DECIMAL(5,2),
      weather_condition VARCHAR(50),
      sunrise TIME,
      sunset TIME,
      source VARCHAR(50) DEFAULT 'api',
      notes TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(farmer_id, location, weather_date)
    );
  `);

  await pool.query(`
    -- 8. FARM_REGION_DATA: Crop suitability by region
    CREATE TABLE IF NOT EXISTS farm_region_data (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        county VARCHAR(100) NOT NULL,
        sub_county VARCHAR(100),
        agro_ecological_zone VARCHAR(100),
        avg_annual_rainfall_mm INTEGER,
        avg_temperature_c DECIMAL(5,2),
        main_soil_type VARCHAR(50),
        suitable_crops JSONB, -- Array of crop IDs with planting windows
        planting_calendar JSONB, -- Monthly planting guide
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(county, sub_county)
    );  
  `);

  /*
  await pool.query(`
    -- Insert common crops for Kenya
    INSERT INTO farm_crops (crop_name, scientific_name, category, growth_days, optimal_temp_min, optimal_temp_max, rainfall_min, rainfall_max, spacing_row_cm, spacing_plant_cm, description) VALUES
    ('Maize', 'Zea mays', 'cereal', 120, 18, 30, 500, 1200, 75, 25, 'Main staple food crop in Kenya'),
    ('Beans', 'Phaseolus vulgaris', 'legume', 90, 18, 27, 350, 650, 50, 15, 'Common legumes grown with maize'),
    ('Rice', 'Oryza sativa', 'cereal', 150, 20, 35, 1000, 2000, 20, 20, 'Paddy rice for irrigation'),
    ('Tomatoes', 'Solanum lycopersicum', 'vegetable', 90, 21, 29, 600, 900, 100, 50, 'High value vegetable crop'),
    ('Kale (Sukuma Wiki)', 'Brassica oleracea', 'vegetable', 70, 15, 25, 350, 600, 60, 30, 'Popular leafy vegetable'),
    ('Potatoes', 'Solanum tuberosum', 'tuber', 120, 15, 20, 500, 700, 75, 30, 'Important tuber crop'),
    ('Coffee', 'Coffea arabica', 'fruit', 270, 18, 24, 1500, 2500, 200, 200, 'Major cash crop'),
    ('Tea', 'Camellia sinensis', 'fruit', 365, 15, 25, 1200, 3000, 120, 75, 'Important export crop'),
    ('Bananas', 'Musa spp.', 'fruit', 365, 20, 30, 1000, 2500, 300, 300, 'Perennial fruit crop'),
    ('Avocado', 'Persea americana', 'fruit', 730, 20, 30, 1000, 1500, 600, 600, 'Export fruit crop');
  `);
  */

  await pool.query(`
    -- 6. INDEXES FOR PERFORMANCE
    CREATE INDEX IF NOT EXISTS idx_marketplace_products_farmer ON marketplace_products(farmer_id);
    CREATE INDEX IF NOT EXISTS idx_marketplace_products_status ON marketplace_products(status);
    CREATE INDEX IF NOT EXISTS idx_marketplace_products_category ON marketplace_products(category);
    CREATE INDEX IF NOT EXISTS idx_marketplace_products_search ON marketplace_products USING GIN(search_vector);
    CREATE INDEX IF NOT EXISTS idx_carts_buyer ON shopping_carts(buyer_id);
    CREATE INDEX IF NOT EXISTS idx_orders_buyer ON marketplace_orders(buyer_id);
    CREATE INDEX IF NOT EXISTS idx_orders_seller ON marketplace_orders(seller_id);
    CREATE INDEX IF NOT EXISTS idx_orders_status ON marketplace_orders(status);

    CREATE INDEX IF NOT EXISTS idx_seasons_farmer_id ON farm_seasons(farmer_id);
    CREATE INDEX IF NOT EXISTS idx_seasons_status ON farm_seasons(status);
    CREATE INDEX IF NOT EXISTS idx_seasons_start_date ON farm_seasons(start_date);

    CREATE INDEX IF NOT EXISTS idx_activities_season_id ON season_activities(season_id);
    CREATE INDEX IF NOT EXISTS idx_activities_status ON season_activities(status);
    CREATE INDEX IF NOT EXISTS idx_activities_planned_date ON season_activities(planned_date);
    CREATE INDEX IF NOT EXISTS idx_activities_deadline_date ON season_activities(deadline_date);

    CREATE INDEX IF NOT EXISTS idx_diary_farmer_date ON farm_diary_entries(farmer_id, entry_date);
    CREATE INDEX IF NOT EXISTS idx_diary_season_id ON farm_diary_entries(season_id);
    CREATE INDEX IF NOT EXISTS idx_diary_entry_type ON farm_diary_entries(entry_type);

    CREATE INDEX IF NOT EXISTS idx_alerts_farmer_status ON farm_alerts_reminders(farmer_id, status);
    CREATE INDEX IF NOT EXISTS idx_alerts_date ON farm_alerts_reminders(alert_date);
    CREATE INDEX IF NOT EXISTS idx_alerts_priority ON farm_alerts_reminders(priority);  
  `);

  await pool.query(`
    CREATE OR REPLACE FUNCTION update_marketplace_search_vector()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.search_vector = to_tsvector('english',
        COALESCE(NEW.product_name, '') || ' ' ||
        COALESCE(NEW.category, '') || ' ' ||
        COALESCE(NEW.location, '')
      );
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  await pool.query(`
    DROP TRIGGER IF EXISTS trg_marketplace_search_vector ON marketplace_products;
    CREATE TRIGGER trg_marketplace_search_vector
    BEFORE INSERT OR UPDATE ON marketplace_products
    FOR EACH ROW EXECUTE FUNCTION update_marketplace_search_vector();
  `);

  await pool.query(`
    -- Create indexes for performance
    CREATE INDEX if not exists idx_market_intelligence_product ON market_intelligence(product_name);
    CREATE INDEX if not exists idx_market_intelligence_region ON market_intelligence(region);
    CREATE INDEX if not exists idx_price_predictions_product_date ON price_predictions(product_name, prediction_date);
    CREATE INDEX if not exists idx_farming_recommendations_farmer ON farming_recommendations(farmer_id, implementation_date);
  `);

  await pool.query(`
    -- Create materialized view for quick intelligence queries
    CREATE MATERIALIZED VIEW if not exists market_intelligence_mv AS
    SELECT 
        mp.product_name,
        mp.region,
        AVG(mp.wholesale_price) as current_price,
        STDDEV(mp.wholesale_price) as price_volatility,
        COUNT(*) as data_points,
        MIN(mp.collected_at) as earliest_date,
        MAX(mp.collected_at) as latest_date,
        -- Calculate trend
        CORR(EXTRACT(EPOCH FROM mp.collected_at), mp.wholesale_price) as price_trend,
        -- Calculate seasonality index
        EXTRACT(MONTH FROM mp.collected_at) as month,
        AVG(mp.wholesale_price) as monthly_avg
    FROM market_prices_mv mp
    WHERE mp.collected_at >= NOW() - INTERVAL '5 years'
    GROUP BY mp.product_name, mp.region, EXTRACT(MONTH FROM mp.collected_at);
  `);

  await pool.query(`
    CREATE UNIQUE INDEX if not exists idx_market_intelligence_mv ON market_intelligence_mv(product_name, region, month);
  `);

  await pool.query(`
    -- Add new columns to marketplace_products table
    ALTER TABLE marketplace_products 
    ADD COLUMN IF NOT EXISTS external_sales INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS manual_adjustments INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMP,
    ADD COLUMN IF NOT EXISTS auto_sync BOOLEAN DEFAULT true;
  `);

  await pool.query(`
    -- Create inventory_adjustments table for audit trail
    CREATE TABLE IF NOT EXISTS inventory_adjustments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      marketplace_product_id UUID REFERENCES marketplace_products(id) ON DELETE CASCADE,
      farm_product_id UUID REFERENCES farm_products(id) ON DELETE SET NULL,
      previous_quantity INTEGER NOT NULL,
      new_quantity INTEGER NOT NULL,
      change_amount INTEGER NOT NULL,
      reason TEXT NOT NULL CHECK (reason IN ('marketplace_sale', 'external_sale', 'inventory_correction', 'damage', 'other')),
      notes TEXT,
      farmer_id UUID REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await pool.query(`
    -- Create index for faster queries
    CREATE INDEX IF NOT EXISTS idx_inventory_adjustments_product 
    ON inventory_adjustments(marketplace_product_id, created_at DESC);
  `);// Add these ALTER TABLE statements to your bootstrap.ts

  await pool.query(`
    -- Add new columns to marketplace_products table
    ALTER TABLE marketplace_products 
    ADD COLUMN IF NOT EXISTS external_sales INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS manual_adjustments INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMP,
    ADD COLUMN IF NOT EXISTS auto_sync BOOLEAN DEFAULT true;
  `);

  await pool.query(`
    -- Create inventory_adjustments table for audit trail
    CREATE TABLE IF NOT EXISTS inventory_adjustments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      marketplace_product_id UUID REFERENCES marketplace_products(id) ON DELETE CASCADE,
      farm_product_id UUID REFERENCES farm_products(id) ON DELETE SET NULL,
      previous_quantity INTEGER NOT NULL,
      new_quantity INTEGER NOT NULL,
      change_amount INTEGER NOT NULL,
      reason TEXT NOT NULL CHECK (reason IN ('marketplace_sale', 'external_sale', 'inventory_correction', 'damage', 'other')),
      notes TEXT,
      farmer_id UUID REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await pool.query(`
    -- Create index for faster queries
    CREATE INDEX IF NOT EXISTS idx_inventory_adjustments_product 
    ON inventory_adjustments(marketplace_product_id, created_at DESC);
  `);

  await pool.query(`
    -- Credit Providers table
    CREATE TABLE IF NOT EXISTS credit_providers (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(255) NOT NULL,
      logo_url TEXT,
      description TEXT,
      website TEXT,
      api_endpoint TEXT,
      integration_type VARCHAR(50) DEFAULT 'manual',
      status VARCHAR(50) DEFAULT 'active',
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await pool.query(`
    -- Credit Products table
    CREATE TABLE IF NOT EXISTS credit_products (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      provider_id UUID REFERENCES credit_providers(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      description TEXT,
      min_amount NUMERIC(12,2) NOT NULL,
      max_amount NUMERIC(12,2) NOT NULL,
      interest_rate NUMERIC(5,2) NOT NULL,
      interest_rate_type VARCHAR(20) DEFAULT 'fixed',
      repayment_period_min INTEGER NOT NULL,
      repayment_period_max INTEGER NOT NULL,
      processing_fee NUMERIC(12,2) DEFAULT 0,
      collateral_required BOOLEAN DEFAULT false,
      requirements JSONB,
      status VARCHAR(50) DEFAULT 'available',
      external_product_id VARCHAR(255),
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await pool.query(`
    -- Credit Applications table
    CREATE TABLE IF NOT EXISTS credit_applications (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      farmer_id UUID NOT NULL,
      product_id UUID REFERENCES credit_products(id),
      amount NUMERIC(12,2) NOT NULL,
      repayment_period INTEGER NOT NULL,
      purpose TEXT,
      status VARCHAR(50) DEFAULT 'submitted',
      external_application_id VARCHAR(255),
      provider_response JSONB,
      applied_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await pool.query(`
    -- Create indexes
    CREATE INDEX IF NOT EXISTS idx_credit_applications_farmer ON credit_applications(farmer_id);
    CREATE INDEX IF NOT EXISTS idx_credit_products_provider ON credit_products(provider_id);  
  `);

  await pool.query(`  
    -- Store conversations for fine-tuning
    -- DROP TABLE IF EXISTS knowledge_conversations CASCADE;
    CREATE TABLE IF NOT EXISTS knowledge_conversations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      farmer_id INTEGER REFERENCES farmers(id), -- INTEGER to match farmers.id
      query TEXT NOT NULL,
      response TEXT NOT NULL,
      sources JSONB,
      feedback_score INTEGER,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await pool.query(`
    -- Store documents/knowledge base
    -- DROP TABLE IF EXISTS knowledge_documents CASCADE;
    CREATE TABLE IF NOT EXISTS knowledge_documents (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      category TEXT,
      source TEXT,
      embedding vector(1536),
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await pool.query(`
    -- Track fine-tuning jobs
    -- DROP TABLE IF EXISTS fine_tuning_jobs CASCADE;
    CREATE TABLE IF NOT EXISTS fine_tuning_jobs ( -- Fixed typo
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      model_name TEXT NOT NULL,
      base_model TEXT NOT NULL,
      training_data_count INTEGER,
      status TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  // Insurance Providers
  await pool.query(`
    CREATE TABLE IF NOT EXISTS insurance_providers (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(255) NOT NULL,
      logo_url TEXT,
      description TEXT,
      website TEXT,
      contact_phone VARCHAR(50),
      contact_email VARCHAR(255),
      status VARCHAR(50) DEFAULT 'active',
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
  `);

  // Insurance Products
  await pool.query(`
    CREATE TABLE IF NOT EXISTS insurance_products (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      provider_id UUID REFERENCES insurance_providers(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      type VARCHAR(50) NOT NULL CHECK (type IN ('crop', 'livestock', 'equipment', 'health', 'weather', 'liability')),
      description TEXT,
      coverage_details JSONB,
      premium_min NUMERIC(12,2) NOT NULL,
      premium_max NUMERIC(12,2) NOT NULL,
      coverage_period VARCHAR(100),
      eligibility_requirements JSONB,
      features TEXT[],
      documents_required JSONB,
      status VARCHAR(50) DEFAULT 'active',
      popular BOOLEAN DEFAULT false,
      external_product_id VARCHAR(255),
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
  `);

  // Insurance Applications
  await pool.query(`
    CREATE TABLE IF NOT EXISTS insurance_applications (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      farmer_id INTEGER REFERENCES farmers(id) ON DELETE CASCADE,
      product_id UUID REFERENCES insurance_products(id),
      coverage_amount NUMERIC(12,2) NOT NULL,
      premium NUMERIC(12,2) NOT NULL,
      start_date DATE NOT NULL,
      end_date DATE NOT NULL,
      status VARCHAR(50) DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'under_review', 'approved', 'rejected', 'active', 'expired', 'cancelled')),
      documents JSONB,
      notes TEXT,
      external_application_id VARCHAR(255),
      applied_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
  `);

  // Insurance Claims
  await pool.query(`
    CREATE TABLE IF NOT EXISTS insurance_claims (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      application_id UUID REFERENCES insurance_applications(id) ON DELETE CASCADE,
      claim_number VARCHAR(100) UNIQUE,
      incident_date DATE NOT NULL,
      description TEXT,
      amount_claimed NUMERIC(12,2) NOT NULL,
      amount_approved NUMERIC(12,2),
      status VARCHAR(50) DEFAULT 'submitted' CHECK (status IN ('submitted', 'under_review', 'approved', 'rejected', 'paid')),
      documents JSONB,
      adjustor_notes TEXT,
      filed_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
  `);

  // Create indexes
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_insurance_products_provider ON insurance_products(provider_id);
    CREATE INDEX IF NOT EXISTS idx_insurance_products_type ON insurance_products(type);
    CREATE INDEX IF NOT EXISTS idx_insurance_applications_farmer ON insurance_applications(farmer_id);
    CREATE INDEX IF NOT EXISTS idx_insurance_applications_status ON insurance_applications(status);
    CREATE INDEX IF NOT EXISTS idx_insurance_claims_application ON insurance_claims(application_id);
  `);

  // Run this once to populate sample insurance providers and products
  /*
  await pool.query(`
    INSERT INTO insurance_providers (name, description, website, contact_phone, contact_email)
    VALUES
      ('PULA Insurance', 'Agricultural insurance specialists', 'https://pula-insurance.com', '+254 700 123456', 'info@pula-insurance.com'),
      ('APA Insurance', 'Comprehensive farm insurance', 'https://apainsurance.org', '+254 700 123457', 'info@apainsurance.org'),
      ('Jubilee Insurance', 'Equipment and asset protection', 'https://jubileeinsurance.com', '+254 700 123458', 'info@jubileeinsurance.com'),
      ('ACRE Africa', 'Weather index insurance', 'https://acreafrica.com', '+254 700 123459', 'info@acreafrica.com')
    RETURNING id;
  `);

  // Insert products for each provider
  await pool.query(`
    INSERT INTO insurance_products (
      provider_id, name, type, description, premium_min, premium_max,
      coverage_period, features, popular, eligibility_requirements
    ) VALUES
    ((SELECT id FROM insurance_providers WHERE name = 'PULA Insurance'),
     'Comprehensive Crop Insurance', 'crop',
     'Protect your crops against drought, floods, pests, and diseases.',
     5000, 50000, '1 growing season',
     ARRAY['Covers drought, excessive rainfall, and hail', 'Pest and disease outbreak coverage', 'Free agronomic advice included', 'Quick claims processing within 7 days'],
     true,
     '["Minimum 1 acre of land", "Registered farmer", "Crops must be healthy at time of application"]'::jsonb),

    ((SELECT id FROM insurance_providers WHERE name = 'APA Insurance'),
     'Livestock Insurance', 'livestock',
     'Comprehensive coverage for cattle, goats, sheep, and poultry.',
     2000, 30000, '1 year',
     ARRAY['Covers death due to disease or accident', 'Theft protection', 'Veterinary consultation included', 'Emergency slaughter coverage'],
     true,
     '["Minimum 5 livestock units", "Vaccination records required", "Regular veterinary check-ups"]'::jsonb),

    ((SELECT id FROM insurance_providers WHERE name = 'Jubilee Insurance'),
     'Farm Equipment Insurance', 'equipment',
     'Protect your tractors, harvesters, and other farm machinery.',
     10000, 100000, '1 year',
     ARRAY['Covers accidental damage', 'Theft protection', 'Breakdown coverage', 'Replacement parts included'],
     false,
     '["Equipment must be less than 10 years old", "Regular maintenance records"]'::jsonb),

    ((SELECT id FROM insurance_providers WHERE name = 'ACRE Africa'),
     'Weather Index Insurance', 'weather',
     'Payouts based on weather data, no need for field inspections.',
     3000, 25000, '1 season',
     ARRAY['Automatic payouts when weather triggers are met', 'No field inspections required', 'Covers drought and excess rainfall', 'Fast claims processing'],
     true,
     '["Farm location must have weather station", "Minimum 2 acres"]'::jsonb);
  `);
  */

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
