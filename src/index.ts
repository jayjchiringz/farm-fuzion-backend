/* eslint-disable @typescript-eslint/no-unused-vars */
// functions/src/index.ts
import {onRequest} from "firebase-functions/v2/https";
import {defineSecret} from "firebase-functions/params";
import {bootstrapDatabase} from "./utils/bootstrap";
import {getGroupsRouter} from "./api/groups";

// 🔐 Secrets
const PGUSER = defineSecret("PGUSER");
const PGPASS = defineSecret("PGPASS");
const PGHOST = defineSecret("PGHOST");
const PGDB = defineSecret("PGDB");
const PGPORT = defineSecret("PGPORT");

const MAIL_USER = defineSecret("MAIL_USER");
const MAIL_PASS = defineSecret("MAIL_PASS");

const FORCE_BOOTSTRAP = process.env.FORCE_BOOTSTRAP?.toLowerCase() === "true";

import cors from "cors";
import express from "express";

// 🧩 Dynamic Router Factories
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
import {getDeclarationsRouter} from "./api/declarations";
import {getFarmProductsRouter} from "./api/farm_products";
import {getLoanRepaymentsRouter} from "./api/loan_repayments";
// Removed incorrect import and usage of firebase-admin app
// Inside api onRequest block:
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

    // ✅ Bootstrap DB structure
    await bootstrapDatabase(config, FORCE_BOOTSTRAP);

    // 🚀 Setup Express with routers
    const app = express();
    app.use(cors());
    app.use(express.json());

    // 🧠 Inject config-safe routers
    app.use("/auth", getAuthRouter(config));
    app.use("/taxes", getTaxesRouter(config));
    app.use("/risks", getRisksRouter(config));
    app.use("/farmers", getFarmersRouter(config));
    app.use("/payments", getPaymentsRouter(config));
    app.use("/directors", getDirectorsRouter(config));
    app.use("/logistics", getLogisticsRouter(config));
    app.use("/financials", getFinancialsRouter(config));
    app.use("/businesses", getBusinessesRouter(config));
    app.use("/declarations", getDeclarationsRouter(config));
    app.use("/farm-products", getFarmProductsRouter(config));

    app.use("/loans", getLoansRouter(config));
    app.use("/farm-products", getFarmProductsRouter(config));

    app.use("/loans", getLoansRouter(config));
    app.use("/loan-repayments", getLoanRepaymentsRouter(config));

    // Register /api/groups route
    app.use("/api/groups", getGroupsRouter(config));

    return app(req, res); // ✅ TS: ExpressHandler compatible
  }
);
