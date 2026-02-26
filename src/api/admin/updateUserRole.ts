/* eslint-disable max-len */
// FarmFuzion_Firebase_MVP_Starter\functions\src\api\admin\updateUserRole.ts
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

export const updateUserRoleRouter = (config: DbConfig) => {
  const pool: Pool = initDbPool(config);
  const router = express.Router();

  router.patch("/:userId/role", async (req: express.Request, res: express.Response) => {
    try {
      const {userId} = req.params;
      const {role} = req.body;

      // ✅ Check if role exists in user_roles table (case-insensitive)
      const roleCheck = await pool.query(
        "SELECT id, name FROM user_roles WHERE LOWER(name) = LOWER($1)",
        [role]
      );

      if (roleCheck.rows.length === 0) {
        // Get available roles for helpful error message
        const availableRoles = await pool.query(
          "SELECT name FROM user_roles ORDER BY name"
        );
        const roleList = availableRoles.rows.map((r) => r.name).join(", ");

        return res.status(400).json({
          error: `Invalid role. Available roles: ${roleList}`,
        });
      }

      const validRole = roleCheck.rows[0].name; // Use the exact case from database

      // Check if user exists
      const userCheck = await pool.query(
        "SELECT id FROM users WHERE id = $1",
        [userId]
      );

      if (userCheck.rows.length === 0) {
        return res.status(404).json({error: "User not found."});
      }

      // Update the user's role
      const result = await pool.query(
        "UPDATE users SET role = $1 WHERE id = $2 RETURNING id, email, role, created_at",
        [validRole, userId]
      );

      // If the user is a farmer, update or insert into farmers table
      if (validRole.toLowerCase() === "farmer") {
        // Check if farmer record exists
        const farmerCheck = await pool.query(
          "SELECT id FROM farmers WHERE user_id = $1",
          [userId]
        );

        if (farmerCheck.rows.length === 0) {
          // Create farmer record if it doesn't exist
          await pool.query(
            `INSERT INTO farmers (user_id, created_at)
             VALUES ($1, NOW())`,
            [userId]
          );
        }
      }

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
