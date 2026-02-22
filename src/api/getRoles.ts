/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
import {onRequest} from "firebase-functions/v2/https";
import {defineSecret} from "firebase-functions/params";
import express from "express";
import cors from "cors";
import {initDbPool} from "../utils/db";

// 🔐 Secrets
const PGUSER = defineSecret("PGUSER");
const PGPASS = defineSecret("PGPASS");
const PGHOST = defineSecret("PGHOST");
const PGDB = defineSecret("PGDB");
const PGPORT = defineSecret("PGPORT");

const app = express();

// ✅ More specific CORS configuration
app.use(
  cors({
    origin: "https://farm-fuzion-abdf3.web.app",
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
    optionsSuccessStatus: 204,
  })
);

// ✅ Explicitly handle OPTIONS requests
app.options("*", (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "https://farm-fuzion-abdf3.web.app");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.status(204).send("");
});

app.use(express.json());

// ✅ GET route
app.get("/", async (req, res) => {
  // Set CORS headers explicitly for GET requests
  res.setHeader("Access-Control-Allow-Origin", "https://farm-fuzion-abdf3.web.app");
  res.setHeader("Access-Control-Allow-Credentials", "true");

  try {
    const pool = initDbPool({
      PGUSER: process.env.PGUSER!,
      PGPASS: process.env.PGPASS!,
      PGHOST: process.env.PGHOST!,
      PGDB: process.env.PGDB!,
      PGPORT: process.env.PGPORT!,
    });

    const result = await pool.query(`
      SELECT id, name, description
      FROM user_roles
      ORDER BY name ASC
    `);

    return res.status(200).json(result.rows);
  } catch (err: any) {
    console.error("❌ Error fetching roles:", err);
    return res.status(500).json({
      error: "Internal server error",
      details: err.message,
    });
  }
});

// 🚀 Export Firebase HTTPS function
export const getRoles = onRequest(
  {
    secrets: [PGUSER, PGPASS, PGHOST, PGDB, PGPORT],
    timeoutSeconds: 60,
    memory: "512MiB",
    cors: true, // Enable CORS at function level too
  },
  app
);
