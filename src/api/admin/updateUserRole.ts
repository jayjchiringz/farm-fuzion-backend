/* eslint-disable max-len */
import express from "express";
import {Pool} from "pg";
import {initDbPool} from "../../utils/db";

// Define the config interface
interface DbConfig {
  PGUSER: string;
  PGPASS: string;
  PGHOST: string;
  PGDB: string;
  PGPORT: string;
}

export const updateUserRoleRouter = (config: DbConfig) => {
  const pool: Pool = initDbPool(config);
  const router = express.Router();

  router.patch("/:userId/role", async (req: express.Request, res: express.Response) => {
    try {
      const {userId} = req.params;
      const {role} = req.body;

      const allowedRoles = ["admin", "sacco", "farmer"];
      if (!role || !allowedRoles.includes(role)) {
        return res.status(400).json({
          error: "Invalid role. Must be one of: admin, sacco, farmer",
        });
      }

      // Check if user exists
      const userCheck = await pool.query(
        "SELECT id FROM users WHERE id = $1",
        [userId]
      );

      if (userCheck.rows.length === 0) {
        return res.status(404).json({error: "User not found."});
      }

      // Update the user's role - REMOVED updated_at since it doesn't exist in your schema
      const result = await pool.query(
        "UPDATE users SET role = $1 WHERE id = $2 RETURNING id, email, role, created_at",
        [role, userId]
      );

      return res.status(200).json({
        success: true,
        message: "Role updated successfully",
        user: result.rows[0],
      });
    } catch (error) {
      console.error("Error updating role:", error);
      return res.status(500).json({error: "Failed to update role"});
    }
  });

  return router;
};
