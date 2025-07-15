/* eslint-disable camelcase */
import express from "express";
import {initDbPool} from "../utils/db";
import multer from "multer";
import os from "os";
import {storage} from "../utils/firebase"; // ⬅️ add at the top of file
import path from "path";
import cors from "cors";

interface DocumentRequirement {
  doc_type: string;
  is_required: boolean;
}

export const getGroupsRouter = (config: {
  PGUSER: string;
  PGPASS: string;
  PGHOST: string;
  PGDB: string;
  PGPORT: string;
}) => {
  const pool = initDbPool(config);
  const router = express.Router();

  // 📦 GET all groups (excluding inactive optionally)
  router.get("/", async (_, res) => {
    try {
      const result = await pool.query(
        `SELECT 
          g.id, 
          g.name, 
          gt.name AS type, 
          g.location, 
          g.status, 
          g.remarks,
          g.registration_number, 
          json_agg(
            json_build_object('doc_type', d.doc_type, 'file_path', d.file_path)
          ) AS documents
        FROM groups g
        LEFT JOIN group_types gt ON g.group_type_id = gt.id
        LEFT JOIN group_documents d ON d.group_id = g.id
        GROUP BY g.id, gt.name
        ORDER BY g.name ASC`
      );
      res.json(result.rows);
    } catch (err) {
      console.error("❌ Failed to fetch groups:", err);
      res.status(500).json({error: "Failed to load groups"});
    }
  });

  // 👥 GET farmers by group ID
  router.get("/:groupId/farmers", async (req, res) => {
    const {groupId} = req.params;

    try {
      const result = await pool.query(
        `SELECT 
            f.*, 
            g.name AS group_name 
         FROM farmers f
         LEFT JOIN groups g ON f.group_id = g.id
         WHERE f.group_id = $1
         ORDER BY f.last_name ASC`,
        [groupId]
      );
      res.json(result.rows);
    } catch (err) {
      console.error("❌ Failed to fetch group farmers:", err);
      res.status(500).json({error: "Failed to load farmers in group"});
    }
  });

  // 📝 POST: Register new group
  router.post("/register", async (req, res) => {
    const {name, group_type_id, location, description, registration_number,
    } = req.body;

    if (!name || !group_type_id || !location || !registration_number) {
      res.status(400).json({
        error: `Name, group_type_id, location,
          and registration_number are required.`,
      });
      return;
    }

    try {
      const result = await pool.query(
        `INSERT INTO groups
      (name, group_type_id, location, description, registration_number, status)
        VALUES ($1, $2, $3, $4, $5, 'pending')
        RETURNING id`,
        [name, group_type_id, location, description ||
        null, registration_number]
      );

      res.status(201).json({
        id: result.rows[0].id,
        message: "Group registration submitted for approval.",
      });
    } catch (err) {
      console.error("❌ Failed to register group:", err);
      res.status(500).json({error: "Internal server error"});
    }
  });

  // ✅ PATCH: Approve group
  router.patch("/:groupId/approve", async (req, res) => {
    const {groupId} = req.params;

    try {
      await pool.query(
        `UPDATE groups 
         SET status = 'active', remarks = NULL 
         WHERE id = $1`,
        [groupId]
      );
      res.status(200).json({message: "SACCO approved successfully."});
    } catch (err) {
      console.error("❌ Approval error:", err);
      res.status(500).json({error: "Server error"});
    }
  });

  // ❌ PATCH: Reject group
  router.patch("/:groupId/reject", async (req, res) => {
    const {groupId} = req.params;
    const {remarks, revertToPending} = req.body;

    const status = revertToPending ? "pending" : "inactive";

    try {
      await pool.query(
        `UPDATE groups 
         SET status = $1, remarks = $2 
         WHERE id = $3`,
        [status, remarks || null, groupId]
      );
      res.status(200).json({message: `SACCO status updated to ${status}`});
    } catch (err) {
      console.error("❌ Rejection error:", err);
      res.status(500).json({error: "Server error"});
    }
  });

  // 🚑 FIXED route — simplified structure
  router.post("/:groupId/requirements", (req, res) => {
    (async () => {
      const {groupId} = req.params;
      const raw = req.body as { requirements: DocumentRequirement[] };

      if (!Array.isArray(raw.requirements)) {
        return res.status(400).json({error: "Invalid format"});
      }

      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        await client.query(
          "DELETE FROM group_document_requirements WHERE group_id = $1",
          [groupId]
        );

        for (const item of raw.requirements) {
          await client.query(
            `INSERT INTO group_document_requirements (
              group_id, doc_type, is_required)
             VALUES ($1, $2, $3)
             ON CONFLICT (group_id, doc_type)
             DO UPDATE SET is_required = EXCLUDED.is_required`,
            [groupId, item.doc_type, item.is_required]
          );
        }

        await client.query("COMMIT");
        return res.status(200).json({message: "Document requirements updated"});
      } catch (err) {
        await client.query("ROLLBACK");
        console.error("❌ Error saving document requirements:", err);
        return res.status(500).json({error: "Internal server error"});
      } finally {
        client.release();
      }
    })().catch((err) => {
      console.error("❌ Unexpected error:", err);
      return res.status(500).json({error: "Unexpected failure"});
    });
  });

  // ✅ GET: Active group types for dropdowns
  router.get("/types", async (_, res) => {
    try {
      const result = await pool.query(`
        SELECT id, name 
        FROM group_types 
        WHERE is_active = TRUE 
        ORDER BY name ASC
      `);
      res.status(200).json(result.rows);
    } catch (err) {
      console.error("❌ Failed to fetch group types:", err);
      res.status(500).json({error: "Internal server error"});
    }
  });

  const upload = multer({
    storage: multer.diskStorage({
      destination: (req, file, cb) => cb(null, os.tmpdir()),
      filename: (req, file, cb) =>
        cb(null, `${Date.now()}-${file.originalname}`),
    }),
    limits: {fileSize: 10 * 1024 * 1024}, // 10MB max
  });

  const corsHandler = cors({
    origin: ["https://farm-fuzion-abdf3.web.app"],
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  });

  router.options("/register-with-docs", corsHandler); // 💡 Handle preflight

  router.post("/register-with-docs", corsHandler, upload.any(), (req, res) => {
    (async () => {
      const fields = req.body;
      const files = req.files as Express.Multer.File[];

      const required = [
        "name",
        "group_type_id",
        "location",
        "registration_number",
        "requirements",
      ];
      const missing = required.filter((key) => !fields[key]);
      if (missing.length > 0) {
        res.status(400).json({
          error: `Missing fields: ${missing.join(", ")}`,
        });
        return;
      }

      const requirements = JSON.parse(fields.requirements);
      const uploads = new Map(
        files.map((f) => [
          f.fieldname.replace("documents[", "").replace("]", ""),
          f.path,
        ])
      );

      const client = await pool.connect();
      try {
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

            if (!filePath) {
              console.warn(`⚠️ No filePath for ${doc.doc_type}`);
              continue;
            }

            const bucket = storage.bucket();
            const destination = `groups/${groupId}/${doc.doc_type}-${Date.now()}
            ${path.extname(filePath)}`;

            console.log("🔽 Incoming fields:", fields);
            console.log("📦 Received files:", files.map((f) => ({
              fieldname: f.fieldname,
              path: f.path,
              originalname: f.originalname,
            })));

            try {
              await bucket.upload(filePath, {
                destination,
                metadata: {
                  contentType: "application/octet-stream",
                  metadata: {
                    firebaseStorageDownloadTokens: groupId,
                  },
                },
              });

              console.log(`✅ Uploaded ${doc.doc_type} to ${destination}`);

              // ✅ Save destination path
              await client.query(
                `INSERT INTO group_documents (group_id, doc_type, file_path)
                VALUES ($1, $2, $3)`,
                [groupId, doc.doc_type, destination]
              );
            } catch (uploadErr) {
              console.error(`❌ Error uploading ${doc.doc_type}:`, uploadErr);
              throw new Error(`Upload failed for ${doc.doc_type}`);
            }
          }
        } // ✅ << THIS was missing

        await client.query("COMMIT");
        res.status(201).json({
          id: groupId,
          message: "Group registered with documents.",
        });
      } catch (err) {
        await client.query("ROLLBACK");
        console.error("❌ Error during multipart group registration:", err);
        res.status(500).json({error: "Failed to register group"});
      } finally {
        client.release();
      }
    })().catch((err) => {
      console.error("❌ Unexpected registration error:", err);
      res.status(500).json({error: "Unexpected error"});
    });
  });

  return router;
};
