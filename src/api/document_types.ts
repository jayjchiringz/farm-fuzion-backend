import express from "express";
import {initDbPool} from "../utils/db";

export const getDocumentTypesRouter = (config: {
  PGUSER: string;
  PGPASS: string;
  PGHOST: string;
  PGDB: string;
  PGPORT: string;
}) => {
  const pool = initDbPool(config);
  const router = express.Router();

  // 🔎 Get all active document types
  router.get("/", async (_, res) => {
    try {
      const result = await pool.query(
        `SELECT id, doc_type FROM group_document_types
            WHERE is_active = TRUE ORDER BY doc_type ASC`
      );
      res.status(200).json(result.rows);
    } catch (err) {
      console.error("❌ Failed to fetch document types:", err);
      res.status(500).json({error: "Internal server error"});
    }
  });

  return router;
};
