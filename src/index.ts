import {onRequest} from "firebase-functions/v2/https";
import {defineSecret} from "firebase-functions/params";
import {bootstrapDatabase} from "./utils/bootstrap";
import {getGroupTypesRouter} from "./api/group_types";
import cors from "cors";
import express from "express";

// ✅ Configure CORS
const allowedOrigins = ["https://farm-fuzion-abdf3.web.app"];
const corsOptions = {
  origin: allowedOrigins,
  methods: "GET,POST,PATCH,DELETE,OPTIONS",
  allowedHeaders: "Content-Type,Authorization",
  credentials: true,
};

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
import {getDeclarationsRouter} from "./api/declarations";
import {getFarmProductsRouter} from "./api/farm_products";
import {getLoanRepaymentsRouter} from "./api/loan_repayments";

// ✅ Define Firebase Function Handler
export const api = onRequest(
  {
    secrets: [PGUSER, PGPASS, PGHOST, PGDB, PGPORT, MAIL_USER, MAIL_PASS],
  },
  async (req, res) => {
    const config = {
      PGUSER: PGUSER.value(),
      PGPASS: PGPASS.value(),
      PGHOST: PGHOST.value(),
      PGPORT: PGPORT.value(),
      PGDB: PGDB.value(),
      MAIL_USER: MAIL_USER.value(),
      MAIL_PASS: MAIL_PASS.value(),
    };

    // 🛠️ Ensure DB is bootstrapped before processing
    await bootstrapDatabase(config, FORCE_BOOTSTRAP);

    // 🚀 Create fresh express app for each request
    const app = express();

    // ✅ Move these to the very top
    app.use(cors(corsOptions));
    app.options("*", cors(corsOptions)); // Important for preflight support

    // 🚨 Remove this line: app.use(cors()); ❌❌
    // it nullifies your corsOptions config if placed before!

    app.use(express.json());

    // Register routers AFTER cors setup
    try {
      app.use("/kyc", getKycRouter(config));
      console.log("✅ KycRouter mounted");

      app.use("/auth", getAuthRouter(config));
      console.log("✅ AuthRouter mounted");

      app.use("/taxes", getTaxesRouter(config));
      console.log("✅ TaxesRouter mounted");

      app.use("/loans", getLoansRouter(config));
      console.log("✅ LoansRouter mounted");

      app.use("/risks", getRisksRouter(config));
      console.log("✅ RisksRouter mounted");

      app.use("/farmers", getFarmersRouter(config));
      console.log("✅ FarmersRouter mounted");

      app.use("/payments", getPaymentsRouter(config));
      console.log("✅ PaymentsRouter mounted");

      app.use("/directors", getDirectorsRouter(config));
      console.log("✅ DirectorsRouter mounted");

      app.use("/logistics", getLogisticsRouter(config));
      console.log("✅ LogisticsRouter mounted");

      app.use("/financials", getFinancialsRouter(config));
      console.log("✅ FinancialsRouter mounted");

      app.use("/businesses", getBusinessesRouter(config));
      console.log("✅ BusinessesRouter mounted");

      app.use("/declarations", getDeclarationsRouter(config));
      console.log("✅ DeclarationsRouter mounted");

      app.use("/farm-products", getFarmProductsRouter(config));
      console.log("✅ FarmProductsRouter mounted");

      app.use("/loan-repayments", getLoanRepaymentsRouter(config));
      console.log("✅ LoanRepaymentsRouter mounted");

      app.use("/api/groups", getGroupsRouter(config));
      console.log("✅ GroupsRouter mounted");

      app.use("/api/groups-types", getGroupTypesRouter(config));
      console.log("✅ GroupTypesRouter mounted");

      app.options("*", cors(corsOptions));
    } catch (err) {
      console.error("❌ Router registration failed:", err);
      if (err instanceof Error) {
        res.status(500).json(
          {error: "Router init failed", details: err.message});
      } else {
        res.status(500).json(
          {error: "Router init failed", details: "Unknown error"});
      }
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await new Promise<void>(
      (resolve) => (app as any)(req, res, () => resolve())
    );
  }
);
