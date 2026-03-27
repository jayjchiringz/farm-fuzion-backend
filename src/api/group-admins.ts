/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/ban-types */
// src/api/group-admins.ts
/* eslint-disable camelcase */
import express from "express";
import {Pool} from "pg";
import {initDbPool} from "../utils/db";
import bcrypt from "bcrypt";

interface DbConfig {
  PGUSER: string;
  PGPASS: string;
  PGHOST: string;
  PGDB: string;
  PGPORT: string;
  MAIL_USER?: string;
  MAIL_PASS?: string;
}

interface GroupAdminCreateBody {
  first_name: string;
  middle_name?: string;
  last_name: string;
  email: string;
  mobile: string;
  group_id: string;
}

// Generate a random temporary password
const generateTempPassword = (): string => {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let password = "";
  for (let i = 0; i < 10; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
};

export const getGroupAdminsRouter = (config: DbConfig) => {
  const pool: Pool = initDbPool(config);
  const router = express.Router();

  // POST /group-admins - Register a new group admin
  router.post("/", async (req: express.Request<{}, {}, GroupAdminCreateBody>, res: express.Response) => {
    try {
      const {first_name, middle_name, last_name, email, mobile, group_id} = req.body;

      console.log("📝 Creating group admin:", {first_name, last_name, email, group_id});

      // Validate required fields
      if (!first_name || !last_name || !email || !mobile || !group_id) {
        return res.status(400).json({
          error: "Missing required fields: first_name, last_name, email, mobile, group_id",
        });
      }

      // Check if email already exists
      const existingUser = await pool.query(
        "SELECT id FROM users WHERE email = $1",
        [email.toLowerCase()]
      );

      if (existingUser.rows.length > 0) {
        return res.status(409).json({error: "User with this email already exists"});
      }

      // Get role_id for 'Group Admin'
      const roleResult = await pool.query(
        "SELECT id FROM user_roles WHERE name = $1",
        ["Group Admin"]
      );

      if (roleResult.rows.length === 0) {
        return res.status(400).json({
          error: "Group Admin role not found. Please ensure 'Group Admin' role exists in user_roles table.",
        });
      }

      const role_id = roleResult.rows[0].id;

      // Check if group exists and is active
      const groupResult = await pool.query(
        "SELECT id, name FROM groups WHERE id = $1 AND status = 'active'",
        [group_id]
      );

      if (groupResult.rows.length === 0) {
        return res.status(400).json({error: "Group not found or not active"});
      }

      const groupName = groupResult.rows[0].name;

      // Generate temporary password
      const tempPassword = generateTempPassword();
      const hashedPassword = await bcrypt.hash(tempPassword, 10);

      // Create user in users table - REMOVED updated_at
      const userResult = await pool.query(
        `INSERT INTO users (email, password, role_id, created_at)
         VALUES ($1, $2, $3, NOW())
         RETURNING id`,
        [email.toLowerCase(), hashedPassword, role_id]
      );

      const user_id = userResult.rows[0].id;

      // Update user with group_id
      await pool.query(
        "UPDATE users SET group_id = $1 WHERE id = $2",
        [group_id, user_id]
      );

      // Create group_admin record
      await pool.query(
        `INSERT INTO group_admins (user_id, group_id, first_name, middle_name, last_name, mobile, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
        [user_id, group_id, first_name, middle_name || null, last_name, mobile]
      );

      // Log the created admin
      console.log(`✅ Group Admin created for ${groupName}:`);
      console.log(`   Name: ${first_name} ${middle_name || ""} ${last_name}`);
      console.log(`   Email: ${email}`);
      console.log(`   Temporary Password: ${tempPassword}`);

      // TODO: Send email with temporary password

      return res.status(201).json({
        success: true,
        user_id,
        group_name: groupName,
        role: "Group Admin",
        message: "Group admin created successfully. They will receive an email with login instructions.",
        temp_password: process.env.NODE_ENV === "development" ? tempPassword : undefined,
      });
    } catch (error) {
      console.error("❌ Error creating group admin:", error);
      return res.status(500).json({error: "Failed to create group admin"});
    }
  });

  // GET /group-admins - List all group admins
  router.get("/", async (req: express.Request, res: express.Response) => {
    try {
      const result = await pool.query(`
        SELECT 
          ga.id,
          ga.user_id,
          ga.group_id,
          g.name as group_name,
          ga.first_name,
          ga.middle_name,
          ga.last_name,
          ga.mobile,
          u.email,
          u.created_at,
          r.name as role_name
        FROM group_admins ga
        JOIN users u ON ga.user_id = u.id
        JOIN groups g ON ga.group_id = g.id
        JOIN user_roles r ON u.role_id = r.id
        ORDER BY ga.created_at DESC
      `);

      return res.json(result.rows);
    } catch (error) {
      console.error("❌ Error fetching group admins:", error);
      return res.status(500).json({error: "Failed to fetch group admins"});
    }
  });

  // GET /group-admins/:id - Get a specific group admin
  router.get("/:id", async (req: express.Request, res: express.Response) => {
    try {
      const {id} = req.params;

      const result = await pool.query(`
        SELECT 
          ga.id,
          ga.user_id,
          ga.group_id,
          g.name as group_name,
          ga.first_name,
          ga.middle_name,
          ga.last_name,
          ga.mobile,
          u.email,
          u.created_at,
          r.name as role_name
        FROM group_admins ga
        JOIN users u ON ga.user_id = u.id
        JOIN groups g ON ga.group_id = g.id
        JOIN user_roles r ON u.role_id = r.id
        WHERE ga.id = $1
      `, [id]);

      if (result.rows.length === 0) {
        return res.status(404).json({error: "Group admin not found"});
      }

      return res.json(result.rows[0]);
    } catch (error) {
      console.error("❌ Error fetching group admin:", error);
      return res.status(500).json({error: "Failed to fetch group admin"});
    }
  });

  // GET /group-admins/by-group/:groupId - Get group admins by group
  router.get("/by-group/:groupId", async (req: express.Request, res: express.Response) => {
    try {
      const {groupId} = req.params;

      const result = await pool.query(`
        SELECT 
          ga.id,
          ga.user_id,
          ga.first_name,
          ga.middle_name,
          ga.last_name,
          ga.mobile,
          u.email,
          u.created_at
        FROM group_admins ga
        JOIN users u ON ga.user_id = u.id
        WHERE ga.group_id = $1
        ORDER BY ga.created_at DESC
      `, [groupId]);

      return res.json(result.rows);
    } catch (error) {
      console.error("❌ Error fetching group admins by group:", error);
      return res.status(500).json({error: "Failed to fetch group admins"});
    }
  });

  // PUT /group-admins/:id - Update group admin
  router.put("/:id", async (req: express.Request, res: express.Response) => {
    try {
      const {id} = req.params;
      const {first_name, middle_name, last_name, mobile} = req.body;

      const result = await pool.query(
        `UPDATE group_admins 
         SET first_name = COALESCE($1, first_name),
             middle_name = COALESCE($2, middle_name),
             last_name = COALESCE($3, last_name),
             mobile = COALESCE($4, mobile),
             updated_at = NOW()
         WHERE id = $5
         RETURNING *`,
        [first_name, middle_name, last_name, mobile, id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({error: "Group admin not found"});
      }

      return res.json(result.rows[0]);
    } catch (error) {
      console.error("❌ Error updating group admin:", error);
      return res.status(500).json({error: "Failed to update group admin"});
    }
  });

  // DELETE /group-admins/:id - Delete group admin
  router.delete("/:id", async (req: express.Request, res: express.Response) => {
    try {
      const {id} = req.params;

      // Get user_id before deleting
      const adminResult = await pool.query(
        "SELECT user_id FROM group_admins WHERE id = $1",
        [id]
      );

      if (adminResult.rows.length === 0) {
        return res.status(404).json({error: "Group admin not found"});
      }

      const user_id = adminResult.rows[0].user_id;

      // Delete from group_admins
      await pool.query("DELETE FROM group_admins WHERE id = $1", [id]);

      // Delete from users
      await pool.query("DELETE FROM users WHERE id = $1", [user_id]);

      return res.json({message: "Group admin deleted successfully"});
    } catch (error) {
      console.error("❌ Error deleting group admin:", error);
      return res.status(500).json({error: "Failed to delete group admin"});
    }
  });

  return router;
};
