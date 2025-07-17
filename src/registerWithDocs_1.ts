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
import Busboy from "busboy";
import {finished} from "stream/promises";
import getRawBody from "raw-body";

// 🔐 Secrets
export const PGUSER = defineSecret("PGUSER");
export const PGPASS = defineSecret("PGPASS");
export const PGHOST = defineSecret("PGHOST");
export const PGDB = defineSecret("PGDB");
export const PGPORT = defineSecret("PGPORT");
export const MAIL_USER = defineSecret("MAIL_USER");
export const MAIL_PASS = defineSecret("MAIL_PASS");

const app = express();
app.use(cors({origin: true}));

app.post("/", async (req: Request, res: Response) => {
  const fields: Record<string, unknown> = {};
  const files: {
    fieldname: string;
    path: string;
    originalname: string;
    mimetype: string;
  }[] = [];

  try {
    console.log("🛰️ Incoming request headers:", req.headers);

    const bodyBuffer = await getRawBody(req, {
      length: req.headers["content-length"],
      limit: "10mb",
      encoding: null, // Return Buffer
    });

    await new Promise<void>((resolve, reject) => {
      const busboy = Busboy({
        headers: req.headers,
      });
      const fileWrites: Promise<void>[] = [];

      busboy.on("field", (name: string, val: string) => {
        console.log(`📩 Received field: ${name} =`, val);
        fields[name] = val;
      });

      busboy.on("file", (fieldname, file, info) => {
        console.log(`
          📦 Received file: ${fieldname} → ${info.filename} (${info.mimeType})`
        );
        // eslint-disable-next-line max-len
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
          reject(err);
        }
      });

      busboy.on("error", (err) => {
        console.error("❌ Busboy error:", err);
        reject(err);
      });

      busboy.end(bodyBuffer); // 👈 Manual stream end
    });

    const required = [
      "name", "group_type_id", "location",
      "registration_number", "requirements",
    ];
    const missing = required.filter((f) => !fields[f]);
    if (missing.length) {
      return res.status(400).json(
        {error: `Missing fields: ${missing.join(", ")}`}
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let requirements: any[] = [];
    try {
      requirements = typeof fields.requirements === "string" ?
        JSON.parse(fields.requirements) :
        fields.requirements;

      if (!Array.isArray(requirements)) {
        throw new Error("Parsed 'requirements' is not an array");
      }
    } catch (err) {
      console.error("❌ Failed to parse requirements:", fields.requirements);
      throw new Error("Invalid JSON in 'requirements' field");
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

      // eslint-disable-next-line max-len
      const sanitizeKey = (key: string) => key.toLowerCase().replace(/[^a-z0-9]/gi, "_");
      const uploadedFile = files.find(
        (f) => f.fieldname === `documents[${sanitizeKey(doc.doc_type)}]`
      );
      if (doc.is_required && uploadedFile) {
        const bucket = storage.bucket();
        // eslint-disable-next-line max-len
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

    return res.status(201).json(
      {id: groupId, message: "Group registered with documents.",
      });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (err: any) {
    console.error("❌ registerWithDocs error:", err);
    return res.status(500).json({
      error: "Internal server error",
      details: err.message || err.toString(),
    });
  }
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
