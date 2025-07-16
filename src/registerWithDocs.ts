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
import Busboy from "busboy";
import {v4 as uuidv4} from "uuid";
import fs from "fs";

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

// ✅ Enhanced POST route with multer + error safety
app.post("/", (req, res) => {
  const busboy = Busboy({headers: req.headers});
  const fields: Record<string, string> = {};
  const files: Record<string, string> = {};

  const tmpdir = os.tmpdir();
  const uploads: Promise<void>[] = [];

  busboy.on("file", (fieldname: string, file: NodeJS.ReadableStream, info) => {
    const {filename} = info;
    const tmpPath = path.join(tmpdir, `${uuidv4()}-${filename}`);
    files[fieldname] = tmpPath;

    const writeStream = fs.createWriteStream(tmpPath);
    file.pipe(writeStream);

    const uploadFinished = new Promise<void>((resolve, reject) => {
      file.on("end", resolve);
      file.on("error", reject);
    });

    uploads.push(uploadFinished);
  });

  busboy.on("field", (fieldname: string | number, val: string) => {
    fields[fieldname] = val;
  });

  busboy.on("error", (err: { message: any; }) => {
    console.error("❌ Busboy error:", err);
    res.status(400).json({error: "File upload error", details: err.message});
  });

  busboy.on("finish", async () => {
    try {
      await Promise.all(uploads);

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

        const tmpFilePath = files[`documents[${doc.doc_type}]`];
        if (doc.is_required && tmpFilePath) {
          const bucket = storage.bucket();
          const destination = `groups/${groupId}/${doc.doc_type}-${Date.now()}${path.extname(tmpFilePath)}`;
          await bucket.upload(tmpFilePath, {
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
            [groupId, doc.doc_type.trim(), destination]
          );
        }
      }

      await client.query("COMMIT");
      client.release();

      return res.status(201).json({id: groupId, message: "Group registered with documents."});
    } catch (err: any) {
      console.error("❌ registerWithDocs error:", err);
      return res.status(500).json({error: "Internal server error", details: err.message});
    }
  });

  req.pipe(busboy);
});

export const registerWithDocs = onRequest(
  {
    secrets: [PGUSER, PGPASS, PGHOST, PGDB, PGPORT, MAIL_USER, MAIL_PASS],
    timeoutSeconds: 300,
    memory: "1GiB",
  },
  app
);
