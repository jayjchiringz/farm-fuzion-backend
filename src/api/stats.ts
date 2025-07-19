/* eslint-disable @typescript-eslint/no-explicit-any */
import express from "express";
import {initDbPool} from "../utils/db";

export const getStatsRouter = (config: {
  PGUSER: string;
  PGPASS: string;
  PGHOST: string;
  PGDB: string;
  PGPORT: string;
}) => {
  const pool = initDbPool(config);
  const router = express.Router();

  router.get("/summary", async (_, res) => {
    try {
      const client = await pool.connect();

      const totalGroups = await client.query("SELECT COUNT(*) FROM groups");
      const totalFarmers = await client.query("SELECT COUNT(*) FROM farmers");

      const statuses = await client.query(`
        SELECT status, COUNT(*) 
        FROM groups 
        GROUP BY status
      `);

      const farmerGroup = await client.query(`
        SELECT g.name AS group, COUNT(f.id) AS total
        FROM groups g
        LEFT JOIN farmers f ON f.group_id = g.id
        GROUP BY g.name
      `);

      client.release();

      res.json({
        totalGroups: parseInt(totalGroups.rows[0].count),
        totalFarmers: parseInt(totalFarmers.rows[0].count),
        statusCounts: statuses.rows.reduce((acc: any, row: any) => {
          acc[row.status] = parseInt(row.count);
          return acc;
        }, {}),
        farmerByGroup: farmerGroup.rows.map((row: any) => ({
          group: row.group,
          total: parseInt(row.total),
        })),
      });
    } catch (err) {
      console.error("❌ Failed to fetch summary stats:", err);
      res.status(500).json({error: "Internal server error"});
    }
  });

  return router;
};
