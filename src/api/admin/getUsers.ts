import express from "express";
import {Pool} from "pg";
import {initDbPool} from "../../utils/db";

interface DbConfig {
  PGUSER: string;
  PGPASS: string;
  PGHOST: string;
  PGDB: string;
  PGPORT: string;
}

export const getUsersRouter = (config: DbConfig) => {
  const pool: Pool = initDbPool(config);
  const router = express.Router();

  router.get("/", async (req: express.Request, res: express.Response) => {
    try {
      const {limit = 100} = req.query;
      const limitNum = Number(limit);

      const result = await pool.query(`
        SELECT 
          u.id,
          u.email,
          u.role,
          u.group_id,
          u.created_at,
          COALESCE(f.first_name, '') as first_name,
          COALESCE(f.last_name, '') as last_name,
          COALESCE(f.middle_name, '') as middle_name,
          COALESCE(f.phone, '') as phone,
          g.name as group_name
        FROM users u
        LEFT JOIN farmers f ON u.id = f.user_id
        LEFT JOIN groups g ON u.group_id = g.id
        ORDER BY u.created_at DESC
        LIMIT $1
      `, [limitNum]);

      return res.status(200).json({users: result.rows});
    } catch (error) {
      console.error("Error fetching users:", error);
      return res.status(500).json({error: "Failed to fetch users"});
    }
  });

  return router;
};
