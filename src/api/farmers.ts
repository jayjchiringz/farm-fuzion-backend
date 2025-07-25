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
