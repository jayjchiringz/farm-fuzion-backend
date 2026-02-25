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

const allowedOrigins = ["https://farm-fuzion-abdf3.web.app"];

export const createMainApp = (secrets: {
  PGUSER: any;
  PGPASS: any;
  PGHOST: any;
  PGDB: any;
  PGPORT: any;
  MAIL_USER: any;
  MAIL_PASS: any;
  MSIMBO_MERCHANT_ID: any;
  MSIMBO_SECRET_KEY: any;
  MSIMBO_PUBLIC_ID: any;
  SILICONFLOW_API_KEY: any;
}) => {
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

  app.use((req, res, next) => {
    if (req.is("application/json")) {
      express.json()(req, res, next);
    } else {
      next();
    }
  });

  app.use(async (req, res, next) => {
    try {
      const config = {
        PGUSER: secrets.PGUSER.value(),
        PGPASS: secrets.PGPASS.value(),
        PGHOST: secrets.PGHOST.value(),
        PGDB: secrets.PGDB.value(),
        PGPORT: secrets.PGPORT.value(),
        MAIL_USER: secrets.MAIL_USER.value(),
        MAIL_PASS: secrets.MAIL_PASS.value(),
      };

      const FORCE_BOOTSTRAP = process.env.FORCE_BOOTSTRAP?.toLowerCase() === "true";
      await bootstrapDatabase(config, FORCE_BOOTSTRAP);

      (req as any).dbConfig = config;
      next();
    } catch (err) {
      console.error("❌ Bootstrap error:", err);
      res.status(500).json({error: "Bootstrap failed"});
    }
  });

  // ✅ Register all routers - ONE registration per path
  app.use("/groups", (req, res, next) => getGroupsRouter((req as any).dbConfig)(req, res, next));
  app.use("/auth", (req, res, next) => getAuthRouter((req as any).dbConfig)(req, res, next));
  app.use("/taxes", (req, res, next) => getTaxesRouter((req as any).dbConfig)(req, res, next));
  app.use("/loans", (req, res, next) => getLoansRouter((req as any).dbConfig)(req, res, next));
  app.use("/risks", (req, res, next) => getRisksRouter((req as any).dbConfig)(req, res, next));
  app.use("/farmers", (req, res, next) => getFarmersRouter((req as any).dbConfig)(req, res, next));
  app.use("/payments", (req, res, next) => getPaymentsRouter((req as any).dbConfig)(req, res, next));
  app.use("/directors", (req, res, next) => getDirectorsRouter((req as any).dbConfig)(req, res, next));
  app.use("/logistics", (req, res, next) => getLogisticsRouter((req as any).dbConfig)(req, res, next));
  app.use("/financials", (req, res, next) => getFinancialsRouter((req as any).dbConfig)(req, res, next));
  app.use("/businesses", (req, res, next) => getBusinessesRouter((req as any).dbConfig)(req, res, next));
  app.use("/declarations", (req, res, next) => getDeclarationsRouter((req as any).dbConfig)(req, res, next));
  app.use("/farm-products", (req, res, next) => getFarmProductsRouter((req as any).dbConfig)(req, res, next));
  app.use("/loan-repayments", (req, res, next) => getLoanRepaymentsRouter((req as any).dbConfig)(req, res, next));
  app.use("/groups-types", (req, res, next) => getGroupTypesRouter((req as any).dbConfig)(req, res, next));
  app.use("/document-types", (req, res, next) => getDocumentTypesRouter((req as any).dbConfig)(req, res, next));
  app.use("/stats", (req, res, next) => getStatsRouter((req as any).dbConfig)(req, res, next));

  app.use("/wallet", async (req, res, next) => {
    try {
      const router = await getWalletRouter((req as any).dbConfig);
      return router(req, res, next);
    } catch (err) {
      return next(err);
    }
  });

  app.use("/market-prices", (req, res, next) => getMarketPricesRouter((req as any).dbConfig)(req, res, next));

  app.use("/marketplace", async (req, res, next) => {
    try {
      const router = await getMarketplaceRouter((req as any).dbConfig);
      return router(req, res, next);
    } catch (err) {
      return next(err);
    }
  });

  app.use("/farm-activities", (req, res, next) =>
    getFarmActivitiesRouter((req as any).dbConfig)(req, res, next)
  );

  app.use("/credit", (req, res, next) => getCreditRouter((req as any).dbConfig)(req, res, next));

  app.use("/knowledge", async (req, res, next) => {
    try {
      const router = await getKnowledgeRouter((req as any).dbConfig);
      return router(req, res, next);
    } catch (err) {
      return next(err);
    }
  });

  app.use("/services", (req, res, next) => getServicesRouter((req as any).dbConfig)(req, res, next));

  // Single mount point
  app.use("/admin/users", (req, res, next) => adminRouter((req as any).dbConfig)(req, res, next));

  return app;
};
