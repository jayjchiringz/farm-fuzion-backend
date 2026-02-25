/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
import {onRequest} from "firebase-functions/v2/https";
import {defineSecret} from "firebase-functions/params";
import express from "express";
import cors from "cors";
import {initDbPool} from "../../utils/db";

const PGUSER = defineSecret("PGUSER");
const PGPASS = defineSecret("PGPASS");
const PGHOST = defineSecret("PGHOST");
const PGDB = defineSecret("PGDB");
const PGPORT = defineSecret("PGPORT");

const app = express();
app.use(cors({origin: true}));
app.use(express.json());

// PATCH endpoint for updating user role
app.patch("/:userId/role", async (req, res) => {
  try {
    const {userId} = req.params;
    const {role} = req.body;

    // Validate role against allowed values
    const allowedRoles = ["admin", "sacco", "farmer"];
    if (!role || !allowedRoles.includes(role)) {
      return res.status(400).json({
        error: "Invalid role. Must be one of: admin, sacco, farmer",
      });
    }

    const pool = initDbPool({
      PGUSER: process.env.PGUSER!,
      PGPASS: process.env.PGPASS!,
      PGHOST: process.env.PGHOST!,
      PGDB: process.env.PGDB!,
      PGPORT: process.env.PGPORT!,
    });

    // Start a transaction
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Update the user's role
      const userResult = await client.query(
        `UPDATE users 
         SET role = $1, updated_at = NOW()
         WHERE id = $2
         RETURNING id, email, role, created_at`,
        [role, userId]
      );

      if (userResult.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({error: "User not found."});
      }

      // If the user is a farmer, update or insert into farmers table
      if (role === "farmer") {
        // Check if farmer record exists
        const farmerCheck = await client.query(
          "SELECT id FROM farmers WHERE user_id = $1",
          [userId]
        );

        if (farmerCheck.rows.length === 0) {
          // Create farmer record if it doesn't exist
          await client.query(
            `INSERT INTO farmers (user_id, created_at)
             VALUES ($1, NOW())`,
            [userId]
          );
        }
      } else {
        // If user is being changed from farmer to something else,
        // mark as inactive or keep for historical records
        await client.query(
          `UPDATE farmers 
           SET is_active = false, updated_at = NOW()
           WHERE user_id = $1`,
          [userId]
        );
      }

      await client.query("COMMIT");

      return res.status(200).json({
        success: true,
        message: "User role updated successfully",
        user: {
          id: userResult.rows[0].id,
          email: userResult.rows[0].email,
          role: userResult.rows[0].role,
          created_at: userResult.rows[0].created_at,
        },
      });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (err: any) {
    console.error("❌ updateUserRole error:", err);
    return res.status(500).json({
      error: "Internal server error",
      details: err.message,
    });
  }
});

// Export the Firebase function - THIS MUST MATCH THE IMPORT NAME
export const updateUserRole = onRequest(
  {
    secrets: [PGUSER, PGPASS, PGHOST, PGDB, PGPORT],
    timeoutSeconds: 60,
    memory: "512MiB",
  },
  app
);
