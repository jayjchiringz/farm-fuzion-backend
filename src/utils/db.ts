import {Pool} from "pg";

let pool: Pool | null = null;

export type DbConfig = {
  PGUSER: string;
  PGPASS: string;
  PGHOST: string;
  PGDB: string;
  PGPORT: string;
};

export const initDbPool = (config?: DbConfig) => {
  if (!pool) {
    if (!config) {
      throw new Error("DB config must be provided for initial pool setup.");
    }

    console.log("🔐 Setting up DB pool with config:", {
      PGUSER: config.PGUSER,
      PGHOST: config.PGHOST,
      PGDB: config.PGDB,
      PGPORT: config.PGPORT,
    });

    pool = new Pool({
      user: config.PGUSER,
      password: config.PGPASS,
      host: config.PGHOST,
      database: config.PGDB,
      port: parseInt(config.PGPORT, 10),
      ssl: {
        rejectUnauthorized: false, // 🔐 Required for Render and other cloud DBs
      },
    });
  }

  return pool;
};

export const connectToDatabase = async (config: DbConfig) => {
  try {
    const db = initDbPool(config);
    await db.connect();
    console.log("✅ Connected to DB");
  } catch (error) {
    console.error("❌ DB Connection Failed:", error);
  }
};

export const disconnectFromDatabase = async () => {
  try {
    if (pool) {
      await pool.end();
      console.log("🛑 DB Disconnected");
    }
  } catch (error) {
    console.error("❌ DB Disconnection Error:", error);
  }
};

export const queryDatabase = async (
  config: DbConfig,
  query: string,
  params: unknown[] = []
) => {
  const db = initDbPool(config);
  return await db.query(query, params);
};
