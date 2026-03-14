/* eslint-disable max-len */
/* eslint-disable camelcase */
import express from "express";
import {initDbPool} from "../utils/db";
import {AppConfig} from "../main";
import multer from "multer";
import {saveFile, deleteFile} from "../utils/fileStorage";

interface DocumentRequirement {
  doc_type: string;
  is_required: boolean;
}

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {fileSize: 10 * 1024 * 1024}, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = ["application/pdf", "image/jpeg", "image/png", "image/jpg"];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Invalid file type. Only PDF, JPEG, and PNG are allowed."));
    }
  },
});

export const getGroupsRouter = (config: AppConfig) => {
  const pool = initDbPool(config);
  const router = express.Router();

  // Log all requests for debugging
  router.use((req, res, next) => {
    console.log(`📋 Groups API: ${req.method} ${req.path}`);
    next();
  });

  // 📦 GET all groups
  router.get("/", async (req, res) => {
    try {
      console.log("🔍 Fetching all groups...");
      const result = await pool.query(
        `SELECT 
          g.id, 
          g.name, 
          gt.name AS type,
          g.county,
          g.constituency,
          g.ward, 
          g.location, 
          g.status, 
          g.remarks,
          g.registration_number, 
          g.created_at,
          json_agg(
            json_build_object(
              'doc_type', d.doc_type, 
              'file_path', d.file_path,
              'file_name', d.file_name,
              'file_size', d.file_size,
              'mime_type', d.mime_type
            )
          ) FILTER (WHERE d.id IS NOT NULL) AS documents
        FROM groups g
        LEFT JOIN group_types gt ON g.group_type_id = gt.id
        LEFT JOIN group_documents d ON d.group_id = g.id
        GROUP BY g.id, gt.name
        ORDER BY g.created_at DESC`
      );

      console.log(`✅ Found ${result.rows.length} groups`);
      return res.json(result.rows);
    } catch (err) {
      console.error("❌ Failed to fetch groups:", err);
      return res.status(500).json({
        error: "Failed to load groups",
        details: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // 📝 POST: Register new group with documents
  router.post("/register-with-docs", upload.any(), async (req, res) => {
    try {
      const {
        name,
        group_type_id,
        county,
        constituency,
        ward,
        location,
        description,
        registration_number,
        requirements,
      } = req.body;

      // Validate required fields
      if (!name || !group_type_id || !county || !constituency || !ward ||
        !location || !registration_number) {
        return res.status(400).json({
          error: "Missing required fields",
          required: ["name", "group_type_id", "county", "constituency", "ward", "location", "registration_number"],
        });
      }

      // Parse requirements if it's a string
      let parsedRequirements: DocumentRequirement[] = [];
      if (requirements) {
        try {
          parsedRequirements = typeof requirements === "string" ?
            JSON.parse(requirements) :
            requirements;
        } catch (e) {
          console.error("Failed to parse requirements:", e);
        }
      }

      // Handle file uploads
      const files = req.files as Express.Multer.File[];
      const uploadedFiles = [];

      if (files && files.length > 0) {
        for (const file of files) {
          const savedFile = await saveFile(file);
          uploadedFiles.push({
            ...savedFile,
            doc_type: file.fieldname, // The field name corresponds to document type
          });
        }
        console.log(`📁 Saved ${uploadedFiles.length} files`);
      }

      // Start database transaction
      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        // Insert group
        const groupResult = await client.query(
          `INSERT INTO groups
            (name, group_type_id, county, constituency, ward, location, description,
            registration_number, status)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending')
          RETURNING id`,
          [name, group_type_id, county, constituency, ward, location, description || null, registration_number]
        );

        const groupId = groupResult.rows[0].id;

        // Save requirements
        if (parsedRequirements && parsedRequirements.length > 0) {
          for (const req of parsedRequirements) {
            await client.query(
              `INSERT INTO group_document_requirements (group_id, doc_type, is_required)
               VALUES ($1, $2, $3)
               ON CONFLICT (group_id, doc_type) 
               DO UPDATE SET is_required = EXCLUDED.is_required`,
              [groupId, req.doc_type, req.is_required]
            );
          }
        }

        // Save uploaded file records
        for (const file of uploadedFiles) {
          await client.query(
            `INSERT INTO group_documents 
              (group_id, doc_type, file_path, file_name, file_size, mime_type, uploaded_at)
             VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
            [groupId, file.doc_type, file.fileName, file.originalName, file.size, file.mimeType]
          );
        }

        await client.query("COMMIT");

        console.log(`✅ Group registered with ID: ${groupId}`);
        return res.status(201).json({
          id: groupId,
          message: "Group registered successfully with documents",
          files: uploadedFiles.map((f) => ({
            fileName: f.fileName,
            originalName: f.originalName,
            size: f.size,
            doc_type: f.doc_type,
          })),
        });
      } catch (dbErr) {
        await client.query("ROLLBACK");
        // Clean up uploaded files if database transaction fails
        for (const file of uploadedFiles) {
          await deleteFile(file.fileName).catch(console.error);
        }
        throw dbErr;
      } finally {
        client.release();
      }
    } catch (err) {
      console.error("❌ Group registration failed:", err);
      return res.status(500).json({
        error: "Internal server error",
        details: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // 👥 GET farmers by group ID
  router.get("/:groupId/farmers", async (req, res) => {
    const {groupId} = req.params;

    try {
      console.log(`🔍 Fetching farmers for group ${groupId}...`);
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

      console.log(`✅ Found ${result.rows.length} farmers in group ${groupId}`);
      return res.json(result.rows);
    } catch (err) {
      console.error("❌ Failed to fetch group farmers:", err);
      return res.status(500).json({
        error: "Failed to load farmers in group",
        details: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // ✅ PATCH: Approve group
  router.patch("/:groupId/approve", async (req, res) => {
    const {groupId} = req.params;

    try {
      console.log(`✅ Approving group ${groupId}...`);
      await pool.query(
        `UPDATE groups 
         SET status = 'active', remarks = NULL 
         WHERE id = $1`,
        [groupId]
      );
      console.log(`✅ Group ${groupId} approved successfully`);
      return res.status(200).json({message: "Group approved successfully."});
    } catch (err) {
      console.error("❌ Approval error:", err);
      return res.status(500).json({
        error: "Server error",
        details: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // ❌ PATCH: Reject group
  router.patch("/:groupId/reject", async (req, res) => {
    const {groupId} = req.params;
    const {remarks, revertToPending} = req.body;

    const status = revertToPending ? "pending" : "rejected";

    try {
      console.log(`❌ Rejecting group ${groupId} with status: ${status}`);
      await pool.query(
        `UPDATE groups 
         SET status = $1, remarks = $2 
         WHERE id = $3`,
        [status, remarks || null, groupId]
      );
      console.log(`✅ Group ${groupId} status updated to ${status}`);
      return res.status(200).json({message: `Group status updated to ${status}`});
    } catch (err) {
      console.error("❌ Rejection error:", err);
      return res.status(500).json({
        error: "Server error",
        details: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // 📄 POST: Add document requirements
  router.post("/:groupId/requirements", async (req, res) => {
    const {groupId} = req.params;
    const {requirements} = req.body as { requirements: DocumentRequirement[] };

    if (!Array.isArray(requirements)) {
      return res.status(400).json({error: "Invalid format - requirements must be an array"});
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      console.log(`📄 Updating requirements for group ${groupId}...`);

      await client.query(
        "DELETE FROM group_document_requirements WHERE group_id = $1",
        [groupId]
      );

      for (const item of requirements) {
        await client.query(
          `INSERT INTO group_document_requirements (group_id, doc_type, is_required)
           VALUES ($1, $2, $3)
           ON CONFLICT (group_id, doc_type)
           DO UPDATE SET is_required = EXCLUDED.is_required`,
          [groupId, item.doc_type, item.is_required]
        );
      }

      await client.query("COMMIT");
      console.log(`✅ Requirements updated for group ${groupId}`);
      return res.status(200).json({message: "Document requirements updated"});
    } catch (err) {
      await client.query("ROLLBACK");
      console.error("❌ Error saving document requirements:", err);
      return res.status(500).json({
        error: "Internal server error",
        details: err instanceof Error ? err.message : String(err),
      });
    } finally {
      client.release();
    }
  });

  // ✅ GET: Active group types for dropdowns
  router.get("/types", async (_, res) => {
    try {
      console.log("🔍 Fetching group types...");
      const result = await pool.query(`
        SELECT id, name 
        FROM group_types 
        WHERE is_active = TRUE 
        ORDER BY name ASC
      `);
      console.log(`✅ Found ${result.rows.length} group types`);
      return res.status(200).json(result.rows);
    } catch (err) {
      console.error("❌ Failed to fetch group types:", err);
      return res.status(500).json({
        error: "Internal server error",
        details: err instanceof Error ? err.message : String(err),
      });
    }
  });

  return router;
};
