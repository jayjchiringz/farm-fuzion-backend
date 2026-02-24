/* eslint-disable camelcase */
/* eslint-disable max-len */
import express, {Request, Response} from "express";
import {initDbPool} from "../utils/db";
import {Pool} from "pg";
import multer from "multer";
import {z} from "zod";

// Extend Express Request to include multer file
interface MulterRequest extends Request {
  file?: Express.Multer.File;
}

// Validation schemas
const ServiceProviderSchema = z.object({
  user_id: z.string().uuid(),
  business_name: z.string().min(2),
  business_registration: z.string().optional(),
  service_category: z.string(),
  description: z.string().optional(),
  phone: z.string().min(10),
  email: z.string().email().optional(),
  website: z.string().url().optional(),
  county: z.string().optional(),
  constituency: z.string().optional(),
  ward: z.string().optional(),
  location: z.string().optional(),
  years_of_experience: z.number().optional(),
});

const ServiceSchema = z.object({
  provider_id: z.string().uuid(),
  service_name: z.string().min(2),
  description: z.string().optional(),
  category: z.string(),
  price: z.number().optional(),
  price_unit: z.string().optional(),
  is_negotiable: z.boolean().default(true),
  service_area: z.string().optional(),
  availability: z.string().optional(),
  estimated_duration: z.string().optional(),
});

const ServiceBookingSchema = z.object({
  farmer_id: z.string().uuid(),
  provider_id: z.string().uuid(),
  service_id: z.string().uuid(),
  booking_date: z.string(),
  booking_time: z.string().optional(),
  location: z.string().optional(),
  notes: z.string().optional(),
});

const ServiceReviewSchema = z.object({
  booking_id: z.string().uuid(),
  farmer_id: z.string().uuid(),
  provider_id: z.string().uuid(),
  rating: z.number().min(1).max(5),
  review: z.string().optional(),
  would_recommend: z.boolean().default(true),
});

// Configure multer for file uploads
const upload = multer({
  limits: {fileSize: 5 * 1024 * 1024}, // 5MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/") || file.mimetype === "application/pdf") {
      cb(null, true);
    } else {
      cb(new Error("Only images and PDFs are allowed"));
    }
  },
});

export const getServicesRouter = (config: {
  PGUSER: string;
  PGPASS: string;
  PGHOST: string;
  PGDB: string;
  PGPORT: string;
}) => {
  const pool: Pool = initDbPool(config);
  const router = express.Router();

  // ============================================
  // SERVICE PROVIDER ENDPOINTS
  // ============================================

  // Register as a service provider
  router.post("/providers/register", upload.single("verification_document"), async (req: Request, res: Response): Promise<Response> => {
    try {
      const validated = ServiceProviderSchema.parse(req.body);
      const multerReq = req as MulterRequest;
      const verificationFile = multerReq.file;

      // Check if user is already a provider
      const existing = await pool.query(
        "SELECT id FROM service_providers WHERE user_id = $1",
        [validated.user_id]
      );

      if (existing.rows.length > 0) {
        return res.status(400).json({error: "User is already registered as a service provider"});
      }

      // Upload verification document if provided
      let verificationPath = null;
      if (verificationFile) {
        // In a real implementation, upload to Firebase Storage
        // For now, store the filename
        verificationPath = verificationFile.originalname;
      }

      const result = await pool.query(
        `INSERT INTO service_providers (
          user_id, business_name, business_registration, service_category,
          description, phone, email, website, county, constituency, ward,
          location, years_of_experience, verification_document_path, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'pending')
        RETURNING *`,
        [
          validated.user_id,
          validated.business_name,
          validated.business_registration,
          validated.service_category,
          validated.description,
          validated.phone,
          validated.email,
          validated.website,
          validated.county,
          validated.constituency,
          validated.ward,
          validated.location,
          validated.years_of_experience,
          verificationPath,
        ]
      );

      return res.status(201).json({
        success: true,
        message: "Service provider registration submitted for review",
        provider: result.rows[0],
      });
    } catch (err) {
      console.error("Error registering service provider:", err);
      if (err instanceof z.ZodError) {
        return res.status(400).json({error: "Validation failed", details: err.errors});
      }
      return res.status(500).json({error: "Failed to register service provider"});
    }
  });

  // Get all service providers with optional filters
  router.get("/providers", async (req: Request, res: Response): Promise<Response> => {
    try {
      const {category, county, search, verified, page = 1, limit = 10} = req.query;
      const offset = (Number(page) - 1) * Number(limit);

      let query = `
        SELECT 
          sp.*,
          COALESCE(AVG(sr.rating), 0) as avg_rating,
          COUNT(DISTINCT sr.id) as review_count,
          COUNT(DISTINCT s.id) as service_count
        FROM service_providers sp
        LEFT JOIN service_reviews sr ON sp.id = sr.provider_id
        LEFT JOIN services s ON sp.id = s.provider_id
        WHERE sp.status = 'active'
      `;
      const params: (string | number | boolean)[] = [];
      let paramCount = 0;

      if (category) {
        paramCount++;
        query += ` AND sp.service_category = $${paramCount}`;
        params.push(category as string);
      }

      if (county) {
        paramCount++;
        query += ` AND sp.county = $${paramCount}`;
        params.push(county as string);
      }

      if (search) {
        paramCount++;
        query += ` AND (sp.business_name ILIKE $${paramCount} OR sp.description ILIKE $${paramCount})`;
        params.push(`%${search}%`);
      }

      if (verified === "true") {
        query += " AND sp.is_verified = true";
      }

      query += ` GROUP BY sp.id ORDER BY avg_rating DESC, sp.created_at DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
      params.push(Number(limit), offset);

      const result = await pool.query(query, params);

      // Get total count for pagination
      const countResult = await pool.query(
        "SELECT COUNT(*) FROM service_providers WHERE status = 'active'"
      );

      return res.json({
        data: result.rows,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total: parseInt(countResult.rows[0].count),
          totalPages: Math.ceil(parseInt(countResult.rows[0].count) / Number(limit)),
        },
      });
    } catch (err) {
      console.error("Error fetching service providers:", err);
      return res.status(500).json({error: "Failed to fetch service providers"});
    }
  });

  // Get provider details by ID (update the reviews section)
  router.get("/providers/:id", async (req: Request, res: Response): Promise<Response> => {
    try {
      const {id} = req.params;

      const provider = await pool.query(
        `SELECT 
          sp.*,
          COALESCE(AVG(sr.rating), 0) as avg_rating,
          COUNT(DISTINCT sr.id) as review_count
        FROM service_providers sp
        LEFT JOIN service_reviews sr ON sp.id = sr.provider_id
        WHERE sp.id = $1
        GROUP BY sp.id`,
        [id]
      );

      if (provider.rows.length === 0) {
        return res.status(404).json({error: "Service provider not found"});
      }

      // Get provider's services
      const services = await pool.query(
        "SELECT * FROM services WHERE provider_id = $1 ORDER BY created_at DESC",
        [id]
      );

      // In queries that join with farmers, use farmers.user_id
      const reviews = await pool.query(
        `SELECT sr.*, f.first_name, f.last_name 
        FROM service_reviews sr
        JOIN farmers f ON sr.farmer_id = f.user_id  -- Use f.user_id, not f.id
        WHERE sr.provider_id = $1
        ORDER BY sr.created_at DESC
        LIMIT 10`,
        [id]
      );

      // Get availability
      const availability = await pool.query(
        "SELECT * FROM provider_availability WHERE provider_id = $1 ORDER BY day_of_week",
        [id]
      );

      return res.json({
        ...provider.rows[0],
        services: services.rows,
        reviews: reviews.rows,
        availability: availability.rows,
      });
    } catch (err) {
      console.error("Error fetching provider details:", err);
      return res.status(500).json({error: "Failed to fetch provider details"});
    }
  });

  // ============================================
  // SERVICES ENDPOINTS
  // ============================================

  // Add a service to a provider
  router.post("/services", async (req: Request, res: Response): Promise<Response> => {
    try {
      const validated = ServiceSchema.parse(req.body);

      // Verify provider exists and is active
      const provider = await pool.query(
        "SELECT id FROM service_providers WHERE id = $1 AND status = 'active'",
        [validated.provider_id]
      );

      if (provider.rows.length === 0) {
        return res.status(404).json({error: "Provider not found or not active"});
      }

      const result = await pool.query(
        `INSERT INTO services (
          provider_id, service_name, description, category, price,
          price_unit, is_negotiable, service_area, availability, estimated_duration
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *`,
        [
          validated.provider_id,
          validated.service_name,
          validated.description,
          validated.category,
          validated.price,
          validated.price_unit,
          validated.is_negotiable,
          validated.service_area,
          validated.availability,
          validated.estimated_duration,
        ]
      );

      return res.status(201).json(result.rows[0]);
    } catch (err) {
      console.error("Error creating service:", err);
      if (err instanceof z.ZodError) {
        return res.status(400).json({error: "Validation failed", details: err.errors});
      }
      return res.status(500).json({error: "Failed to create service"});
    }
  });

  // Search services
  router.get("/services/search", async (req: Request, res: Response): Promise<Response> => {
    try {
      const {category, provider_id, min_price, max_price, search, page = 1, limit = 10} = req.query;
      const offset = (Number(page) - 1) * Number(limit);

      let query = `
        SELECT 
          s.*,
          sp.business_name,
          sp.service_category as provider_category,
          sp.county,
          sp.phone,
          sp.is_verified,
          COALESCE(AVG(sr.rating), 0) as provider_rating
        FROM services s
        JOIN service_providers sp ON s.provider_id = sp.id
        LEFT JOIN service_reviews sr ON sp.id = sr.provider_id
        WHERE sp.status = 'active'
      `;
      const params: (string | number | boolean)[] = [];
      let paramCount = 0;

      if (category) {
        paramCount++;
        query += ` AND s.category = $${paramCount}`;
        params.push(category as string);
      }

      if (provider_id) {
        paramCount++;
        query += ` AND s.provider_id = $${paramCount}`;
        params.push(provider_id as string);
      }

      if (min_price) {
        paramCount++;
        query += ` AND s.price >= $${paramCount}`;
        params.push(Number(min_price));
      }

      if (max_price) {
        paramCount++;
        query += ` AND s.price <= $${paramCount}`;
        params.push(Number(max_price));
      }

      if (search) {
        paramCount++;
        query += ` AND (s.service_name ILIKE $${paramCount} OR s.description ILIKE $${paramCount})`;
        params.push(`%${search}%`);
      }

      query += ` GROUP BY s.id, sp.id ORDER BY provider_rating DESC, s.created_at DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
      params.push(Number(limit), offset);

      const result = await pool.query(query, params);

      // Get total count
      const countQuery = `
        SELECT COUNT(*) FROM services s
        JOIN service_providers sp ON s.provider_id = sp.id
        WHERE sp.status = 'active'
      `;
      const countResult = await pool.query(countQuery);

      return res.json({
        data: result.rows,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total: parseInt(countResult.rows[0].count),
          totalPages: Math.ceil(parseInt(countResult.rows[0].count) / Number(limit)),
        },
      });
    } catch (err) {
      console.error("Error searching services:", err);
      return res.status(500).json({error: "Failed to search services"});
    }
  });

  // ============================================
  // BOOKINGS ENDPOINTS
  // ============================================

  // Create a service booking
  router.post("/bookings", async (req: Request, res: Response): Promise<Response> => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const validated = ServiceBookingSchema.parse(req.body);

      // Check if provider is available at that time
      const existingBookings = await client.query(
        `SELECT id FROM service_bookings 
         WHERE provider_id = $1 AND booking_date = $2 AND status IN ('pending', 'confirmed')`,
        [validated.provider_id, validated.booking_date]
      );

      if (existingBookings.rows.length > 5) {
        await client.query("ROLLBACK");
        return res.status(400).json({error: "Provider is fully booked on this date"});
      }

      // Get service price
      const service = await client.query(
        "SELECT price FROM services WHERE id = $1",
        [validated.service_id]
      );

      const total_price = service.rows[0]?.price || 0;

      const result = await client.query(
        `INSERT INTO service_bookings (
          farmer_id, provider_id, service_id, booking_date, booking_time,
          location, notes, total_price, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending')
        RETURNING *`,
        [
          validated.farmer_id,
          validated.provider_id,
          validated.service_id,
          validated.booking_date,
          validated.booking_time,
          validated.location,
          validated.notes,
          total_price,
        ]
      );

      await client.query("COMMIT");
      return res.status(201).json(result.rows[0]);
    } catch (err) {
      await client.query("ROLLBACK");
      console.error("Error creating booking:", err);
      if (err instanceof z.ZodError) {
        return res.status(400).json({error: "Validation failed", details: err.errors});
      }
      return res.status(500).json({error: "Failed to create booking"});
    } finally {
      client.release();
    }
  });

  // Get farmer's bookings
  router.get("/bookings/farmer/:farmerId", async (req: Request, res: Response): Promise<Response> => {
    try {
      const {farmerId} = req.params;
      const {status, page = 1, limit = 10} = req.query;
      const offset = (Number(page) - 1) * Number(limit);

      // For provider bookings
      let query = `
        SELECT 
          sb.*,
          f.first_name,
          f.last_name,
          f.phone as farmer_phone,
          s.service_name
        FROM service_bookings sb
        JOIN farmers f ON sb.farmer_id = f.user_id  -- Use f.user_id
        JOIN services s ON sb.service_id = s.id
        WHERE sb.provider_id = $1
      `;

      const params: (string | number)[] = [farmerId];
      let paramCount = 1;

      if (status) {
        paramCount++;
        query += ` AND sb.status = $${paramCount}`;
        params.push(status as string);
      }

      query += ` ORDER BY sb.booking_date DESC, sb.created_at DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
      params.push(Number(limit), offset);

      const result = await pool.query(query, params);

      // Get total count
      const countQuery = "SELECT COUNT(*) FROM service_bookings WHERE farmer_id = $1";
      const countResult = await pool.query(countQuery, [farmerId]);

      return res.json({
        data: result.rows,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total: parseInt(countResult.rows[0].count),
          totalPages: Math.ceil(parseInt(countResult.rows[0].count) / Number(limit)),
        },
      });
    } catch (err) {
      console.error("Error fetching farmer bookings:", err);
      return res.status(500).json({error: "Failed to fetch bookings"});
    }
  });

  // Get provider's bookings - FIXED
  router.get("/bookings/provider/:providerId", async (req: Request, res: Response): Promise<Response> => {
    try {
      const {providerId} = req.params;
      const {status, date, page = 1, limit = 10} = req.query;
      const offset = (Number(page) - 1) * Number(limit);

      let query = `
        SELECT 
          sb.*,
          f.first_name,
          f.last_name,
          f.phone as farmer_phone,
          s.service_name
        FROM service_bookings sb
        JOIN farmers f ON sb.farmer_id = f.id  -- Changed from f.user_id to f.id
        JOIN services s ON sb.service_id = s.id
        WHERE sb.provider_id = $1
      `;
      const params: (string | number)[] = [providerId];
      let paramCount = 1;

      if (status) {
        paramCount++;
        query += ` AND sb.status = $${paramCount}`;
        params.push(status as string);
      }

      if (date) {
        paramCount++;
        query += ` AND sb.booking_date = $${paramCount}`;
        params.push(date as string);
      }

      query += ` ORDER BY sb.booking_date DESC, sb.created_at DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
      params.push(Number(limit), offset);

      const result = await pool.query(query, params);

      // Get total count
      const countQuery = "SELECT COUNT(*) FROM service_bookings WHERE provider_id = $1";
      const countResult = await pool.query(countQuery, [providerId]);

      return res.json({
        data: result.rows,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total: parseInt(countResult.rows[0].count),
          totalPages: Math.ceil(parseInt(countResult.rows[0].count) / Number(limit)),
        },
      });
    } catch (err) {
      console.error("Error fetching provider bookings:", err);
      return res.status(500).json({error: "Failed to fetch bookings"});
    }
  });

  // Update booking status (for providers)
  router.patch("/bookings/:id/status", async (req: Request, res: Response): Promise<Response> => {
    try {
      const {id} = req.params;
      const {status, provider_id} = req.body;

      // Verify provider owns this booking
      const booking = await pool.query(
        "SELECT provider_id FROM service_bookings WHERE id = $1",
        [id]
      );

      if (booking.rows.length === 0) {
        return res.status(404).json({error: "Booking not found"});
      }

      if (booking.rows[0].provider_id !== provider_id) {
        return res.status(403).json({error: "Not authorized to update this booking"});
      }

      const result = await pool.query(
        `UPDATE service_bookings 
         SET status = $1, updated_at = NOW()
         WHERE id = $2
         RETURNING *`,
        [status, id]
      );

      return res.json(result.rows[0]);
    } catch (err) {
      console.error("Error updating booking status:", err);
      return res.status(500).json({error: "Failed to update booking"});
    }
  });

  // ============================================
  // REVIEWS ENDPOINTS
  // ============================================

  // Submit a review
  router.post("/reviews", async (req: Request, res: Response): Promise<Response> => {
    try {
      const validated = ServiceReviewSchema.parse(req.body);

      // Check if booking exists and is completed
      const booking = await pool.query(
        "SELECT id FROM service_bookings WHERE id = $1 AND farmer_id = $2 AND status = 'completed'",
        [validated.booking_id, validated.farmer_id]
      );

      if (booking.rows.length === 0) {
        return res.status(400).json({error: "Cannot review - booking not completed or not found"});
      }

      // Check if already reviewed
      const existing = await pool.query(
        "SELECT id FROM service_reviews WHERE booking_id = $1",
        [validated.booking_id]
      );

      if (existing.rows.length > 0) {
        return res.status(400).json({error: "This booking has already been reviewed"});
      }

      const result = await pool.query(
        `INSERT INTO service_reviews (
          booking_id, farmer_id, provider_id, rating, review, would_recommend
        ) VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *`,
        [
          validated.booking_id,
          validated.farmer_id,
          validated.provider_id,
          validated.rating,
          validated.review,
          validated.would_recommend,
        ]
      );

      // Update provider's average rating
      await pool.query(
        `UPDATE service_providers 
         SET rating = (
           SELECT COALESCE(AVG(rating), 0) 
           FROM service_reviews 
           WHERE provider_id = $1
         )
         WHERE id = $1`,
        [validated.provider_id]
      );

      return res.status(201).json(result.rows[0]);
    } catch (err) {
      console.error("Error submitting review:", err);
      if (err instanceof z.ZodError) {
        return res.status(400).json({error: "Validation failed", details: err.errors});
      }
      return res.status(500).json({error: "Failed to submit review"});
    }
  });

  // Get provider reviews - FIXED
  router.get("/reviews/provider/:providerId", async (req: Request, res: Response): Promise<Response> => {
    try {
      const {providerId} = req.params;
      const {page = 1, limit = 10} = req.query;
      const offset = (Number(page) - 1) * Number(limit);

      // For reviews
      const result = await pool.query(
        `SELECT 
          sr.*,
          f.first_name,
          f.last_name
        FROM service_reviews sr
        JOIN farmers f ON sr.farmer_id = f.user_id  -- Use f.user_id
        WHERE sr.provider_id = $1
        ORDER BY sr.created_at DESC
        LIMIT $2 OFFSET $3`,
        [providerId, Number(limit), offset]
      );

      // Get total count
      const countQuery = "SELECT COUNT(*) FROM service_reviews WHERE provider_id = $1";
      const countResult = await pool.query(countQuery, [providerId]);

      return res.json({
        data: result.rows,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total: parseInt(countResult.rows[0].count),
          totalPages: Math.ceil(parseInt(countResult.rows[0].count) / Number(limit)),
        },
      });
    } catch (err) {
      console.error("Error fetching provider reviews:", err);
      return res.status(500).json({error: "Failed to fetch reviews"});
    }
  });

  return router;
};
