import {onRequest} from "firebase-functions/v2/https";
import {defineSecret} from "firebase-functions/params";
import {bootstrapDatabase} from "./utils/bootstrap";
import {getGroupTypesRouter} from "./api/group_types";
import cors from "cors";
import express from "express";

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
    app.use("/api/groups/types", getGroupTypesRouter(config));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await new Promise<void>(
      (resolve) => (app as any)(req, res, () => resolve())
    );
  }
);
