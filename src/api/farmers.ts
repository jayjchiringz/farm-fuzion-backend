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
      location,
      address,
      mobile,
      email,
    } = req.body;

    try {
      const result = await pool.query(
        `INSERT INTO farmers (
          first_name, middle_name, last_name, dob, id_passport_no,
          location, address, mobile, email
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        RETURNING id`,
        [
          first_name,
          middle_name,
          last_name,
          dob,
          id_passport_no,
          location,
          address,
          mobile,
          email,
        ]
      );
      res.status(201).json({id: result.rows[0].id});
    } catch (err) {
      console.error("Error creating farmer:", err);
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

  return router;
};
