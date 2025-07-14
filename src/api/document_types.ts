/* eslint-disable camelcase */
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

  // 🔎 GET all active document types
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

  // ➕ POST new document type (🔥 Fixed)
  router.post("/", (req, res) => {
    (async () => {
      const {doc_type} = req.body;

      if (!doc_type || typeof doc_type !== "string") {
        res.status(400).json({error: "Invalid or missing doc_type"});
        return;
      }

      try {
        await pool.query(
          `INSERT INTO group_document_types (doc_type, is_active)
           VALUES ($1, TRUE)
           ON CONFLICT (doc_type)
           DO UPDATE SET is_active = TRUE`,
          [doc_type]
        );
        res.status(201).json({message: "Document type added or reactivated"});
      } catch (err) {
        console.error("❌ Error adding document type:", err);
        res.status(500).json({error: "Failed to add document type"});
      }
    })().catch((err) => {
      console.error("❌ Unexpected async error:", err);
      res.status(500).json({error: "Unexpected failure"});
    });
  });

  // ❌ DELETE (soft) document type (🔥 Fixed)
  router.delete("/:doc_type", (req, res) => {
    (async () => {
      const {doc_type} = req.params;

      try {
        await pool.query(
          `UPDATE group_document_types SET is_active = FALSE
            WHERE doc_type = $1`,
          [doc_type]
        );
        res.status(200).json({message: "Document type deactivated"});
      } catch (err) {
        console.error("❌ Error deleting document type:", err);
        res.status(500).json({error: "Failed to delete document type"});
      }
    })().catch((err) => {
      console.error("❌ Unexpected async error:", err);
      res.status(500).json({error: "Unexpected failure"});
    });
  });

  return router;
};
