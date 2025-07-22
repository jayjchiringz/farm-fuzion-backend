import express, {Express, Request, Response, NextFunction} from "express";
import cors from "cors";
import {bootstrapDatabase} from "./utils/bootstrap";

// Routers
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
import {getMpesaRouter} from "./api/mpesa";
import {getWalletRouter} from "./api/wallet";
import {getOtpRouter} from "./api/otp";

// ✅ Shared config
const allowedOrigins = ["https://farm-fuzion-abdf3.web.app"];

export interface Secrets {
  PGUSER: { value: () => string };
  PGPASS: { value: () => string };
  PGHOST: { value: () => string };
  PGDB: { value: () => string };
  PGPORT: { value: () => string };
  MAIL_USER: { value: () => string };
  MAIL_PASS: { value: () => string };
}

let cachedApp: Express | null = null;

export const initMainApp = async (secrets: Secrets): Promise<Express> => {
  if (cachedApp) return cachedApp;

  const app = express();

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

  try {
    await bootstrapDatabase(config, FORCE_BOOTSTRAP);
    console.log("✅ Database bootstrapped");
  } catch (err) {
    console.error("❌ Bootstrap failure (non-fatal):", err);
  }

  app.use(cors({
    origin: allowedOrigins,
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  }));

  app.use(express.json());

  // Attach db config per request
  app.use((req: Request, _res: Response, next: NextFunction) => {
    (req as any).dbConfig = config;
    next();
  });

  app.get("/health", (_req, res) => res.status(200).send("OK"));

  // Routers with injected config
  app.use("/groups", getGroupsRouter(config));
  app.use("/auth", getAuthRouter(config));
  app.use("/taxes", getTaxesRouter(config));
  app.use("/loans", getLoansRouter(config));
  app.use("/risks", getRisksRouter(config));
  app.use("/farmers", getFarmersRouter(config));
  app.use("/payments", getPaymentsRouter(config));
  app.use("/directors", getDirectorsRouter(config));
  app.use("/logistics", getLogisticsRouter(config));
  app.use("/financials", getFinancialsRouter(config));
  app.use("/businesses", getBusinessesRouter(config));
  app.use("/declarations", getDeclarationsRouter(config));
  app.use("/farm-products", getFarmProductsRouter(config));
  app.use("/loan-repayments", getLoanRepaymentsRouter(config));
  app.use("/groups-types", getGroupTypesRouter(config));
  app.use("/document-types", getDocumentTypesRouter(config));
  app.use("/stats", getStatsRouter(config));
  app.use("/mpesa", getMpesaRouter());
  app.use("/wallet", getWalletRouter(config));
  app.use("/otp", getOtpRouter(config));

  cachedApp = app;
  return app;
};
