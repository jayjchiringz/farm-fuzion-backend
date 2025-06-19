/* eslint-disable camelcase */
import express from "express";
import {initDbPool} from "../utils/db";

export const getKycRouter = (config: {
  PGUSER: string;
  PGPASS: string;
  PGHOST: string;
  PGDB: string;
  PGPORT: string;
}) => {
  const pool = initDbPool(config);
  const router = express.Router();

  // Add JSON body parser middleware
  router.use(express.json());

  // 📤 Upload KYC Document
  router.post(
    "/upload",
    (req, res) => {
      (async () => {
        const {
          farmer_id: farmerId,
          group_id: groupId,
          doc_type: docType,
          doc_url: docUrl,
        } = req.body;

        if (!docType || !docUrl || (!farmerId && !groupId)) {
          return res.status(400).json({
            error:
              "doc_type, doc_url and (farmer_id or group_id) are required.",
          });
        }

        try {
          const result = await pool.query(
            `INSERT INTO kyc_documents (
              farmer_id, group_id, doc_type, doc_url
            ) VALUES ($1, $2, $3, $4)
            RETURNING *`,
            [farmerId || null, groupId || null, docType, docUrl]
          );

          return res.status(201).json({id: result.rows[0].id});
        } catch (err) {
          console.error("❌ KYC upload failed:", err);
          return res.status(500).json({error: "Internal server error"});
        }
      })();
    }
  );

  // 📥 Get Farmer KYC Docs
  router.get(
    "/farmer/:farmer_id",
    async (
      req: express.Request,
      res: express.Response
    ) => {
      const {farmer_id} = req.params;
      try {
        const result = await pool.query(
          "SELECT * FROM kyc_documents WHERE farmer_id = $1 " +
          "ORDER BY uploaded_at DESC",
          [farmer_id]
        );
        res.json(result.rows);
      } catch (err) {
        console.error("❌ Fetch farmer KYC failed:", err);
        res.status(500).json({error: "Internal server error"});
      }
    });

  // 📥 Get Group KYC Docs
  router.get(
    "/group/:group_id",
    async (
      req: express.Request,
      res: express.Response
    ) => {
      const {group_id} = req.params;
      try {
        const result = await pool.query(
          "SELECT * FROM kyc_documents WHERE group_id = $1 " +
          "ORDER BY uploaded_at DESC",
          [group_id]
        );
        res.json(result.rows);
      } catch (err) {
        console.error("❌ Fetch group KYC failed:", err);
        res.status(500).json({error: "Internal server error"});
      }
    }
  );

  return router;
};
