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
app.use(cors({origin: true}));
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

    await pool.query(
      `INSERT INTO user_roles (name, description) 
       VALUES ($1, $2) 
       ON CONFLICT (name) DO NOTHING`,
      [name, description ?? null]
    );

    return res.status(201).json({message: "Role created."}); // ✅ RETURN added
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
  },
  app
);
