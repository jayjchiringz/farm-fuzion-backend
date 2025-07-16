/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
import {onRequest} from "firebase-functions/v2/https";
import {defineSecret} from "firebase-functions/params";
import express from "express";
import cors from "cors";
import multer from "multer";
import os from "os";
import path from "path";
import {storage} from "./utils/firebase";
import {initDbPool} from "./utils/db";

// 🔐 Secrets
export const PGUSER = defineSecret("PGUSER");
export const PGPASS = defineSecret("PGPASS");
export const PGHOST = defineSecret("PGHOST");
export const PGDB = defineSecret("PGDB");
export const PGPORT = defineSecret("PGPORT");
export const MAIL_USER = defineSecret("MAIL_USER");
export const MAIL_PASS = defineSecret("MAIL_PASS");

// 🧠 Multer setup
const upload = multer({
  storage: multer.diskStorage({
    destination: (_, __, cb) => cb(null, os.tmpdir()),
    filename: (_, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
  }),
  limits: {fileSize: 10 * 1024 * 1024}, // 10MB
});

// 🚀 App setup
const app = express();
app.use(cors({origin: true}));

// 🚫 NO express.json() or express.urlencoded() before multer!

app.post("/", (req, res) => {
  upload.any()(req, res, async (err: any) => {
    if (err) {
      console.error("❌ Multer error:", err);
      return res.status(400).json({error: "File upload error"});
    }

    const fields = req.body;
    const files = req.files as Express.Multer.File[];

    console.log("📥 Received fields:", fields);
    console.log("📎 Received files:", files.map((f) => ({
      fieldname: f.fieldname,
      originalname: f.originalname,
      size: f.size,
      mimetype: f.mimetype,
    })));

    try {
      const requiredFields = [
        "name",
        "group_type_id",
        "location",
        "registration_number",
        "requirements",
      ];
      const missing = requiredFields.filter((key) => !fields[key]);
      if (missing.length > 0) {
        return res.status(400).json({
          error: `Missing fields: ${missing.join(", ")}`,
        });
      }

      const requirements = JSON.parse(fields.requirements);
      const uploads = new Map(
        files.map((f) => [
          f.fieldname.replace("documents[", "").replace("]", ""),
          f.path,
        ])
      );

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
          registration_number, status)
        VALUES ($1, $2, $3, $4, $5, 'pending')
        RETURNING id`,
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
            group_id, doc_type, is_required)
          VALUES ($1, $2, $3)
          ON CONFLICT (group_id, doc_type)
          DO UPDATE SET is_required = EXCLUDED.is_required`,
          [groupId, doc.doc_type, doc.is_required]
        );

        if (doc.is_required && uploads.has(doc.doc_type)) {
          const filePath = uploads.get(doc.doc_type);
          if (!filePath) continue;

          const bucket = storage.bucket();
          const destination = `groups/${groupId}/${doc.doc_type}-${Date.now()}${path.extname(filePath)}`;

          await bucket.upload(filePath, {
            destination,
            metadata: {
              contentType: "application/octet-stream",
              metadata: {
                firebaseStorageDownloadTokens: groupId,
              },
            },
          });

          await client.query(
            `INSERT INTO group_documents (group_id, doc_type, file_path)
            VALUES ($1, $2, $3)`,
            [groupId, doc.doc_type, destination]
          );
        }
      }

      await client.query("COMMIT");
      client.release();

      return res.status(201).json({
        id: groupId,
        message: "Group registered with documents.",
      });
    } catch (err) {
      console.error("❌ registerWithDocs error:", err);
      return res.status(500).json({error: "Failed to register group"});
    }
  });
});

// ✅ Export function
export const registerWithDocs = onRequest(
  {
    secrets: [PGUSER, PGPASS, PGHOST, PGDB, PGPORT, MAIL_USER, MAIL_PASS],
    timeoutSeconds: 300,
  },
  app
);
