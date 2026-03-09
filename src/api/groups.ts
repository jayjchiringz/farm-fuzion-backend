/* eslint-disable max-len */
/* eslint-disable camelcase */
import express from "express";
import {initDbPool} from "../utils/db";
import {AppConfig} from "../main";

interface DocumentRequirement {
  doc_type: string;
  is_required: boolean;
}

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
            json_build_object('doc_type', d.doc_type, 'file_path', d.file_path)
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
