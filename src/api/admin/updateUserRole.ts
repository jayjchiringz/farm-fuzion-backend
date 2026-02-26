/* eslint-disable @typescript-eslint/no-explicit-any */
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

      console.log(`📝 Attempting to update user ${userId} to role: ${role}`);

      // Step 1: Check if the role exists in user_roles table (case-insensitive)
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

      // Step 2: IMPORTANT - Convert to lowercase for the users table constraint
      // The users table only accepts: 'admin', 'sacco', 'farmer' (lowercase)
      const validRole = role.toLowerCase();

      // Validate that the lowercase version is one of the allowed values
      const allowedRoles = ["admin", "sacco", "farmer"];
      if (!allowedRoles.includes(validRole)) {
        return res.status(400).json({
          error: `Role '${role}' maps to '${validRole}' which is not allowed by the users table constraint. Allowed: ${allowedRoles.join(", ")}`,
        });
      }

      console.log(`✅ Role validated: ${roleCheck.rows[0].name} -> saving as: ${validRole}`);

      // Check if user exists
      const userCheck = await pool.query(
        "SELECT id, role, email FROM users WHERE id = $1",
        [userId]
      );

      if (userCheck.rows.length === 0) {
        return res.status(404).json({error: "User not found."});
      }

      console.log(`🔄 Current user role: ${userCheck.rows[0].role}, New role: ${validRole}`);

      // Update the user's role
      const result = await pool.query(
        "UPDATE users SET role = $1 WHERE id = $2 RETURNING id, email, role, created_at",
        [validRole, userId]
      );

      console.log(`✅ User ${userId} role updated successfully to: ${result.rows[0].role}`);

      // Handle farmer-specific logic if needed
      if (validRole === "farmer") {
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

      return res.status(200).json({
        success: true,
        message: "Role updated successfully",
        user: {
          id: result.rows[0].id,
          email: result.rows[0].email,
          role: result.rows[0].role,
          created_at: result.rows[0].created_at,
        },
      });
    } catch (error: any) {
      console.error("❌ Error updating role:", error);

      // Check for the specific constraint violation
      if (error.code === "23514" && error.constraint === "users_role_check") {
        return res.status(400).json({
          error: "Role must be one of: admin, sacco, farmer (case-insensitive)",
        });
      }

      return res.status(500).json({error: "Failed to update role"});
    }
  });

  return router;
};
