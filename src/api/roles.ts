/* eslint-disable camelcase */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/ban-types */
// src/api/roles.ts
import express from "express";
import {Pool} from "pg";
import {initDbPool} from "../utils/db";

// Define the config interface
interface DbConfig {
  PGUSER: string;
  PGPASS: string;
  PGHOST: string;
  PGDB: string;
  PGPORT: string;
  MAIL_USER?: string;
  MAIL_PASS?: string;
}

// Define types for request bodies
interface CreateRoleBody {
  name: string;
  description?: string;
}

interface UpdateRoleBody {
  name: string;
  description?: string;
}

// Define the role type (matching your database schema)
interface Role {
  id: string;
  name: string;
  description: string | null;
  created_at: Date;
}

export const getRolesRouter = (config: DbConfig) => {
  const pool: Pool = initDbPool(config);
  const router = express.Router();

  // GET all roles
  router.get("/", async (req: express.Request, res: express.Response) => {
    try {
      const result = await pool.query<Role>(`
        SELECT id, name, description, created_at
        FROM user_roles
        ORDER BY name ASC
      `);
      return res.json(result.rows);
    } catch (err) {
      console.error("❌ Error fetching roles:", err);
      return res.status(500).json({error: "Failed to fetch roles"});
    }
  });

  // In roles.ts, when creating roles, normalize to your database format
  router.post("/", async (req, res) => {
    try {
      const {name, description} = req.body;
      if (!name) {
        return res.status(400).json({error: "Role name is required"});
      }

      // Keep the role name as provided (e.g., "Group Admin" with space)
      // Don't convert to underscore - match your database exactly
      const result = await pool.query(
        `INSERT INTO user_roles (name, description) 
        VALUES ($1, $2) 
        ON CONFLICT (name) DO NOTHING
        RETURNING *`,
        [name, description || null]
      );

      if (result.rows.length === 0) {
        return res.status(409).json({error: "Role already exists"});
      }

      return res.status(201).json(result.rows[0]);
    } catch (err) {
      console.error("❌ Error creating role:", err);
      return res.status(500).json({error: "Failed to create role"});
    }
  });

  // PATCH update role
  router.patch("/:id", async (req: express.Request<{ id: string }, {}, UpdateRoleBody>, res: express.Response) => {
    try {
      const {id} = req.params;
      const {name, description} = req.body;

      if (!name) {
        return res.status(400).json({error: "Role name is required"});
      }

      const result = await pool.query<Role>(
        `UPDATE user_roles
         SET name = $1, description = $2
         WHERE id = $3
         RETURNING *`,
        [name.toLowerCase().replace(/\s+/g, "_"), description || null, id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({error: "Role not found"});
      }

      return res.json(result.rows[0]);
    } catch (err) {
      console.error("❌ Error updating role:", err);
      return res.status(500).json({error: "Failed to update role"});
    }
  });

  // DELETE role
  router.delete("/:id", async (req: express.Request<{ id: string }>, res: express.Response) => {
    try {
      const {id} = req.params;

      // Check if role is in use
      const usageCheck = await pool.query(
        "SELECT COUNT(*) FROM users WHERE role_id = $1",
        [id]
      );

      if (parseInt(usageCheck.rows[0].count) > 0) {
        return res.status(400).json({error: "Cannot delete role that is assigned to users"});
      }

      const result = await pool.query<{ id: string }>(
        "DELETE FROM user_roles WHERE id = $1 RETURNING id",
        [id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({error: "Role not found"});
      }

      return res.json({message: "Role deleted successfully"});
    } catch (err) {
      console.error("❌ Error deleting role:", err);
      return res.status(500).json({error: "Failed to delete role"});
    }
  });

  return router;
};
