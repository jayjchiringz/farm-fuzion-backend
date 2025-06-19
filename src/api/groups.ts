// functions/src/api/groups.ts
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

  // GET /api/groups
  router.get("/", async (_, res) => {
    try {
      const result = await pool.query(
        "SELECT id, name, type, location FROM groups ORDER BY name ASC"
      );
      res.json(result.rows);
    } catch (err) {
      console.error("❌ Failed to fetch groups:", err);
      res.status(500).json({error: "Failed to load groups"});
    }
  });

  // 👥 Get farmers by group ID
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

  return router;
};
