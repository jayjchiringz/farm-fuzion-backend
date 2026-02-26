// FarmFuzion_Firebase_MVP_Starter\functions\src\api\createRole.ts
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
import {onRequest} from "firebase-functions/v2/https";
import {defineSecret} from "firebase-functions/params";
import express from "express";
import cors from "cors";
import {initDbPool} from "../utils/db";

const PGUSER = defineSecret("PGUSER");
const PGPASS = defineSecret("PGPASS");
const PGHOST = defineSecret("PGHOST");
const PGDB = defineSecret("PGDB");
const PGPORT = defineSecret("PGPORT");

const app = express();

// ✅ FIXED: Proper CORS configuration
app.use(cors({
  origin: "https://farm-fuzion-abdf3.web.app",
  methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
  optionsSuccessStatus: 204,
}));

// Handle preflight requests
app.options("*", cors());

app.use(express.json());

app.post("/", async (req, res) => {
  try {
    const {name, description} = req.body;

    if (!name) {
      return res.status(400).json({error: "Role name is required."});
    }

    const pool = initDbPool({
      PGUSER: process.env.PGUSER!,
      PGPASS: process.env.PGPASS!,
      PGHOST: process.env.PGHOST!,
      PGDB: process.env.PGDB!,
      PGPORT: process.env.PGPORT!,
    });

    const result = await pool.query(
      `INSERT INTO user_roles (name, description) 
       VALUES ($1, $2) 
       ON CONFLICT (name) DO NOTHING
       RETURNING *`,
      [name, description ?? null]
    );

    if (result.rows.length === 0) {
      return res.status(409).json({error: "Role already exists."});
    }

    return res.status(201).json({
      message: "Role created.",
      role: result.rows[0],
    });
  } catch (err: any) {
    console.error("❌ createRole error:", err);
    return res.status(500).json(
      {error: "Internal server error", details: err.message}
    );
  }
});

export const createRole = onRequest(
  {
    secrets: [PGUSER, PGPASS, PGHOST, PGDB, PGPORT],
    timeoutSeconds: 60,
    memory: "512MiB",
    invoker: "public", // ✅ Add this to allow public access
    cors: true, // ✅ Enable CORS at function level too
  },
  app
);
