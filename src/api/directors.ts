/* eslint-disable camelcase */
import express, {RequestHandler} from "express";
import {DirectorSchema} from "../validation/directorSchema";
import {initDbPool} from "../utils/db";

// 🛡️ Validation interface
interface ValidationSchema {
  validate: (data: unknown) => { error?: { details: { message: string }[] } };
}

// 🧪 Generic schema validator middleware
export const validateRequest = (schema: ValidationSchema): RequestHandler => {
  return (req, res, next) => {
    const {error} = schema.validate(req.body);
    if (error) {
      res.status(400).json({error: error.details[0].message});
      return;
    }
    next();
  };
};

// 🧠 Router Factory for secure env usage
export const getDirectorsRouter = (config: {
  PGUSER: string;
  PGPASS: string;
  PGHOST: string;
  PGDB: string;
  PGPORT: string;
}) => {
  const pool = initDbPool(config);
  const router = express.Router();

  // ➕ Create Director
  router.post(
    "/",
    validateRequest({
      validate: (data: unknown) => {
        const result = DirectorSchema.safeParse(data);
        if (!result.success) {
          return {
            error: {
              details: result.error.issues.map((issue) => ({
                message: issue.message,
              })),
            },
          };
        }
        return {};
      },
    }),
    async (req, res) => {
      const {
        first_name,
        middle_name,
        last_name,
        dob,
        id_passport_no,
        location,
        address,
        mobile_no,
        email,
      } = req.body;

      try {
        const result = await pool.query(
          `INSERT INTO directors (
            first_name, middle_name, last_name,
            dob, id_passport_no, location,
            address, mobile_no, email
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
            mobile_no,
            email,
          ]
        );

        res.status(201).json({id: result.rows[0].id});
      } catch (err) {
        console.error("Error creating director:", err);
        res.status(500).send("Internal server error");
      }
    }
  );

  // 📥 Get All Directors
  router.get("/", async (_, res) => {
    try {
      const result = await pool.query("SELECT * FROM directors");
      res.json(result.rows);
    } catch (err) {
      console.error("Error fetching directors:", err);
      res.status(500).send("Internal server error");
    }
  });

  // 🔍 Get Director by ID
  router.get("/:id", async (req, res) => {
    try {
      const result = await pool.query(
        "SELECT * FROM directors WHERE id = $1",
        [req.params.id]
      );
      res.json(result.rows[0]);
    } catch (err) {
      console.error("Error fetching director:", err);
      res.status(500).send("Internal server error");
    }
  });

  return router;
};
