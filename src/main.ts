/* eslint-disable max-len */
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
import {getRolesRouter} from "./api/roles";

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
  try {
    console.log("🟡 Initializing app...");
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

    // ✅ Instead — extract inside bootstrapDatabase at runtime
    app.use(async (req, res, next) => {
      try {
        const config = {
          PGUSER: secrets.PGUSER?.value?.(),
          PGPASS: secrets.PGPASS?.value?.(),
          PGHOST: secrets.PGHOST?.value?.(),
          PGDB: secrets.PGDB?.value?.(),
          PGPORT: secrets.PGPORT?.value?.(),
          MAIL_USER: secrets.MAIL_USER?.value?.(),
          MAIL_PASS: secrets.MAIL_PASS?.value?.(),
        };
        console.log("🔵 DB Config: ", config);

        const FORCE_BOOTSTRAP = process.env.FORCE_BOOTSTRAP?.toLowerCase() === "true";
        await bootstrapDatabase(config, FORCE_BOOTSTRAP);

        // ✅ Attach config to req so other routers can use it
        (req as any).dbConfig = config;
        next();
      } catch (err) {
        console.error("❌ Bootstrap error:", err);
        res.status(500).json({error: "Bootstrap failed"});
      }
    });

    app.get("/health", (_, res) => {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.status(200).json({status: "ok", timestamp: Date.now()});
    });

    app.use("/roles", (req, res, next) => {
      try {
        return getRolesRouter((req as any).dbConfig)(req, res, next);
      } catch (err) {
        console.error("❌ Roles router mount failed:", err);
        return res.status(500).json({error: "Roles mount failed"});
      }
    });
    app.use("/groups", (req, res, next) => {
      try {
        return getGroupsRouter((req as any).dbConfig)(req, res, next);
      } catch (err) {
        console.error("❌ Groups router mount failed:", err);
        return res.status(500).json({error: "Groups mount failed"});
      }
    });
    app.use("/auth", (req, res, next) => {
      try {
        return getAuthRouter((req as any).dbConfig)(req, res, next);
      } catch (err) {
        console.error("❌ Auth router mount failed:", err);
        return res.status(500).json({error: "Auth mount failed"});
      }
    });
    app.use("/taxes", (req, res, next) => {
      try {
        return getTaxesRouter((req as any).dbConfig)(req, res, next);
      } catch (err) {
        console.error("❌ Taxes router mount failed:", err);
        return res.status(500).json({error: "Taxes mount failed"});
      }
    });
    app.use("/loans", (req, res, next) => {
      try {
        return getLoansRouter((req as any).dbConfig)(req, res, next);
      } catch (err) {
        console.error("❌ Loans router mount failed:", err);
        return res.status(500).json({error: "Loans mount failed"});
      }
    });
    app.use("/risks", (req, res, next) => {
      try {
        return getRisksRouter((req as any).dbConfig)(req, res, next);
      } catch (err) {
        console.error("❌ Risks router mount failed:", err);
        return res.status(500).json({error: "Risks mount failed"});
      }
    });
    app.use("/farmers", (req, res, next) => {
      try {
        return getFarmersRouter((req as any).dbConfig)(req, res, next);
      } catch (err) {
        console.error("❌ Farmers router mount failed:", err);
        return res.status(500).json({error: "Farmers mount failed"});
      }
    });
    app.use("/payments", (req, res, next) => {
      try {
        return getPaymentsRouter((req as any).dbConfig)(req, res, next);
      } catch (err) {
        console.error("❌ Payments router mount failed:", err);
        return res.status(500).json({error: "Payments mount failed"});
      }
    });
    app.use("/directors", (req, res, next) => {
      try {
        return getDirectorsRouter((req as any).dbConfig)(req, res, next);
      } catch (err) {
        console.error("❌ Directors router mount failed:", err);
        return res.status(500).json({error: "Directors mount failed"});
      }
    });
    app.use("/logistics", (req, res, next) => {
      try {
        return getLogisticsRouter((req as any).dbConfig)(req, res, next);
      } catch (err) {
        console.error("❌ Logistics router mount failed:", err);
        return res.status(500).json({error: "Logistics mount failed"});
      }
    });
    app.use("/financials", (req, res, next) => {
      try {
        return getFinancialsRouter((req as any).dbConfig)(req, res, next);
      } catch (err) {
        console.error("❌ Financials router mount failed:", err);
        return res.status(500).json({error: "Financials mount failed"});
      }
    });
    app.use("/businesses", (req, res, next) => {
      try {
        return getBusinessesRouter((req as any).dbConfig)(req, res, next);
      } catch (err) {
        console.error("❌ Businesses router mount failed:", err);
        return res.status(500).json({error: "Businesses mount failed"});
      }
    });
    app.use("/declarations", (req, res, next) => {
      try {
        return getDeclarationsRouter((req as any).dbConfig)(req, res, next);
      } catch (err) {
        console.error("❌ Declarations router mount failed:", err);
        return res.status(500).json({error: "Declarations mount failed"});
      }
    });
    app.use("/farm-products", (req, res, next) => {
      try {
        return getFarmProductsRouter((req as any).dbConfig)(req, res, next);
      } catch (err) {
        console.error("❌ Farm Products router mount failed:", err);
        return res.status(500).json({error: "Farm Products mount failed"});
      }
    });
    app.use("/loan-repayments", (req, res, next) => {
      try {
        return getLoanRepaymentsRouter((req as any).dbConfig)(req, res, next);
      } catch (err) {
        console.error("❌ Loan Repayments router mount failed:", err);
        return res.status(500).json({error: "Loan Repayments mount failed"});
      }
    });
    app.use("/groups-types", (req, res, next) => {
      try {
        return getGroupTypesRouter((req as any).dbConfig)(req, res, next);
      } catch (err) {
        console.error("❌ Group Types router mount failed:", err);
        return res.status(500).json({error: "Group Types mount failed"});
      }
    });
    app.use("/document-types", (req, res, next) => {
      try {
        return getDocumentTypesRouter((req as any).dbConfig)(req, res, next);
      } catch (err) {
        console.error("❌ Document Types router mount failed:", err);
        return res.status(500).json({error: "Document Types mount failed"});
      }
    });

    /*
    app.use("/groups", (req, res, next) => getGroupsRouter((req as any).dbConfig)(req, res, next));
    app.use("/auth", (req, res, next) => getAuthRouter((req as any).dbConfig)(req, res, next));
    app.use("/taxes", (req, res, next) => getTaxesRouter((req as any).dbConfig)(req, res, next));
    app.use("/loans", (req, res, next) => getLoansRouter((req as any).dbConfig)(req, res, next));
    app.use("/roles", (req, res, next) =>getRolesRouter((req as any).dbConfig)(req, res, next));
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
    */

    return app;
  } catch (err) {
    console.error("❌ Error creating main app:", err);
    throw new Error("Failed to create main app");
  }
};
