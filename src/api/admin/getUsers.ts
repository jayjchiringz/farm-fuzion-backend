/* eslint-disable max-len */
/* eslint-disable camelcase */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
import {onRequest} from "firebase-functions/v2/https";
import {defineSecret} from "firebase-functions/params";
import express from "express";
import cors from "cors";
import {initDbPool} from "../../utils/db";

const PGUSER = defineSecret("PGUSER");
const PGPASS = defineSecret("PGPASS");
const PGHOST = defineSecret("PGHOST");
const PGDB = defineSecret("PGDB");
const PGPORT = defineSecret("PGPORT");

const app = express();
app.use(cors({origin: true}));
app.use(express.json());

app.get("/", async (req, res) => {
  try {
    const {page = 1, limit = 10, search = "", role_id} = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    const pool = initDbPool({
      PGUSER: process.env.PGUSER!,
      PGPASS: process.env.PGPASS!,
      PGHOST: process.env.PGHOST!,
      PGDB: process.env.PGDB!,
      PGPORT: process.env.PGPORT!,
    });

    // Build query
    let query = `
      SELECT 
        u.id,
        u.email,
        u.first_name,
        u.last_name,
        u.phone,
        u.role_id,
        r.name as role_name,
        u.created_at,
        u.is_active
      FROM users u
      LEFT JOIN user_roles r ON u.role_id = r.id
      WHERE 1=1
    `;

    const queryParams: any[] = [];
    let paramCount = 0;

    if (search) {
      paramCount++;
      query += ` AND (
        u.email ILIKE $${paramCount} OR 
        u.first_name ILIKE $${paramCount} OR 
        u.last_name ILIKE $${paramCount} OR 
        u.phone ILIKE $${paramCount}
      )`;
      queryParams.push(`%${search}%`);
    }

    if (role_id) {
      paramCount++;
      query += ` AND u.role_id = $${paramCount}`;
      queryParams.push(role_id);
    }

    // Get total count
    const countQuery = query.replace(
      "SELECT \n        u.id,\n        u.email,\n        u.first_name,\n        u.last_name,\n        u.phone,\n        u.role_id,\n        r.name as role_name,\n        u.created_at,\n        u.is_active",
      "SELECT COUNT(*)"
    );
    const countResult = await pool.query(countQuery, queryParams);
    const total = parseInt(countResult.rows[0].count);

    // Add pagination
    paramCount++;
    query += ` ORDER BY u.created_at DESC LIMIT $${paramCount}`;
    queryParams.push(Number(limit));

    paramCount++;
    query += ` OFFSET $${paramCount}`;
    queryParams.push(offset);

    const result = await pool.query(query, queryParams);

    return res.status(200).json({
      users: result.rows,
      total,
      page: Number(page),
      limit: Number(limit),
      totalPages: Math.ceil(total / Number(limit)),
    });
  } catch (err: any) {
    console.error("❌ getUsers error:", err);
    return res.status(500).json({
      error: "Internal server error",
      details: err.message,
    });
  }
});

export const getUsers = onRequest(
  {
    secrets: [PGUSER, PGPASS, PGHOST, PGDB, PGPORT],
    timeoutSeconds: 60,
    memory: "512MiB",
  },
  app
);
