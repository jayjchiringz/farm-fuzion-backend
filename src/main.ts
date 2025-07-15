/* eslint-disable @typescript-eslint/no-non-null-assertion */

import express from "express";
import cors from "cors";
import multer from "multer";
import os from "os";
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

export const createMainApp = () => {
  const app = express();

  // ✅ Middleware
  app.use(cors({
    origin: allowedOrigins,
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  }));

  app.use(express.json());

  app.use(multer({
    storage: multer.diskStorage({
      destination: (_, __, cb) => cb(null, os.tmpdir()),
      filename: (_, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
    }),
    limits: {fileSize: 10 * 1024 * 1024},
  }).any());

  const config = {
    PGUSER: process.env.PGUSER!,
    PGPASS: process.env.PGPASS!,
    PGHOST: process.env.PGHOST!,
    PGDB: process.env.PGDB!,
    PGPORT: process.env.PGPORT!,
    MAIL_USER: process.env.MAIL_USER!,
    MAIL_PASS: process.env.MAIL_PASS!,
  };

  const FORCE_BOOTSTRAP = process.env.FORCE_BOOTSTRAP?.toLowerCase() === "true";

  bootstrapDatabase(config, FORCE_BOOTSTRAP).then(() =>
    console.log("✅ DB Bootstrap complete.")
  );

  // ✅ Routes
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
