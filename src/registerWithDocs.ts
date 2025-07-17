/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
import {onRequest} from "firebase-functions/v2/https";
import {defineSecret} from "firebase-functions/params";
import express, {Request, Response} from "express";
import cors from "cors";
import {storage} from "./utils/firebase";
import {initDbPool} from "./utils/db";
import path from "path";
import fs from "fs";
import os from "os";
import * as Busboy from "busboy";
import {finished} from "stream/promises";

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

app.post("/", async (req: Request, res: Response) => {
  const fields: Record<string, any> = {};
  const files: {
    fieldname: string;
    path: string;
    originalname: string;
    mimetype: string;
  }[] = [];

  try {
    console.log("🛰️ Incoming request headers:", req.headers);

    await new Promise<void>((resolve, reject) => {
      const busboy = Busboy.default({headers: req.headers});
      const fileWrites: Promise<void>[] = [];

      busboy.on("field", (name: string, val: string) => {
        console.log(`📩 Received field: ${name} =`, val);
        fields[name] = val;
      });

      busboy.on("file", (fieldname: string, file: NodeJS.ReadableStream, info: { filename: string; mimeType: string }) => {
        console.log(`📦 Received file: ${fieldname} → ${info.filename} (${info.mimeType})`);
        const tmpPath = path.join(os.tmpdir(), `${Date.now()}-${info.filename}`);
        const writeStream = fs.createWriteStream(tmpPath);
        file.pipe(writeStream);

        const writeFinished = finished(writeStream).then(() => {
          files.push({
            fieldname,
            path: tmpPath,
            originalname: info.filename,
            mimetype: info.mimeType,
          });
        });

        fileWrites.push(writeFinished);
      });

      busboy.on("finish", async () => {
        console.log("✅ Busboy finished parsing.");
        try {
          await Promise.all(fileWrites);
          resolve();
        } catch (err) {
          console.error("❌ File write error:", err);
          reject(err);
        }
      });

      busboy.on("error", (err: any) => {
        console.error("❌ Busboy error:", err);
        reject(err);
      });

      req.pipe(busboy);
    });

    const required = ["name", "group_type_id", "location", "registration_number", "requirements"];
    const missing = required.filter((f) => !fields[f]);
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

      const sanitizeKey = (key: string) => key.toLowerCase().replace(/[^a-z0-9]/gi, "_");
      const uploadedFile = files.find((f) => f.fieldname === `documents[${sanitizeKey(doc.doc_type)}]`);
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
    console.error("❌ registerWithDocs error:", err);
    return res.status(500).json({
      error: "Internal server error",
      details: err.message || err.toString(),
    });
  }
});


// 🧯 Global error fallback
app.use((err: any, req: Request, res: Response) => {
  console.error("🔥 Global middleware error:", err);
  res.status(500).json({error: "Unhandled middleware error", details: err.message});
});

// 🧪 Firebase export
export const registerWithDocs = onRequest(
  {
    secrets: [PGUSER, PGPASS, PGHOST, PGDB, PGPORT, MAIL_USER, MAIL_PASS],
    timeoutSeconds: 300,
    memory: "1GiB",
  },
  app
);
