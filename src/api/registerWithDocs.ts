/* eslint-disable max-len */
/* eslint-disable camelcase */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
import express, {Request, Response} from "express";
import {initDbPool} from "../utils/db";
import {AppConfig} from "../main";

// Define a proper error interface
interface DatabaseError extends Error {
  code?: string;
  detail?: string;
  table?: string;
  constraint?: string;
}

export const getRegisterWithDocsRouter = (config: AppConfig) => {
  const router = express.Router();
  const pool = initDbPool(config);

  router.post("/", express.json({limit: "10mb"}), async (req: Request, res: Response) => {
    try {
      const {
        name,
        group_type_id,
        location,
        registration_number,
        description,
        requirements,
      } = req.body;

      if (
        !name || !group_type_id || !location || !registration_number ||
        !Array.isArray(requirements)
      ) {
        return res.status(400).json({error: "Missing required fields."});
      }

      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        const groupResult = await client.query(
          `INSERT INTO groups (
            name, group_type_id, location, description,
            registration_number, status
          ) VALUES ($1, $2, $3, $4, $5, 'pending') RETURNING id`,
          [name, group_type_id, location, description || null, registration_number]
        );

        const groupId = groupResult.rows[0].id;

        for (const doc of requirements) {
          await client.query(
            `INSERT INTO group_document_requirements (
              group_id, doc_type, is_required
            ) VALUES ($1, $2, $3)
            ON CONFLICT (group_id, doc_type)
            DO UPDATE SET is_required = EXCLUDED.is_required`,
            [groupId, doc.doc_type.trim(), doc.is_required]
          );

          if (doc.is_required && doc.file_path) {
            await client.query(
              `INSERT INTO group_documents (group_id, doc_type, file_path)
               VALUES ($1, $2, $3)`,
              [groupId, doc.doc_type.trim(), doc.file_path]
            );
          }
        }

        await client.query("COMMIT");
        return res.status(201).json({id: groupId, message: "Group registered successfully."});
      } catch (err: unknown) {
        await client.query("ROLLBACK");
        throw err; // Re-throw to be caught by outer catch
      } finally {
        client.release();
      }
    } catch (err: unknown) {
      // Type guard to check if it's an Error object
      const isError = (error: unknown): error is Error => {
        return error instanceof Error;
      };

      // Type guard for database errors
      const isDatabaseError = (error: unknown): error is DatabaseError => {
        return error instanceof Error && ("code" in error || "detail" in error);
      };

      console.error("❌ registerWithDocs error:", err);

      // Prepare error details
      let errorMessage = "Unknown error occurred";
      let errorDetails = {};

      if (isDatabaseError(err)) {
        errorMessage = err.message;
        errorDetails = {
          code: err.code,
          detail: err.detail,
          table: err.table,
          constraint: err.constraint,
        };
      } else if (isError(err)) {
        errorMessage = err.message;
        errorDetails = {
          stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
        };
      }

      return res.status(500).json({
        error: "Internal server error",
        message: errorMessage,
        ...(Object.keys(errorDetails).length > 0 && {details: errorDetails}),
        ...(process.env.NODE_ENV === "development" && {
          stack: isError(err) ? err.stack : undefined,
        }),
      });
    }
  });

  return router;
};
