/* eslint-disable max-len */
// functions/src/server.ts
import {createMainApp} from "./main";

// Load environment variables
const requiredEnvVars = [
  "PGUSER", "PGPASS", "PGHOST", "PGDB", "PGPORT",
  "MAIL_USER", "MAIL_PASS",
];

// Check for required environment variables
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`❌ Missing required environment variable: ${envVar}`);
    process.exit(1);
  }
}

// Create the app with environment variables
const app = createMainApp({
  PGUSER: process.env.PGUSER,
  PGPASS: process.env.PGPASS,
  PGHOST: process.env.PGHOST,
  PGDB: process.env.PGDB,
  PGPORT: process.env.PGPORT,
  MAIL_USER: process.env.MAIL_USER,
  MAIL_PASS: process.env.MAIL_PASS,
  MSIMBO_MERCHANT_ID: process.env.MSIMBO_MERCHANT_ID,
  MSIMBO_SECRET_KEY: process.env.MSIMBO_SECRET_KEY,
  MSIMBO_PUBLIC_ID: process.env.MSIMBO_PUBLIC_ID,
  SILICONFLOW_API_KEY: process.env.SILICONFLOW_API_KEY,
});

const port = process.env.PORT || 3001;

app.listen(port, () => {
  console.log(`🚀 FarmFuzion API running on port ${port}`);
  console.log(`📝 Environment: ${process.env.NODE_ENV || "development"}`);

  // Bootstrap database if FORCE_BOOTSTRAP is true
  if (process.env.FORCE_BOOTSTRAP === "true") {
    console.log("🔄 FORCE_BOOTSTRAP enabled - database will be bootstrapped on first request");
  }
});
