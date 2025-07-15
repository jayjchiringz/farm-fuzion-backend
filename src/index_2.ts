/* eslint-disable @typescript-eslint/no-explicit-any */
import {onRequest} from "firebase-functions/v2/https";
import {defineSecret} from "firebase-functions/params";
import {bootstrapDatabase} from "./utils/bootstrap";
import express, {Request, Response} from "express";
import {getDocumentTypesRouter} from "./api/document_types";
import multer from "multer";
import os from "os";

// 🔐 Secrets
const PGUSER = defineSecret("PGUSER");
const PGPASS = defineSecret("PGPASS");
const PGHOST = defineSecret("PGHOST");
const PGDB = defineSecret("PGDB");
const PGPORT = defineSecret("PGPORT");
const MAIL_USER = defineSecret("MAIL_USER");
const MAIL_PASS = defineSecret("MAIL_PASS");

const FORCE_BOOTSTRAP = process.env.FORCE_BOOTSTRAP?.toLowerCase() === "true";

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
import {getGroupTypesRouter} from "./api/group_types";
import {getDeclarationsRouter} from "./api/declarations";
import {getFarmProductsRouter} from "./api/farm_products";
import {getLoanRepaymentsRouter} from "./api/loan_repayments";

// ✅ Define Firebase Function Handler
export const api = onRequest(
  {
    secrets: [PGUSER, PGPASS, PGHOST, PGDB, PGPORT, MAIL_USER, MAIL_PASS],
    timeoutSeconds: 60, // 1 minute
  },
  async (req: Request, res: Response): Promise<void> => {
    // Apply CORS headers manually
    res.setHeader("Access-Control-Allow-Origin", "https://farm-fuzion-abdf3.web.app");
    res.setHeader(
      "Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS"
    );
    res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
    res.setHeader("Access-Control-Allow-Credentials", "true");

    // Preflight
    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }

    const config = {
      PGUSER: PGUSER.value(),
      PGPASS: PGPASS.value(),
      PGHOST: PGHOST.value(),
      PGPORT: PGPORT.value(),
      PGDB: PGDB.value(),
      MAIL_USER: MAIL_USER.value(),
      MAIL_PASS: MAIL_PASS.value(),
    };

    await bootstrapDatabase(config, FORCE_BOOTSTRAP);

    const app = express();
    const upload = multer({
      storage: multer.diskStorage({
        destination: (req, file, cb) => cb(null, os.tmpdir()),
        filename: (req, file, cb) => cb(
          null, `${Date.now()}-${file.originalname}`
        ),
      }),
      limits: {fileSize: 10 * 1024 * 1024}, // 10MB max
    });

    // Handle JSON + multipart
    app.use(upload.any());
    app.use(express.json());


    try {
      app.use("/kyc", getKycRouter(config));
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
      app.use("/groups", getGroupsRouter(config));
      app.use("/groups-types", getGroupTypesRouter(config));
      app.use("/document-types", getDocumentTypesRouter(config));
    } catch (err) {
      console.error("❌ Router registration failed:", err);
      res.status(500).json({
        error: "Router init failed",
        details: err instanceof Error ? err.message : "Unknown error",
      });
      return;
    }

    await new Promise<void>((resolve) => (app as any)(req, res, resolve));
  }
);
