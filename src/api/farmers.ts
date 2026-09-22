/* eslint-disable max-len */
/* eslint-disable camelcase */
import {FarmerSchema} from "../validation/farmerSchema";
import express from "express";
import {z} from "zod";
import {initDbPool} from "../utils/db";
import {v4 as uuidv4} from "uuid";

export const validateRequest = (
  schema: z.ZodSchema
): express.RequestHandler => {
  return (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ): void => {
    try {
      schema.parse(req.body);
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({error: error.errors[0].message});
      } else {
        res.status(400).json({error: "Invalid request"});
      }
    }
  };
};

export const getFarmersRouter = (config: {
  PGUSER: string;
  PGPASS: string;
  PGHOST: string;
  PGDB: string;
  PGPORT: string;
}) => {
  const pool = initDbPool(config);
  const router = express.Router();

  router.post("/", validateRequest(FarmerSchema), async (req, res) => {
    const {
      first_name,
      middle_name,
      last_name,
      dob,
      id_passport_no,
      county,
      constituency,
      ward,
      address,
      location,
      mobile,
      email,
      group_id,
    } = req.body;

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // 🚀 STEP 1: Get the farmer role ID from user_roles table
      const roleResult = await client.query(
        "SELECT id FROM user_roles WHERE LOWER(name) = 'farmer' LIMIT 1"
      );

      if (roleResult.rows.length === 0) {
        throw new Error("Farmer role not found in database");
      }

      const farmerRoleId = roleResult.rows[0].id;
      console.log("✅ Found farmer role ID:", farmerRoleId);

      // 🚀 STEP 2: Create user with BOTH role (text) and role_id (UUID)
      const userId = uuidv4();
      const userResult = await client.query(
        `INSERT INTO users (id, email, role, role_id, group_id, created_at)
        VALUES ($1, $2, $3, $4, $5, NOW())
        ON CONFLICT (email) DO UPDATE 
        SET role = $3, role_id = $4, group_id = $5
        RETURNING id`,
        [userId, email, "farmer", farmerRoleId, group_id]
      );

      // 🚀 STEP 3: Create farmer linked to user - FIXED
      const result = await client.query(
        `INSERT INTO farmers (
          user_id, first_name, middle_name, last_name, dob, id_passport_no,
          county, constituency, ward, location, address, mobile, email,
          group_id, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW())
        RETURNING id`,
        [
          userResult.rows[0].id,
          first_name,
          middle_name || null,
          last_name,
          dob || null,
          id_passport_no || null,
          county || null,
          constituency || null,
          ward || null,
          location || null,
          address || null,
          mobile,
          email,
          group_id,
        ]
      );

      await client.query("COMMIT");
      console.log(`✅ Farmer registered with ID: ${result.rows[0].id}, User ID: ${userResult.rows[0].id}`);
      return res.status(201).json({id: result.rows[0].id});
    } catch (err) {
      await client.query("ROLLBACK");
      console.error("❌ Error creating farmer:", err);
      return res.status(500).json({
        error: "Internal server error",
        details: err instanceof Error ? err.message : String(err),
      });
    } finally {
      client.release();
    }
  });

  router.get("/", async (_, res) => {
    try {
      const result = await pool.query(`
        SELECT f.*, u.email as user_email, u.role_id, r.name as role_name
        FROM farmers f
        LEFT JOIN users u ON f.user_id = u.id
        LEFT JOIN user_roles r ON u.role_id = r.id
      `);
      return res.json(result.rows);
    } catch (err) {
      console.error("Error fetching farmers:", err);
      return res.status(500).send("Internal server error");
    }
  });

  // ✅ NEW ENDPOINT: Get farmer by user ID (UUID)
  router.get("/by-user/:userId", async (req, res) => {
    try {
      const {userId} = req.params;

      console.log("Looking up farmer for user ID:", userId);

      // Validate userId format (basic UUID check)
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(userId)) {
        return res.status(400).json({
          error: "Invalid user ID format",
          details: "User ID must be a valid UUID",
        });
      }

      const result = await pool.query(
        `SELECT id, first_name, last_name, email, mobile 
         FROM farmers 
         WHERE user_id = $1`,
        [userId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          error: "Farmer not found",
          details: `No farmer found for user ID: ${userId}`,
        });
      }

      // Return the numeric farmer ID and basic info
      return res.json({
        farmer_id: result.rows[0].id,
        first_name: result.rows[0].first_name,
        last_name: result.rows[0].last_name,
        email: result.rows[0].email,
        mobile: result.rows[0].mobile,
      });
    } catch (err) {
      console.error("Error fetching farmer by user ID:", err);
      return res.status(500).json({
        error: "Internal server error",
        details: err instanceof Error ? err.message : "Unknown error",
      });
    }
  });

  // ✅ Get farmer by email
  router.get("/by-email/:email", async (req, res) => {
    try {
      const {email} = req.params;

      const result = await pool.query(
        `SELECT f.id, f.first_name, f.last_name, f.email, f.mobile, u.id as user_id
         FROM farmers f
         JOIN users u ON f.user_id = u.id
         WHERE f.email = $1 OR u.email = $1`,
        [email]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({error: "Farmer not found"});
      }

      return res.json(result.rows[0]);
    } catch (err) {
      console.error("Error fetching farmer by email:", err);
      return res.status(500).json({error: "Internal server error"});
    }
  });

  router.patch("/:id/group", async (req, res) => {
    const {group_id} = req.body;
    const farmerId = req.params.id;

    if (!group_id) {
      return res.status(400).json({error: "Missing group_id"});
    }

    try {
      await pool.query(
        "UPDATE farmers SET group_id = $1 WHERE id = $2",
        [group_id, farmerId]
      );
      return res.sendStatus(200);
    } catch (err) {
      console.error("Error updating farmer group:", err);
      return res.status(500).json({error: "Internal server error"});
    }
  });

  // GET /farmers/:id - Get farmer by numeric ID
  router.get("/:id", async (req, res) => {
    try {
      const farmerId = parseInt(req.params.id);

      if (isNaN(farmerId)) {
        return res.status(400).json({error: "Invalid farmer ID"});
      }

      const result = await pool.query(
        `SELECT 
          f.id,
          f.first_name,
          f.middle_name,
          f.last_name,
          f.email,
          f.mobile,
          f.group_id,
          f.county,
          f.constituency,
          f.ward,
          f.location,
          f.address,
          f.created_at,
          g.name as group_name,
          g.registration_number as group_registration,
          g.status as group_status
        FROM farmers f
        LEFT JOIN groups g ON f.group_id = g.id
        WHERE f.id = $1`,
        [farmerId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({error: "Farmer not found"});
      }

      return res.json(result.rows[0]);
    } catch (error) {
      console.error("Error fetching farmer by ID:", error);
      return res.status(500).json({error: "Internal server error"});
    }
  });

  return router;
};
