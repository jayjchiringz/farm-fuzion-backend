/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
import {onRequest} from "firebase-functions/v2/https";
import {defineSecret} from "firebase-functions/params";
import express from "express";
import {initDbPool} from "../utils/db";

const PGUSER = defineSecret("PGUSER");
const PGPASS = defineSecret("PGPASS");
const PGHOST = defineSecret("PGHOST");
const PGDB = defineSecret("PGDB");
const PGPORT = defineSecret("PGPORT");

const app = express();
app.use(express.json());

// ✅ Handle CORS preflight for all paths
app.options("*", (req, res) => {
  res.set("Access-Control-Allow-Origin", "https://farm-fuzion-abdf3.web.app");
  res.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type");
  res.set("Access-Control-Allow-Credentials", "true");
  res.set("Access-Control-Max-Age", "3600");
  return res.status(204).send("");
});

// ✅ GET route with proper CORS headers
app.get("/", async (req, res) => {
  res.set("Access-Control-Allow-Origin", "https://farm-fuzion-abdf3.web.app");
  res.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type");
  res.set("Access-Control-Allow-Credentials", "true");

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

export const getRoles = onRequest(
  {
    secrets: [PGUSER, PGPASS, PGHOST, PGDB, PGPORT],
    timeoutSeconds: 60,
    memory: "512MiB",
  },
  app
);
