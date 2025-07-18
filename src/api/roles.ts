// functions/src/api/roles.ts
import express, {
  Request,
  Response,
  NextFunction,
  RequestHandler,
} from "express";
import {initDbPool} from "../utils/db";

// Safe async wrapper
const asyncHandler = (
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
): RequestHandler =>
  (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

export const getRolesRouter = (config: {
  PGUSER: string;
  PGPASS: string;
  PGHOST: string;
  PGDB: string;
  PGPORT: string;
}): express.Router => {
  const pool = initDbPool(config);
  const router = express.Router();

  router.options("*", (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*"); // or your domain
    res.setHeader(
      "Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS"
    );
    res.setHeader(
      "Access-Control-Allow-Headers", "Content-Type, Authorization"
    );
    res.status(204).end();
  });

  // GET: Fetch all user roles
  router.get(
    "/",
    asyncHandler(async (_, res) => {
      const result = await pool.query(`
        SELECT id, name, description
        FROM user_roles
        ORDER BY name ASC
      `);
      res.json(result.rows);
    })
  );

  // POST: Create new user role
  router.post(
    "/",
    asyncHandler(async (req, res) => {
      const {name, description} = req.body;

      if (!name) {
        return res.status(400).json({error: "Role name is required."});
      }

      await pool.query(
        `INSERT INTO user_roles (name, description) 
         VALUES ($1, $2) 
         ON CONFLICT (name) DO NOTHING`,
        [name, description ?? null]
      );

      return res.status(201).json({message: "Role created."});
    })
  );

  // PATCH: Update existing role
  router.patch(
    "/:id",
    asyncHandler(async (req: Request, res: Response) => {
      const {id} = req.params;
      const {name, description} = req.body;

      if (!name) {
        return res.status(400).json({error: "Role name is required."});
      }

      await pool.query(
        `UPDATE user_roles 
         SET name = $1, description = $2, created_at = now()
         WHERE id = $3`,
        [name, description ?? null, id]
      );

      return res.status(200).json({message: "Role updated."});
    })
  );

  // DELETE: Remove a role
  router.delete(
    "/:id",
    asyncHandler(async (req: Request, res: Response) => {
      const {id} = req.params;
      const result = await pool.query(
        `DELETE FROM user_roles 
             WHERE id = $1 
             RETURNING id`,
        [id]
      );
      if (result.rowCount === 0) {
        return res.status(404).json({error: "Role not found."});
      }
      return res.status(200).json({message: "Role deleted."});
    })
  );
  return router;
};
