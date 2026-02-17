/* eslint-disable max-len */
/* eslint-disable camelcase */
import {FarmerSchema} from "../validation/farmerSchema";
import express from "express";
import {z} from "zod";
import {initDbPool} from "../utils/db";

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

    try {
      // 🚀 STEP 1: Create user with role = 'farmer'
      const userResult = await pool.query(
        `INSERT INTO users (email, role, group_id)
        VALUES ($1, 'farmer', $2)
        ON CONFLICT (email) DO UPDATE SET role = 'farmer'
        RETURNING id`,
        [email, group_id]
      );
      const userId = userResult.rows[0].id;

      // 🚀 STEP 2: Create farmer linked to user
      const result = await pool.query(
        `INSERT INTO farmers (
          first_name, middle_name, last_name, dob, id_passport_no,
          county, constituency, ward, location, address, mobile, email,
          group_id, user_id
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
        RETURNING id`,
        [
          first_name,
          middle_name,
          last_name,
          dob,
          id_passport_no,
          county,
          constituency,
          ward,
          location,
          address,
          mobile,
          email,
          group_id,
          userId,
        ]
      );

      res.status(201).json({id: result.rows[0].id});
    } catch (err) {
      console.error("❌ Error creating farmer:", err);
      res.status(500).send({error: "Internal server error"});
    }
  });

  router.get("/", async (_, res) => {
    try {
      const result = await pool.query("SELECT * FROM farmers");
      res.json(result.rows);
    } catch (err) {
      console.error("Error fetching farmers:", err);
      res.status(500).send("Internal server error");
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

  // ✅ Optional: Get farmer by email (useful for login flow)
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
      res.status(400).json({error: "Missing group_id"});
      return;
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

  return router;
};
