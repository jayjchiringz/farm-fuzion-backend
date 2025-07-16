/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
import {onRequest} from "firebase-functions/v2/https";
import {defineSecret} from "firebase-functions/params";
import express from "express";
import cors from "cors";
import os from "os";
import path from "path";
import {storage} from "./utils/firebase";
import {initDbPool} from "./utils/db";
import multer from "multer";

// 🔐 Secrets
export const PGUSER = defineSecret("PGUSER");
export const PGPASS = defineSecret("PGPASS");
export const PGHOST = defineSecret("PGHOST");
export const PGDB = defineSecret("PGDB");
export const PGPORT = defineSecret("PGPORT");
export const MAIL_USER = defineSecret("MAIL_USER");
export const MAIL_PASS = defineSecret("MAIL_PASS");

// 🚀 App setup
const app = express();
app.use(cors({origin: true}));

// 🔒 Prevent Firebase Gen2 auto-body-parser conflict
app.use((req, res, next) => {
  if (req.headers["content-type"]?.startsWith("multipart/form-data")) {
    next(); // allow multer to handle
  } else {
    express.json()(req, res, next); // default parser
  }
});

const upload = multer({dest: os.tmpdir()}); // temp file upload directory

// ✅ Clean single-handler form upload (no body stream duplication!)
app.post("/", upload.any(), async (req, res) => {
  try {
    console.log("📦 Incoming request...");
    console.log("🔍 Headers:", req.headers);
    console.log("✅ Body:", req.body);
    console.log("✅ Files:", req.files);

    const fields = req.body;
    const files = req.files as Express.Multer.File[];

    const requiredFields = ["name", "group_type_id", "location", "registration_number", "requirements"];
    const missing = requiredFields.filter((f) => !fields[f]);
    if (missing.length) {
      return res.status(400).json({error: `Missing fields: ${missing.join(", ")}`});
    }

    const requirements = JSON.parse(fields.requirements);

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
      [
        fields.name,
        fields.group_type_id,
        fields.location,
        fields.description || null,
        fields.registration_number,
      ]
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

      const uploadedFile = files.find((f) => f.fieldname === `documents[${doc.doc_type}]`);

      if (doc.is_required && uploadedFile) {
        const bucket = storage.bucket();
        const destination = `groups/${groupId}/${doc.doc_type}-${Date.now()}${path.extname(uploadedFile.originalname)}`;

        await bucket.upload(uploadedFile.path, {
          destination,
          metadata: {
            contentType: uploadedFile.mimetype,
            metadata: {
              firebaseStorageDownloadTokens: groupId,
            },
          },
        });

        await client.query(
          `INSERT INTO group_documents (group_id, doc_type, file_path)
           VALUES ($1, $2, $3)`,
          [groupId, doc.doc_type.trim(), destination]
        );
      }
    }

    await client.query("COMMIT");
    client.release();

    return res.status(201).json({id: groupId, message: "Group registered with documents."});
  } catch (err: any) {
    console.error("❌ registerWithDocs handler error:", err);
    return res.status(500).json({error: "Internal server error", details: err.message});
  }
});

app.use((err: any, req: express.Request, res: express.Response) => {
  console.error("🔥 Global error handler:", err);
  res.status(500).json({error: "Unhandled middleware error", details: err.message});
});

export const registerWithDocs = onRequest(
  {
    secrets: [PGUSER, PGPASS, PGHOST, PGDB, PGPORT, MAIL_USER, MAIL_PASS],
    timeoutSeconds: 300,
    memory: "1GiB",
  },
  app
);
