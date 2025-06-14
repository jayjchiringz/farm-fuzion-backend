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

  return router;
};
