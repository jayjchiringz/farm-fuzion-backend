/* eslint-disable camelcase */
import express from "express";
import {initDbPool} from "../utils/db";

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
        `SELECT id, name, type, location, status, remarks 
         FROM groups 
         ORDER BY name ASC`
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
    const {name, group_type_id, location, description} = req.body;

    if (!name || !group_type_id || !location) {
      res.status(400).json({
        error: "Name, group_type_id, and location are required.",
      });
      return;
    }

    try {
      const result = await pool.query(
        `INSERT INTO groups (name, group_type_id, location, description, status)
        VALUES ($1, $2, $3, $4, 'pending')
        RETURNING id`,
        [name, group_type_id, location, description || null]
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

  return router;
};
