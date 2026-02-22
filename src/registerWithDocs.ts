/* eslint-disable camelcase */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
import {onRequest} from "firebase-functions/v2/https";
import {defineSecret} from "firebase-functions/params";
import express, {Request, Response} from "express";
import cors from "cors";
// import {storage} from "./utils/firebase";
import {initDbPool} from "./utils/db";

// 🔐 Secrets
export const PGUSER = defineSecret("PGUSER");
export const PGPASS = defineSecret("PGPASS");
export const PGHOST = defineSecret("PGHOST");
export const PGDB = defineSecret("PGDB");
export const PGPORT = defineSecret("PGPORT");
export const MAIL_USER = defineSecret("MAIL_USER");
export const MAIL_PASS = defineSecret("MAIL_PASS");
export const MSIMBO_MERCHANT_ID = defineSecret("MSIMBO_MERCHANT_ID");
export const MSIMBO_SECRET_KEY = defineSecret("MSIMBO_SECRET_KEY");
export const MSIMBO_PUBLIC_ID = defineSecret("MSIMBO_PUBLIC_ID");
export const SILICONFLOW_API_KEY = defineSecret("SILICONFLOW_API_KEY");

const app = express();
app.use(cors({origin: true}));
app.use(express.json({limit: "10mb"}));

app.post("/", async (req: Request, res: Response) => {
  try {
    const {
      name,
      group_type_id,
      location,
      registration_number,
      description,
      requirements,
    } = req.body;

    if (
      !name || !group_type_id || !location || !registration_number ||
        !Array.isArray(requirements)
    ) {
      return res.status(400).json({error: "Missing required fields."});
    }

    const pool = initDbPool({
      PGUSER: process.env.PGUSER!,
      PGPASS: process.env.PGPASS!,
      PGHOST: process.env.PGHOST!,
      PGDB: process.env.PGDB!,
      PGPORT: process.env.PGPORT!,
    });

    const client = await pool.connect();
    await client.query("BEGIN");

    const groupResult = await client.query(
      `INSERT INTO groups (
        name, group_type_id, location, description,
        registration_number, status
      ) VALUES ($1, $2, $3, $4, $5, 'pending') RETURNING id`,
      [name, group_type_id, location, description || null, registration_number]
    );

    const groupId = groupResult.rows[0].id;

    for (const doc of requirements) {
      await client.query(
        `INSERT INTO group_document_requirements (
          group_id, doc_type, is_required
        ) VALUES ($1, $2, $3)
        ON CONFLICT (group_id, doc_type)
        DO UPDATE SET is_required = EXCLUDED.is_required`,
        [groupId, doc.doc_type.trim(), doc.is_required]
      );

      if (doc.is_required && doc.file_path) {
        await client.query(
          `INSERT INTO group_documents (group_id, doc_type, file_path)
           VALUES ($1, $2, $3)`,
          [groupId, doc.doc_type.trim(), doc.file_path]
        );
      }
    }

    await client.query("COMMIT");
    client.release();

    return res.status(201).json({id: groupId, message: "Group registered."});
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (err: any) {
    console.error("❌ registerWithDocs error:", err);
    return res.status(500).json({
      error: "Internal server error",
      details: err.message || err.toString(),
    });
  }
});

// 🔁 Firebase Function export
export const registerWithDocs = onRequest(
  {
    secrets: [PGUSER, PGPASS, PGHOST, PGDB, PGPORT, MAIL_USER, MAIL_PASS,
      MSIMBO_MERCHANT_ID, MSIMBO_SECRET_KEY, MSIMBO_PUBLIC_ID],
    timeoutSeconds: 300,
    memory: "1GiB",
  },
  app
);
