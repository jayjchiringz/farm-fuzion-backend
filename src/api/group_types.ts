import express, {
  Request, Response, NextFunction, RequestHandler,
} from "express";
import {initDbPool} from "../utils/db";

// Safe async wrapper
const asyncHandler = (
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
): RequestHandler =>
  (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

export const getGroupTypesRouter = (
  config: {
    PGUSER: string;
    PGPASS: string;
    PGHOST: string;
    PGDB: string;
    PGPORT: string;
  }
): express.Router => {
  const pool = initDbPool(config);
  const router = express.Router();

  // GET: List all active group types
  router.get("/", asyncHandler(async (_, res) => {
    const result = await pool.query(`
        SELECT id, name
        FROM group_types 
        WHERE is_active = TRUE 
        ORDER BY name ASC
    `);
    res.json(result.rows);
  }));

  // POST: Create new group type
  router.post("/", asyncHandler(async (req, res) => {
    const {name} = req.body;
    if (!name) return res.status(400).json({error: "Name is required."});

    await pool.query(
      `INSERT INTO group_types (name) VALUES ($1)
        ON CONFLICT (name) DO NOTHING`,
      [name]
    );
    res.status(201).json({message: "Group type added."});
  }));

  // PATCH: Update existing group type
  router.patch("/:id", asyncHandler(async (req: Request, res: Response) => {
    const {name} = req.body;
    const {id} = req.params;

    if (!name) return res.status(400).json({error: "Name is required."});

    await pool.query(
      `UPDATE group_types SET name = $1, updated_at = now()
        WHERE id = $2`,
      [name, id]
    );
    res.status(200).json({message: "Group type updated."});
  }));

  // DELETE: Soft-delete group type
  router.delete("/:id", asyncHandler(async (req: Request, res: Response) => {
    const {id} = req.params;

    await pool.query(
      `UPDATE group_types 
        SET is_active = FALSE, updated_at = now()
        WHERE id = $1`,
      [id]
    );
    res.status(200).json({message: "Group type deactivated."});
  }));

  return router;
};
