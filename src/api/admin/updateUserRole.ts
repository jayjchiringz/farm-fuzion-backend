/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable camelcase */
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
      const {role_id} = req.body;

      console.log(`📝 Attempting to assign role ${role_id} to user ${userId}`);

      if (!role_id) {
        return res.status(400).json({error: "role_id is required"});
      }

      // Start a transaction
      await pool.query("BEGIN");

      try {
        // Verify role exists in user_roles table
        const roleCheck = await pool.query(
          "SELECT id, name, description FROM user_roles WHERE id = $1",
          [role_id]
        );

        if (roleCheck.rows.length === 0) {
          await pool.query("ROLLBACK");
          return res.status(404).json({error: "Role not found"});
        }

        // Check if user exists
        const userCheck = await pool.query(
          "SELECT id, email FROM users WHERE id = $1",
          [userId]
        );

        if (userCheck.rows.length === 0) {
          await pool.query("ROLLBACK");
          return res.status(404).json({error: "User not found"});
        }

        // Update user's role_id

        // Handle farmer-specific logic if needed
        if (roleCheck.rows[0].name.toLowerCase() === "farmer") {
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
            console.log(`🌾 Created farmer record for user ${userId}`);
          }
        }

        await pool.query("COMMIT");

        // Get updated user with role details
        const updatedUser = await pool.query(
          `SELECT 
            u.id,
            u.email,
            u.role_id,
            r.name as role_name,
            r.description as role_description,
            u.created_at
          FROM users u
          LEFT JOIN user_roles r ON u.role_id = r.id
          WHERE u.id = $1`,
          [userId]
        );

        return res.status(200).json({
          success: true,
          message: "Role updated successfully",
          user: updatedUser.rows[0],
        });
      } catch (error) {
        await pool.query("ROLLBACK");
        throw error;
      }
    } catch (error: any) {
      console.error("❌ Error updating role:", error);
      return res.status(500).json({error: "Failed to update role"});
    }
  });

  return router;
};
