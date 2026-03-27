/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-var-requires */
/* eslint-disable import/no-duplicates */
/* eslint-disable import/no-named-as-default */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
import rateLimit from "express-rate-limit";
import {ipKeyGenerator} from "express-rate-limit";

import express from "express";
import cors from "cors";
import {bootstrapDatabase} from "./utils/bootstrap";
import {setupSwagger} from "./utils/swagger";
import {sanitizeInput} from "./middleware/sanitize";
import {safeLogger} from "./utils/logger";

// 🧩 Routers
import {getGroupsRouter} from "./api/groups";
import {getAuthRouter} from "./api/auth";
import {getTaxesRouter} from "./api/taxes";
import {getRisksRouter} from "./api/risks";
import {getLoansRouter} from "./api/loans";
import {getFarmersRouter} from "./api/farmers";
import {getPaymentsRouter} from "./api/payments";
import {getDirectorsRouter} from "./api/directors";
import {getLogisticsRouter} from "./api/logistics";
import {getFinancialsRouter} from "./api/financials";
import {getBusinessesRouter} from "./api/businesses";
import {getGroupTypesRouter} from "./api/group_types";
import {getDeclarationsRouter} from "./api/declarations";
import {getFarmProductsRouter} from "./api/farm_products";
import {getLoanRepaymentsRouter} from "./api/loan_repayments";
import {getDocumentTypesRouter} from "./api/document_types";
import {getStatsRouter} from "./api/stats";
import {getWalletRouter} from "./api/wallet";
import {getMarketPricesRouter} from "./api/market_prices";
import {getMarketplaceRouter} from "./api/marketplace";
import {getFarmActivitiesRouter} from "./api/farm_activities";
import helmet from "helmet";
import {requestId} from "./middleware/requestId";
import {getCreditRouter} from "./api/credit";
import {getKnowledgeRouter} from "./api/knowledge";
import {getServicesRouter} from "./api/services";
import {adminRouter} from "./api/admin";
import {getRolesRouter} from "./api/roles";
import {getGroupAdminsRouter} from "./api/group-admins"; // ✅ ADD THIS IMPORT

// Update allowed origins to include Vercel frontend
const allowedOrigins = [
  "https://farm-fuzion-abdf3.web.app",
  "https://farm-fuzion-frontend-vercel.vercel.app",
  "http://localhost:3000",
  "http://localhost:5173",
];

// Database config (required for all routers)
export interface DbConfig {
  PGUSER: string;
  PGPASS: string;
  PGHOST: string;
  PGDB: string;
  PGPORT: string;
}

// Full app config with optional mail settings
export interface AppConfig extends DbConfig {
  MAIL_USER?: string;
  MAIL_PASS?: string;
  MSIMBO_MERCHANT_ID?: string;
  MSIMBO_SECRET_KEY?: string;
  MSIMBO_PUBLIC_ID?: string;
  SILICONFLOW_API_KEY?: string;
}

// Extend Express Request to include dbConfig
interface RequestWithConfig extends express.Request {
  dbConfig?: DbConfig; // Use DbConfig here, not AppConfig
}

// Define error interface for error handler
interface AppError extends Error {
  status?: number;
  code?: string;
}

export const createMainApp = (config: AppConfig) => {
  const app = express();
  setupSwagger(app);

  app.set("trust proxy", 1);

  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    validate: {
      xForwardedForHeader: false,
      forwardedHeader: false,
    },
    keyGenerator: (req) => {
      const forwarded = req.headers["x-forwarded-for"];
      const ip = Array.isArray(forwarded) ? forwarded[0] : forwarded || req.ip;
      return ipKeyGenerator(ip || "0.0.0.0");
    },
  });

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    validate: {
      xForwardedForHeader: false,
      forwardedHeader: false,
    },
    keyGenerator: (req) => {
      const forwarded = req.headers["x-forwarded-for"];
      const ip = Array.isArray(forwarded) ? forwarded[0] : forwarded || req.ip;
      return ipKeyGenerator(ip || "0.0.0.0");
    },
  });

  app.use(
    cors({
      origin: allowedOrigins,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
      credentials: true,
    })
  );

  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "https:"],
        scriptSrc: ["'self'"],
      },
    },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
  }));

  app.use(requestId);
  app.use(sanitizeInput);
  app.use("/api", apiLimiter);
  app.use("/auth", authLimiter);
  app.use(safeLogger);
  app.options("*", cors());

  app.use((req: RequestWithConfig, res, next) => {
    if (req.is("application/json")) {
      express.json()(req, res, next);
    } else {
      next();
    }
  });

  // Bootstrap middleware - now using config directly
  app.use(async (req: RequestWithConfig, res, next) => {
    try {
      // Log mail config status (without exposing values)
      console.log("📧 Mail configured:", !!(config.MAIL_USER && config.MAIL_PASS));

      const FORCE_BOOTSTRAP = process.env.FORCE_BOOTSTRAP?.toLowerCase() === "true";
      await bootstrapDatabase(config, FORCE_BOOTSTRAP);

      // Store only the database config on the request
      req.dbConfig = {
        PGUSER: config.PGUSER,
        PGPASS: config.PGPASS,
        PGHOST: config.PGHOST,
        PGDB: config.PGDB,
        PGPORT: config.PGPORT,
      };
      next();
    } catch (err: unknown) {
      const error = err as Error;
      console.error("❌ Bootstrap error:", error.message);
      res.status(500).json({error: "Bootstrap failed"});
    }
  });

  // Health check endpoint for Render
  app.get("/health", (req, res) => {
    res.status(200).json({
      status: "ok",
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || "development",
      mail_configured: !!(config.MAIL_USER && config.MAIL_PASS),
    });
  });

  // Helper function to mount sync routers under /api
  const registerSyncRouter = (path: string, getRouter: (config: AppConfig) => express.Router): void => {
    app.use(`/api${path}`, (req: RequestWithConfig, res, next) => {
      try {
        if (!req.dbConfig) {
          throw new Error("Database configuration not available");
        }
        // Use the full AppConfig - you have it from the outer scope
        const router = getRouter(config); // This is fine
        router(req as any, res, next);
      } catch (err) {
        next(err);
      }
    });
  };

  // ADD THIS - Helper function to mount async routers under /api
  const registerAsyncRouter = (
    path: string,
    getRouter: (config: DbConfig) => Promise<express.Router>
  ): void => {
    app.use(`/api${path}`, async (req: RequestWithConfig, res, next) => {
      try {
        if (!req.dbConfig) {
          throw new Error("Database configuration not available");
        }
        const router = await getRouter(req.dbConfig);
        router(req as any, res, next);
      } catch (err) {
        next(err);
      }
    });
  };

  // Register all sync routers
  registerSyncRouter("/groups", getGroupsRouter);
  registerSyncRouter("/auth", getAuthRouter);
  registerSyncRouter("/taxes", getTaxesRouter);
  registerSyncRouter("/loans", getLoansRouter);
  registerSyncRouter("/risks", getRisksRouter);
  registerSyncRouter("/farmers", getFarmersRouter);
  registerSyncRouter("/payments", getPaymentsRouter);
  registerSyncRouter("/directors", getDirectorsRouter);
  registerSyncRouter("/logistics", getLogisticsRouter);
  registerSyncRouter("/financials", getFinancialsRouter);
  registerSyncRouter("/businesses", getBusinessesRouter);
  registerSyncRouter("/declarations", getDeclarationsRouter);
  registerSyncRouter("/farm-products", getFarmProductsRouter);
  registerSyncRouter("/loan-repayments", getLoanRepaymentsRouter);
  registerSyncRouter("/groups-types", getGroupTypesRouter);
  registerSyncRouter("/document-types", getDocumentTypesRouter);
  registerSyncRouter("/stats", getStatsRouter);
  registerSyncRouter("/market-prices", getMarketPricesRouter);
  registerSyncRouter("/farm-activities", getFarmActivitiesRouter);
  registerSyncRouter("/credit", getCreditRouter);
  registerSyncRouter("/services", getServicesRouter);
  registerSyncRouter("/admin/users", adminRouter);
  registerSyncRouter("/roles", getRolesRouter);
  registerSyncRouter("/marketplace", getMarketplaceRouter);
  registerSyncRouter("/knowledge", getKnowledgeRouter);
  registerSyncRouter("/group-admins", getGroupAdminsRouter); // ✅ ADD THIS REGISTRATION

  // Only truly async routers go here
  registerAsyncRouter("/wallet", getWalletRouter);

  // Error handling middleware with proper typing
  app.use((err: AppError, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error("❌ Unhandled error:", {
      name: err.name,
      message: err.message,
      stack: err.stack,
      status: err.status,
      code: err.code,
    });

    res.status(err.status || 500).json({
      error: "Internal server error",
      message: err.message || "An unexpected error occurred",
      ...(process.env.NODE_ENV === "development" && {stack: err.stack}),
    });
  });

  return app;
};

// This allows the same app to work with both Firebase Functions and Express server
if (require.main === module) {
  // This file is being run directly as a script
  const dotenv = require("dotenv");
  dotenv.config();

  // Load config directly from environment variables
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

  // Validate required database config
  const requiredDbVars = ["PGUSER", "PGPASS", "PGHOST", "PGDB", "PGPORT"];
  for (const varName of requiredDbVars) {
    if (!process.env[varName]) {
      console.error(`❌ Missing required environment variable: ${varName}`);
      process.exit(1);
    }
  }

  const app = createMainApp(config);
  const port = process.env.PORT || 3001;

  app.listen(port, () => {
    console.log(`🚀 Server running on port ${port}`);
    console.log(`📧 Mail configured: ${!!(config.MAIL_USER && config.MAIL_PASS)}`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV || "development"}`);
  });
}
