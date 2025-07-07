import {onRequest} from "firebase-functions/v2/https";
import {bootstrapDatabase} from "./utils/bootstrap";
import cors from "cors";
import express from "express";

// ✅ Runtime-safe config fallback
const runtimeConfig = process.env;
type FunctionsConfig = {
  functions?: {
    config?: () => Record<string, unknown>;
  };
};

type ConfigType = {
  db?: {
    pguser?: string;
    pgpass?: string;
    pghost?: string;
    pgport?: string;
    pgdb?: string;
  };
  mail?: {
    user?: string;
    pass?: string;
  };
};

const functionsConfig: ConfigType =
  ((globalThis as typeof globalThis & FunctionsConfig).functions?.config?.() ??
    {}) as ConfigType;

// 🔐 Extract config from Firebase env or fallback to process.env
const config = {
  PGUSER: functionsConfig.db?.pguser || runtimeConfig.db_pguser || "",
  PGPASS: functionsConfig.db?.pgpass || runtimeConfig.db_pgpass || "",
  PGHOST: functionsConfig.db?.pghost || runtimeConfig.db_pghost || "",
  PGPORT: functionsConfig.db?.pgport || runtimeConfig.db_pgport || "5432",
  PGDB: functionsConfig.db?.pgdb || runtimeConfig.db_pgdb || "",
  MAIL_USER: functionsConfig.mail?.user || runtimeConfig.mail_user || "",
  MAIL_PASS: functionsConfig.mail?.pass || runtimeConfig.mail_pass || "",
};

const FORCE_BOOTSTRAP = runtimeConfig.FORCE_BOOTSTRAP?.toLowerCase() === "true";

// 🧩 Routers
import {getKycRouter} from "./api/kyc";
import {getAuthRouter} from "./api/auth";
import {getTaxesRouter} from "./api/taxes";
import {getRisksRouter} from "./api/risks";
import {getLoansRouter} from "./api/loans";
import {getGroupsRouter} from "./api/groups";
import {getFarmersRouter} from "./api/farmers";
import {getPaymentsRouter} from "./api/payments";
import {getDirectorsRouter} from "./api/directors";
import {getLogisticsRouter} from "./api/logistics";
import {getFinancialsRouter} from "./api/financials";
import {getBusinessesRouter} from "./api/businesses";
import {getDeclarationsRouter} from "./api/declarations";
import {getFarmProductsRouter} from "./api/farm_products";
import {getLoanRepaymentsRouter} from "./api/loan_repayments";

// ✅ Define Firebase Function Handler
export const api = onRequest(async (req, res) => {
  // 🛠️ Ensure DB is bootstrapped before processing
  await bootstrapDatabase(config, FORCE_BOOTSTRAP);

  // 🚀 Create fresh express app for each request
  const app = express();
  app.use(cors());
  app.use(express.json());

  // 📦 Register routers
  app.use("/kyc", getKycRouter(config));
  app.use("/auth", getAuthRouter(config));
  app.use("/taxes", getTaxesRouter(config));
  app.use("/loans", getLoansRouter(config));
  app.use("/risks", getRisksRouter(config));
  app.use("/farmers", getFarmersRouter(config));
  app.use("/payments", getPaymentsRouter(config));
  app.use("/directors", getDirectorsRouter(config));
  app.use("/logistics", getLogisticsRouter(config));
  app.use("/api/groups", getGroupsRouter(config));
  app.use("/financials", getFinancialsRouter(config));
  app.use("/businesses", getBusinessesRouter(config));
  app.use("/declarations", getDeclarationsRouter(config));
  app.use("/farm-products", getFarmProductsRouter(config));
  app.use("/loan-repayments", getLoanRepaymentsRouter(config));

  // 🔁 Forward request/response to Express app
  return app(req, res);
});
