// functions/src/index.ts
import {onRequest} from "firebase-functions/v2/https";
import {defineSecret} from "firebase-functions/params";
import {bootstrapDatabase} from "./utils/bootstrap";

// 🔐 Secrets
const PGUSER = defineSecret("PGUSER");
const PGPASS = defineSecret("PGPASS");
const PGHOST = defineSecret("PGHOST");
const PGDB = defineSecret("PGDB");
const PGPORT = defineSecret("PGPORT");
const MAIL_USER = defineSecret("MAIL_USER");
const MAIL_PASS = defineSecret("MAIL_PASS");

import cors from "cors";
import express from "express";

// 🧩 Dynamic Router Factories
import {getAuthRouter} from "./api/auth";
import {getTaxesRouter} from "./api/taxes";
import {getRisksRouter} from "./api/risks";
import {getFarmersRouter} from "./api/farmers";
import {getPaymentsRouter} from "./api/payments";
import {getLogisticsRouter} from "./api/logistics";
import {getFinancialsRouter} from "./api/financials";
import {getBusinessesRouter} from "./api/businesses";
import {getDeclarationsRouter} from "./api/declarations";
import {getFarmProductsRouter} from "./api/farm_products";
import {getDirectorsRouter} from "./api/directors";

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
      PGDB: PGDB.value(),
      PGPORT: PGPORT.value(),
      MAIL_USER: MAIL_USER.value(),
      MAIL_PASS: MAIL_PASS.value(),
    };

    // ✅ Bootstrap DB structure
    await bootstrapDatabase(config);

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
    app.use("/logistics", getLogisticsRouter(config));
    app.use("/financials", getFinancialsRouter(config));
    app.use("/businesses", getBusinessesRouter(config));
    app.use("/declarations", getDeclarationsRouter(config));
    app.use("/farm-products", getFarmProductsRouter(config));
    app.use("/directors", getDirectorsRouter(config));

    return app(req, res); // ✅ TS: ExpressHandler compatible
  }
);
