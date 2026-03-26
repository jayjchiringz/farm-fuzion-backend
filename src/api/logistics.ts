/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable max-len */
/* eslint-disable camelcase */
import express from "express";
import {z} from "zod";
import {initDbPool} from "../utils/db";
import axios from "axios";

const validateRequest = (schema: z.ZodSchema) => (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
): void => {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({error: result.error.errors[0].message});
    return;
  }
  next();
};

// PostXpress API configuration
const POSTXPRESS_URL = process.env.POSTXPRESS_URL || "https://postxpress.onrender.com";
const POSTXPRESS_API_KEY = process.env.POSTXPRESS_API_KEY;

// Middleware to forward authentication to PostXpress
const forwardToPostXpress = async (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      res.status(401).json({error: "No authentication token provided"});
      return; // Explicit return after response
    }

    // Store the token for use in routes
    req.headers["x-postxpress-token"] = authHeader;
    next(); // Call next middleware
    return; // Explicit return after next
  } catch (error) {
    console.error("Auth forwarding error:", error);
    res.status(500).json({error: "Authentication forwarding failed"});
    return; // Explicit return after error response
  }
};

export const getLogisticsRouter = (config: {
  PGUSER: string;
  PGPASS: string;
  PGHOST: string;
  PGDB: string;
  PGPORT: string;
}) => {
  const pool = initDbPool(config);
  const router = express.Router();

  // ============================================
  // PostXpress Integration Routes
  // ============================================

  // Get farmer's parcels from PostXpress
  router.get("/parcels", forwardToPostXpress, async (req, res) => {
    try {
      const token = req.headers["x-postxpress-token"] as string;

      const response = await axios.get(`${POSTXPRESS_URL}/api/farmer/parcels/`, {
        headers: {
          "Authorization": token,
          "X-API-Key": POSTXPRESS_API_KEY,
        },
      });

      res.json(response.data);
    } catch (error: any) {
      console.error("Error fetching parcels from PostXpress:", error.response?.data || error.message);
      res.status(error.response?.status || 500).json({
        error: "Failed to fetch parcels",
        details: error.response?.data,
      });
    }
  });

  // Create new parcel in PostXpress
  router.post("/parcels", forwardToPostXpress, async (req, res) => {
    try {
      const token = req.headers["x-postxpress-token"] as string;
      const parcelData = req.body;

      const response = await axios.post(`${POSTXPRESS_URL}/api/farmer/parcels/`, parcelData, {
        headers: {
          "Authorization": token,
          "X-API-Key": POSTXPRESS_API_KEY,
          "Content-Type": "application/json",
        },
      });

      res.status(201).json(response.data);
    } catch (error: any) {
      console.error("Error creating parcel in PostXpress:", error.response?.data || error.message);
      res.status(error.response?.status || 500).json({
        error: "Failed to create parcel",
        details: error.response?.data,
      });
    }
  });

  // Track parcel in PostXpress
  router.get("/track/:trackingNumber", forwardToPostXpress, async (req, res) => {
    try {
      const {trackingNumber} = req.params;
      const token = req.headers["x-postxpress-token"] as string;

      const response = await axios.get(`${POSTXPRESS_URL}/api/farmer/track/${trackingNumber}/`, {
        headers: {
          "Authorization": token,
          "X-API-Key": POSTXPRESS_API_KEY,
        },
      });

      res.json(response.data);
    } catch (error: any) {
      console.error("Error tracking parcel:", error.response?.data || error.message);
      res.status(error.response?.status || 500).json({
        error: "Failed to track parcel",
        details: error.response?.data,
      });
    }
  });

  // Get logistics dashboard (combines PostXpress and local logistics)
  router.get("/dashboard", forwardToPostXpress, async (req, res) => {
    try {
      const token = req.headers["x-postxpress-token"] as string;

      // Get PostXpress dashboard data
      const postxpressResponse = await axios.get(`${POSTXPRESS_URL}/api/farmer/dashboard/`, {
        headers: {
          "Authorization": token,
          "X-API-Key": POSTXPRESS_API_KEY,
        },
      });

      // Get local logistics data
      const localLogistics = await pool.query(
        "SELECT * FROM logistics ORDER BY created_at DESC LIMIT 10"
      );

      res.json({
        postxpress: postxpressResponse.data,
        local: localLogistics.rows,
      });
    } catch (error: any) {
      console.error("Error fetching dashboard:", error.response?.data || error.message);
      res.status(error.response?.status || 500).json({
        error: "Failed to fetch dashboard data",
        details: error.response?.data,
      });
    }
  });

  // ============================================
  // Existing Local Logistics Routes
  // ============================================

  router.post("/", validateRequest(z.object({
    farmer_id: z.string(),
    business_id: z.string(),
    vehicle_id: z.string().optional(),
    driver_name: z.string(),
    origin: z.string(),
    destination: z.string(),
    delivery_date: z.string(),
    status: z.enum(["scheduled", "en_route", "delivered"]).default("scheduled"),
  })), async (req, res) => {
    const {
      farmer_id,
      business_id,
      vehicle_id,
      driver_name,
      origin,
      destination,
      delivery_date,
      status = "scheduled",
    } = req.body;

    try {
      const result = await pool.query(
        `INSERT INTO logistics 
          (
            farmer_id,
            business_id,
            vehicle_id,
            driver_name,
            origin,
            destination,
            delivery_date,
            status
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          RETURNING id`,
        [
          farmer_id,
          business_id,
          vehicle_id || null,
          driver_name,
          origin,
          destination,
          delivery_date,
          status,
        ]
      );

      res.status(201).json({id: result.rows[0].id});
    } catch (err) {
      console.error("Error creating logistics record:", err);
      res.status(500).json({error: "Internal server error"});
    }
  });

  router.get("/", async (_, res) => {
    try {
      const result = await pool.query(
        "SELECT * FROM logistics ORDER BY created_at DESC"
      );
      res.json(result.rows);
    } catch (err) {
      console.error("Error fetching logistics:", err);
      res.status(500).json({error: "Internal server error"});
    }
  });

  router.get("/farmer/:farmer_id", async (req, res) => {
    try {
      const {farmer_id} = req.params;
      const result = await pool.query(
        "SELECT * FROM logistics WHERE farmer_id = $1 ORDER BY created_at DESC",
        [farmer_id]
      );
      res.json(result.rows);
    } catch (err) {
      console.error("Error fetching logistics by farmer:", err);
      res.status(500).json({error: "Internal server error"});
    }
  });

  router.put("/:id/status", async (req, res) => {
    const {id} = req.params;
    const {status} = req.body;

    if (!["scheduled", "en_route", "delivered"].includes(status)) {
      res.status(400).json({error: "Invalid status value"});
      return;
    }

    try {
      await pool.query("UPDATE logistics SET status = $1 WHERE id = $2", [
        status,
        id,
      ]);
      res.status(200).json({message: "Status updated"});
    } catch (err) {
      console.error("Error updating logistics status:", err);
      res.status(500).json({error: "Internal server error"});
    }
  });

  return router;
};
