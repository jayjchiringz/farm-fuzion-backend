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

console.log("🔧 Starting FarmFuzion API with config:", {
  PGUSER: process.env.PGUSER,
  PGHOST: process.env.PGHOST,
  PGDB: process.env.PGDB,
  PGPORT: process.env.PGPORT,
  MAIL_USER: process.env.MAIL_USER ? "✅ Set" : "❌ Not set",
  MAIL_PASS: process.env.MAIL_PASS ? "✅ Set" : "❌ Not set",
});

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

const server = app.listen(port, () => {
  console.log(`🚀 FarmFuzion API running on port ${port}`);
  console.log(`📝 Environment: ${process.env.NODE_ENV || "development"}`);
  console.log(`📧 Mail configured: ${!!(process.env.MAIL_USER && process.env.MAIL_PASS)}`);
  console.log(`📍 Health check: http://localhost:${port}/health`);

  // Bootstrap database if FORCE_BOOTSTRAP is true
  if (process.env.FORCE_BOOTSTRAP === "true") {
    console.log("🔄 FORCE_BOOTSTRAP enabled - database will be bootstrapped on first request");
  }
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM received, shutting down gracefully...");
  server.close(() => {
    console.log("Server closed");
    process.exit(0);
  });
});

process.on("SIGINT", () => {
  console.log("SIGINT received, shutting down gracefully...");
  server.close(() => {
    console.log("Server closed");
    process.exit(0);
  });
});

export default app;
