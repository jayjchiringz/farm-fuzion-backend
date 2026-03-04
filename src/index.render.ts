/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
// src/index.render.ts
import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import {AppConfig} from "./main";
import {apiRouter} from "./api/index.render";

dotenv.config();

// Load environment variables
const requiredEnvVars = [
  "PGUSER", "PGPASS", "PGHOST", "PGDB", "PGPORT",
  "MAIL_USER", "MAIL_PASS",
] as const;

// Check for required environment variables
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`❌ Missing required environment variable: ${envVar}`);
    process.exit(1);
  }
}

// Create a plain config object
const config: AppConfig = {
  PGUSER: process.env.PGUSER!,
  PGPASS: process.env.PGPASS!,
  PGHOST: process.env.PGHOST!,
  PGDB: process.env.PGDB!,
  PGPORT: process.env.PGPORT!,
  MAIL_USER: process.env.MAIL_USER,
  MAIL_PASS: process.env.MAIL_PASS,
  MSIMBO_MERCHANT_ID: process.env.MSIMBO_MERCHANT_ID,
  MSIMBO_SECRET_KEY: process.env.MSIMBO_SECRET_KEY,
  MSIMBO_PUBLIC_ID: process.env.MSIMBO_PUBLIC_ID,
  SILICONFLOW_API_KEY: process.env.SILICONFLOW_API_KEY,
};

console.log("🔧 Starting FarmFuzion API with config:", {
  ...config,
  MAIL_PASS: config.MAIL_PASS ? "✅ Set" : "❌ Not set",
  MAIL_USER: config.MAIL_USER ? "✅ Set" : "❌ Not set",
});

const app = express();

// Global middleware
app.use(cors({
  origin: [
    "https://farm-fuzion-abdf3.web.app",
    "https://farm-fuzion-frontend-vercel.vercel.app",
    "http://localhost:3000",
    "http://localhost:5173",
  ],
  credentials: true,
}));

app.use(express.json({limit: "10mb"}));
app.use(express.urlencoded({extended: true, limit: "10mb"}));

// Health check endpoints
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || "development",
    mail_configured: !!(config.MAIL_USER && config.MAIL_PASS),
  });
});

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    mail_configured: !!(config.MAIL_USER && config.MAIL_PASS),
  });
});

// Mount all API routes under /api
app.use("/api", apiRouter(config));

// Debug endpoint to see all registered routes
app.get("/debug/routes", (req, res) => {
  const routes: any[] = [];

  const extractRoutes = (stack: any[], basePath = "") => {
    stack.forEach((layer) => {
      if (layer.route) {
        const methods = Object.keys(layer.route.methods).join(", ").toUpperCase();
        routes.push({path: basePath + layer.route.path, methods});
      } else if (layer.name === "router" && layer.handle?.stack) {
        let routerPath = "";
        if (layer.regexp) {
          routerPath = layer.regexp.source
            .replace("\\/?(?=\\/|$)", "")
            .replace(/\\\//g, "/")
            .replace(/^\^/, "");
        }
        extractRoutes(layer.handle.stack, basePath + routerPath);
      }
    });
  };

  if (app._router?.stack) {
    extractRoutes(app._router.stack);
  }

  res.json({total: routes.length, routes: routes.sort((a, b) => a.path.localeCompare(b.path))});
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({error: "Not Found", message: `Cannot ${req.method} ${req.path}`});
});

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("❌ Unhandled error:", err);
  res.status(500).json({error: "Internal server error", message: err.message});
});

const port = process.env.PORT || 3001;

app.listen(port, () => {
  console.log(`🚀 FarmFuzion API running on port ${port}`);
  console.log(`📝 Environment: ${process.env.NODE_ENV || "development"}`);
  console.log(`📋 API available at http://localhost:${port}/api`);
  console.log(`📧 Mail configured: ${!!(config.MAIL_USER && config.MAIL_PASS)}`);
  console.log(`🔍 Debug routes: http://localhost:${port}/debug/routes`);
});

export default app;
