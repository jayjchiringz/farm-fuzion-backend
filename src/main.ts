/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
import express from "express";
import cors from "cors";
import {bootstrapDatabase} from "./utils/bootstrap";

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

const allowedOrigins = ["https://farm-fuzion-abdf3.web.app"];

// 💡 FIXED: Use `typeof PGUSER` etc. from caller scope
export const createMainApp = (secrets: {
  PGUSER: any;
  PGPASS: any;
  PGHOST: any;
  PGDB: any;
  PGPORT: any;
  MAIL_USER: any;
  MAIL_PASS: any;
}) => {
  const app = express();

  app.use(cors({
    origin: allowedOrigins,
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  }));

  app.use((req, res, next) => {
    if (req.is("application/json")) {
      express.json()(req, res, next);
    } else {
      next();
    }
  });

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

  bootstrapDatabase(config, FORCE_BOOTSTRAP).then(() =>
    console.log("✅ DB Bootstrap complete.")
  );

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

  return app;
};
