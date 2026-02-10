/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable camelcase */
import express, {Request, Response, NextFunction} from "express";
import {z} from "zod";
import {initDbPool} from "../utils/db";
import {OpenAPIRegistry} from "@asteasolutions/zod-to-openapi";
import {
  FarmSeasonSchema,
  SeasonActivitySchema,
  FarmDiaryEntrySchema,
  FarmAlertSchema,
  CropPlanningRequestSchema,
  FarmDiaryEntry,
  CropPlanningRequest,
} from "../validation/farmActivitySchema";

// ✅ Local registry for farm activities
export const farmActivityRegistry = new OpenAPIRegistry();

// ✅ Register schemas
farmActivityRegistry.register("FarmSeason", FarmSeasonSchema);
farmActivityRegistry.register("SeasonActivity", SeasonActivitySchema);
farmActivityRegistry.register("FarmDiaryEntry", FarmDiaryEntrySchema);
farmActivityRegistry.register("FarmAlert", FarmAlertSchema);
farmActivityRegistry.register("CropPlanningRequest", CropPlanningRequestSchema);

// -------------------------------------
// Middleware for request body validation
// -------------------------------------
const validateRequest = (schema: z.ZodSchema) =>
  (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({error: result.error.errors[0].message});
      return;
    }
    next();
  };

// -------------------------------------
// Helper functions for intelligent planning
// -------------------------------------
class FarmActivityGenerator {
  private pool: any;

  constructor(pool: any) {
    this.pool = pool;
  }

  // Get crop details from catalog
  async getCropDetails(cropName: string) {
    const result = await this.pool.query(
      "SELECT * FROM farm_crops WHERE LOWER(crop_name) = LOWER($1)",
      [cropName]
    );
    return result.rows[0] || null;
  }

  // Get region data for planting calendar
  async getRegionData(location: string, county?: string) {
    let query = "SELECT * FROM farm_region_data WHERE 1=1";
    const params: string[] = [];

    if (county) {
      params.push(county.toLowerCase());
      query += ` AND LOWER(county) = $${params.length}`;
    } else {
      params.push(location.toLowerCase());
      query += ` AND LOWER(county) = $${params.length}`;
    }

    const result = await this.pool.query(query, params);
    return result.rows[0] || null;
  }

  // Generate timeline for common crops in Kenya
  generateTimeline(startDate: Date, cropName: string, acreage: number, regionData?: any) {
    const start = new Date(startDate);

    // Common activity patterns for Kenyan crops
    const cropPatterns: Record<string, any[]> = {
      "maize": [
        {day: -14, activity: "Land Preparation", type: "land_preparation", duration: 7, priority: "high"},
        {day: 0, activity: "Planting", type: "planting", duration: 3, priority: "critical"},
        {day: 7, activity: "Gap Filling", type: "planting", duration: 2, priority: "medium"},
        {day: 21, activity: "First Weeding", type: "weeding", duration: 5, priority: "high"},
        {day: 35, activity: "Top Dressing (CAN)", type: "fertilizer_application", duration: 3, priority: "high"},
        {day: 50, activity: "Second Weeding", type: "weeding", duration: 5, priority: "medium"},
        {day: 60, activity: "Pest Control", type: "pest_control", duration: 2, priority: "medium"},
        {day: 90, activity: "Disease Monitoring", type: "monitoring", duration: 1, priority: "low"},
        {day: 120, activity: "Harvesting", type: "harvesting", duration: 14, priority: "critical"},
        {day: 125, activity: "Drying & Storage", type: "post_harvest", duration: 7, priority: "high"},
      ],
      "beans": [
        {day: -7, activity: "Land Preparation", type: "land_preparation", duration: 5, priority: "high"},
        {day: 0, activity: "Planting", type: "planting", duration: 3, priority: "critical"},
        {day: 14, activity: "First Weeding", type: "weeding", duration: 4, priority: "high"},
        {day: 30, activity: "Second Weeding", type: "weeding", duration: 4, priority: "medium"},
        {day: 45, activity: "Pest Control", type: "pest_control", duration: 2, priority: "medium"},
        {day: 75, activity: "Harvesting", type: "harvesting", duration: 10, priority: "critical"},
      ],
      "tomatoes": [
        {day: -21, activity: "Nursery Preparation", type: "land_preparation", duration: 7, priority: "high"},
        {day: -14, activity: "Seed Sowing", type: "planting", duration: 1, priority: "critical"},
        {day: 0, activity: "Transplanting", type: "planting", duration: 5, priority: "critical"},
        {day: 14, activity: "Staking", type: "monitoring", duration: 3, priority: "medium"},
        {day: 21, activity: "First Top Dressing", type: "fertilizer_application", duration: 2, priority: "high"},
        {day: 35, activity: "Pest & Disease Control", type: "pest_control", duration: 2, priority: "high"},
        {day: 50, activity: "Second Top Dressing", type: "fertilizer_application", duration: 2, priority: "medium"},
        {day: 70, activity: "Harvesting", type: "harvesting", duration: 30, priority: "critical"},
      ],
      "kale": [
        {day: -7, activity: "Land Preparation", type: "land_preparation", duration: 5, priority: "high"},
        {day: 0, activity: "Planting", type: "planting", duration: 3, priority: "critical"},
        {day: 14, activity: "First Weeding", type: "weeding", duration: 3, priority: "high"},
        {day: 21, activity: "First Top Dressing", type: "fertilizer_application", duration: 2, priority: "high"},
        {day: 35, activity: "Second Weeding", type: "weeding", duration: 3, priority: "medium"},
        {day: 42, activity: "Second Top Dressing", type: "fertilizer_application", duration: 2, priority: "medium"},
        {day: 60, activity: "First Harvest", type: "harvesting", duration: 5, priority: "critical"},
        {day: 75, activity: "Regular Harvest", type: "harvesting", duration: 2, priority: "high"},
      ],
    };

    // Get pattern for crop (default to maize if not found)
    const pattern = cropPatterns[cropName.toLowerCase()] || cropPatterns.maize;

    // Adjust for acreage (scale duration)
    const acreageFactor = Math.max(0.5, Math.min(acreage / 2, 2));

    return pattern.map((item) => {
      const plannedDate = new Date(start);
      plannedDate.setDate(start.getDate() + item.day);

      const deadlineDate = new Date(plannedDate);
      deadlineDate.setDate(plannedDate.getDate() + item.duration * acreageFactor);

      return {
        activity_type: item.type,
        activity_name: item.activity,
        description: `${item.activity} for ${cropName} on ${acreage} acres`,
        planned_date: plannedDate.toISOString().split("T")[0],
        deadline_date: deadlineDate.toISOString().split("T")[0],
        priority: item.priority,
        cost_estimate: this.calculateCostEstimate(item.type, acreage),
        completion_percentage: 0,
      };
    });
  }

  // Calculate rough cost estimates
  calculateCostEstimate(activityType: string, acreage: number): number {
    const costsPerAcre: Record<string, number> = {
      "land_preparation": 2000,
      "planting": 1500,
      "weeding": 1200,
      "fertilizer_application": 5000,
      "pest_control": 3000,
      "irrigation": 800,
      "harvesting": 2500,
      "post_harvest": 1500,
      "monitoring": 500,
    };

    const baseCost = costsPerAcre[activityType] || 1000;
    return Math.round(baseCost * acreage * 100) / 100;
  }

  // Generate full season plan
  async generateSeasonPlan(request: CropPlanningRequest) {
    const {crop_name, location, county, acreage, start_date} = request;

    // 1. Get crop details
    const crop = await this.getCropDetails(crop_name);
    if (!crop) {
      throw new Error(`Crop '${crop_name}' not found in catalog`);
    }

    // 2. Get region data for planting window
    const regionData = await this.getRegionData(location, county);

    // 3. Determine season type based on month
    const startMonth = new Date(start_date).getMonth() + 1;
    let seasonType = "irrigated";
    if (regionData) {
      // Simple logic: Long rains (Mar-May), Short rains (Oct-Dec)
      if (startMonth >= 3 && startMonth <= 5) seasonType = "long_rains";
      else if (startMonth >= 10 && startMonth <= 12) seasonType = "short_rains";
    }

    // 4. Calculate expected end date
    const expectedEndDate = new Date(start_date);
    expectedEndDate.setDate(expectedEndDate.getDate() + crop.growth_days);

    // 5. Generate season name
    const seasonName = `${seasonType.replace("_", " ").toUpperCase()} ${crop_name} ${new Date().getFullYear()}`;

    // 6. Generate activities timeline
    const activities = this.generateTimeline(
      new Date(start_date),
      crop_name,
      acreage,
      regionData
    );

    return {
      season: {
        season_name: seasonName,
        season_type: seasonType,
        target_crop: crop_name,
        location,
        county,
        acreage,
        start_date,
        expected_end_date: expectedEndDate.toISOString().split("T")[0],
        status: "planned",
        weather_zone: regionData?.agro_ecological_zone,
        soil_type: request.soil_type,
      },
      activities,
    };
  }
}

// -------------------------------------
// Router factory
// -------------------------------------
export const getFarmActivitiesRouter = (config: {
  PGUSER: string;
  PGPASS: string;
  PGHOST: string;
  PGDB: string;
  PGPORT: string;
}) => {
  const pool = initDbPool(config);
  const activityGenerator = new FarmActivityGenerator(pool);
  const router = express.Router();

  // ==========================
  // GET /farm-activities/crops
  // ==========================
  farmActivityRegistry.registerPath({
    method: "get",
    path: "/farm-activities/crops",
    description: "Get list of available crops for planning",
    responses: {
      200: {
        description: "List of crops",
        content: {
          "application/json": {
            schema: z.object({
              data: z.array(z.object({
                id: z.string().uuid(),
                crop_name: z.string(),
                scientific_name: z.string().optional(),
                category: z.string(),
                growth_days: z.number(),
                description: z.string().optional(),
              })),
            }),
          },
        },
      },
      500: {description: "Internal server error"},
    },
  });

  router.get("/crops", async (_req, res) => {
    try {
      const result = await pool.query(
        "SELECT id, crop_name, scientific_name, category, growth_days, description FROM farm_crops ORDER BY crop_name"
      );
      res.json({data: result.rows});
    } catch (err) {
      console.error("Error fetching crops:", err);
      res.status(500).send("Internal server error");
    }
  });

  // ==========================
  // POST /farm-activities/plan
  // ==========================
  farmActivityRegistry.registerPath({
    method: "post",
    path: "/farm-activities/plan",
    description: "Generate intelligent farm season plan",
    request: {
      body: {
        content: {
          "application/json": {schema: CropPlanningRequestSchema},
        },
      },
    },
    responses: {
      200: {
        description: "Generated season plan",
        content: {
          "application/json": {
            schema: z.object({
              season: FarmSeasonSchema,
              activities: z.array(SeasonActivitySchema),
            }),
          },
        },
      },
      400: {description: "Validation error"},
      500: {description: "Internal server error"},
    },
  });

  router.post(
    "/plan",
    validateRequest(CropPlanningRequestSchema),
    async (req: Request<object, object, CropPlanningRequest>, res: Response) => {
      try {
        const plan = await activityGenerator.generateSeasonPlan(req.body);
        res.json(plan);
      } catch (err: any) {
        console.error("Error generating plan:", err);
        if (err.message.includes("not found")) {
          res.status(404).json({error: err.message});
        } else {
          res.status(500).send("Internal server error");
        }
      }
    }
  );

  // ==========================
  // POST /farm-activities/seasons
  // ==========================
  farmActivityRegistry.registerPath({
    method: "post",
    path: "/farm-activities/seasons",
    description: "Create a new farm season with activities",
    request: {
      body: {
        content: {
          "application/json": {
            schema: z.object({
              season: FarmSeasonSchema,
              activities: z.array(SeasonActivitySchema).optional(),
            }),
          },
        },
      },
    },
    responses: {
      201: {
        description: "Season created with activities",
        content: {
          "application/json": {
            schema: z.object({
              season_id: z.string().uuid(),
              activity_ids: z.array(z.string().uuid()),
            }),
          },
        },
      },
      400: {description: "Validation error"},
      500: {description: "Internal server error"},
    },
  });

  router.post(
    "/seasons",
    validateRequest(z.object({
      season: FarmSeasonSchema,
      activities: z.array(SeasonActivitySchema).optional(),
    })),
    async (req, res) => {
      const {season, activities = []} = req.body;

      try {
        await pool.query("BEGIN");

        // Create season
        const seasonResult = await pool.query(
          `INSERT INTO farm_seasons (
            farmer_id, season_name, season_type, target_crop, location, county,
            sub_county, acreage, start_date, expected_end_date, status,
            notes, weather_zone, soil_type, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW(), NOW())
          RETURNING id`,
          [
            season.farmer_id,
            season.season_name,
            season.season_type,
            season.target_crop,
            season.location,
            season.county,
            season.sub_county,
            season.acreage,
            season.start_date,
            season.expected_end_date,
            season.status || "planned",
            season.notes,
            season.weather_zone,
            season.soil_type,
          ]
        );

        const seasonId = seasonResult.rows[0].id;
        const activityIds: string[] = [];

        // Create activities
        for (const activity of activities) {
          const activityResult = await pool.query(
            `INSERT INTO season_activities (
              season_id, activity_type, activity_name, description,
              planned_date, deadline_date, status, priority, assigned_to,
              notes, cost_estimate, completion_percentage, created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW())
            RETURNING id`,
            [
              seasonId,
              activity.activity_type,
              activity.activity_name,
              activity.description,
              activity.planned_date,
              activity.deadline_date,
              activity.status || "pending",
              activity.priority,
              activity.assigned_to,
              activity.notes,
              activity.cost_estimate || 0,
              activity.completion_percentage || 0,
            ]
          );
          activityIds.push(activityResult.rows[0].id);
        }

        await pool.query("COMMIT");
        res.status(201).json({season_id: seasonId, activity_ids: activityIds});
      } catch (err) {
        await pool.query("ROLLBACK");
        console.error("Error creating season:", err);
        res.status(500).send("Internal server error");
      }
    }
  );

  // ==========================
  // GET /farm-activities/seasons/farmer/:farmer_id
  // ==========================
  farmActivityRegistry.registerPath({
    method: "get",
    path: "/farm-activities/seasons/farmer/{farmer_id}",
    description: "Get all seasons for a farmer with summary",
    parameters: [
      {
        name: "farmer_id",
        in: "path",
        required: true,
        schema: {type: "string", format: "uuid"},
      },
      {name: "status", in: "query", schema: {type: "string"}},
      {name: "year", in: "query", schema: {type: "integer"}},
    ],
    responses: {
      200: {
        description: "List of farmer seasons",
        content: {
          "application/json": {
            schema: z.object({
              data: z.array(FarmSeasonSchema),
              summary: z.object({
                total: z.number(),
                active: z.number(),
                completed: z.number(),
                planned: z.number(),
              }),
            }),
          },
        },
      },
      500: {description: "Internal server error"},
    },
  });

  router.get("/seasons/farmer/:farmer_id", async (req, res) => {
    try {
      const {farmer_id} = req.params;
      const {status, year} = req.query;

      let query = "FROM farm_seasons WHERE farmer_id = $1";
      const params: any[] = [farmer_id];

      if (status) {
        params.push(status);
        query += ` AND status = $${params.length}`;
      }

      if (year) {
        params.push(`${year}-01-01`);
        params.push(`${year}-12-31`);
        query += ` AND start_date BETWEEN $${params.length - 1} AND $${params.length}`;
      }

      // Get seasons
      const result = await pool.query(
        `SELECT * ${query} ORDER BY start_date DESC`,
        params
      );

      // Get summary counts
      const summaryResult = await pool.query(
        `SELECT 
          COUNT(*) as total,
          COUNT(CASE WHEN status = 'active' THEN 1 END) as active,
          COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
          COUNT(CASE WHEN status = 'planned' THEN 1 END) as planned
        FROM farm_seasons WHERE farmer_id = $1`,
        [farmer_id]
      );

      res.json({
        data: result.rows,
        summary: summaryResult.rows[0],
      });
    } catch (err) {
      console.error("Error fetching seasons:", err);
      res.status(500).send("Internal server error");
    }
  });

  // ==========================
  // GET /farm-activities/seasons/:season_id/activities
  // ==========================
  farmActivityRegistry.registerPath({
    method: "get",
    path: "/farm-activities/seasons/{season_id}/activities",
    description: "Get all activities for a season",
    parameters: [
      {
        name: "season_id",
        in: "path",
        required: true,
        schema: {type: "string", format: "uuid"},
      },
      {name: "status", in: "query", schema: {type: "string"}},
      {name: "type", in: "query", schema: {type: "string"}},
    ],
    responses: {
      200: {
        description: "List of season activities",
        content: {
          "application/json": {
            schema: z.object({
              data: z.array(SeasonActivitySchema),
              summary: z.object({
                total: z.number(),
                completed: z.number(),
                pending: z.number(),
                in_progress: z.number(),
                total_cost_estimate: z.number(),
                total_actual_cost: z.number(),
              }),
            }),
          },
        },
      },
      500: {description: "Internal server error"},
    },
  });

  router.get("/seasons/:season_id/activities", async (req, res) => {
    try {
      const {season_id} = req.params;
      const {status, type} = req.query;

      let query = "FROM season_activities WHERE season_id = $1";
      const params: any[] = [season_id];

      if (status) {
        params.push(status);
        query += ` AND status = $${params.length}`;
      }

      if (type) {
        params.push(type);
        query += ` AND activity_type = $${params.length}`;
      }

      // Get activities
      const result = await pool.query(
        `SELECT * ${query} ORDER BY planned_date`,
        params
      );

      // Get summary
      const summaryResult = await pool.query(
        `SELECT 
          COUNT(*) as total,
          COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
          COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
          COUNT(CASE WHEN status = 'in_progress' THEN 1 END) as in_progress,
          COALESCE(SUM(cost_estimate), 0) as total_cost_estimate,
          COALESCE(SUM(actual_cost), 0) as total_actual_cost
        FROM season_activities WHERE season_id = $1`,
        [season_id]
      );

      res.json({
        data: result.rows,
        summary: summaryResult.rows[0],
      });
    } catch (err) {
      console.error("Error fetching activities:", err);
      res.status(500).send("Internal server error");
    }
  });

  // ==========================
  // PUT /farm-activities/activities/:id
  // ==========================
  farmActivityRegistry.registerPath({
    method: "put",
    path: "/farm-activities/activities/{id}",
    description: "Update an activity (mark complete, change dates, etc)",
    parameters: [
      {
        name: "id",
        in: "path",
        required: true,
        schema: {type: "string", format: "uuid"},
      },
    ],
    request: {
      body: {
        content: {
          "application/json": {schema: SeasonActivitySchema.partial()},
        },
      },
    },
    responses: {
      200: {
        description: "Activity updated",
        content: {"application/json": {schema: SeasonActivitySchema}},
      },
      404: {description: "Activity not found"},
      500: {description: "Internal server error"},
    },
  });

  router.put("/activities/:id", async (req, res) => {
    const {id} = req.params;
    const updates = req.body;

    try {
      // Build dynamic update query
      const fields = [];
      const values = [];
      let paramIndex = 1;

      const fieldMap: Record<string, string> = {
        activity_type: "activity_type",
        activity_name: "activity_name",
        description: "description",
        planned_date: "planned_date",
        actual_date: "actual_date",
        deadline_date: "deadline_date",
        status: "status",
        priority: "priority",
        assigned_to: "assigned_to",
        notes: "notes",
        cost_estimate: "cost_estimate",
        actual_cost: "actual_cost",
        weather_notes: "weather_notes",
        completion_percentage: "completion_percentage",
      };

      for (const [key, value] of Object.entries(updates)) {
        if (fieldMap[key] && value !== undefined) {
          fields.push(`${fieldMap[key]} = $${paramIndex}`);
          values.push(value);
          paramIndex++;
        }
      }

      if (fields.length === 0) {
        return res.status(400).json({error: "No valid fields to update"});
      }

      fields.push("updated_at = NOW()");
      values.push(id);

      const result = await pool.query(
        `UPDATE season_activities 
         SET ${fields.join(", ")}
         WHERE id = $${paramIndex}
         RETURNING *`,
        values
      );

      if (result.rows.length === 0) {
        return res.status(404).json({error: "Activity not found"});
      }

      return res.json(result.rows[0]);
    } catch (err) {
      console.error("Error updating activity:", err);
      return res.status(500).send("Internal server error");
    }
  });

  // ==========================
  // POST /farm-activities/diary
  // ==========================
  farmActivityRegistry.registerPath({
    method: "post",
    path: "/farm-activities/diary",
    description: "Create a farm diary entry",
    request: {
      body: {
        content: {
          "application/json": {schema: FarmDiaryEntrySchema},
        },
      },
    },
    responses: {
      201: {
        description: "Diary entry created",
        content: {
          "application/json": {
            schema: z.object({id: z.string().uuid()}),
          },
        },
      },
      400: {description: "Validation error"},
      500: {description: "Internal server error"},
    },
  });

  router.post(
    "/diary",
    validateRequest(FarmDiaryEntrySchema),
    async (req: Request<object, object, FarmDiaryEntry>, res: Response) => {
      const {
        farmer_id,
        season_id,
        entry_date,
        title,
        entry_type,
        content,
        weather_condition,
        temperature,
        rainfall_mm,
        related_activity_id,
        tags,
        images_urls,
      } = req.body;

      try {
        const result = await pool.query(
          `INSERT INTO farm_diary_entries (
            farmer_id, season_id, entry_date, title, entry_type, content,
            weather_condition, temperature, rainfall_mm, related_activity_id,
            tags, images_urls, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW())
          RETURNING id`,
          [
            farmer_id,
            season_id || null,
            entry_date || new Date().toISOString().split("T")[0],
            title,
            entry_type,
            content,
            weather_condition || null,
            temperature || null,
            rainfall_mm || null,
            related_activity_id || null,
            tags || [],
            images_urls || [],
          ]
        );

        res.status(201).json({id: result.rows[0].id});
      } catch (err) {
        console.error("Error creating diary entry:", err);
        res.status(500).send("Internal server error");
      }
    }
  );

  // ==========================
  // GET /farm-activities/diary/farmer/:farmer_id
  // ==========================
  farmActivityRegistry.registerPath({
    method: "get",
    path: "/farm-activities/diary/farmer/{farmer_id}",
    description: "Get diary entries for a farmer",
    parameters: [
      {
        name: "farmer_id",
        in: "path",
        required: true,
        schema: {type: "string", format: "uuid"},
      },
      {name: "start_date", in: "query", schema: {type: "string", format: "date"}},
      {name: "end_date", in: "query", schema: {type: "string", format: "date"}},
      {name: "entry_type", in: "query", schema: {type: "string"}},
      {name: "season_id", in: "query", schema: {type: "string", format: "uuid"}},
      {name: "page", in: "query", schema: {type: "integer", minimum: 1}},
      {name: "limit", in: "query", schema: {type: "integer", minimum: 1}},
    ],
    responses: {
      200: {
        description: "Paginated diary entries",
        content: {
          "application/json": {
            schema: z.object({
              data: z.array(FarmDiaryEntrySchema),
              total: z.number(),
              page: z.number(),
              limit: z.number(),
            }),
          },
        },
      },
      500: {description: "Internal server error"},
    },
  });

  router.get("/diary/farmer/:farmer_id", async (req, res) => {
    try {
      const {farmer_id} = req.params;
      const {start_date, end_date, entry_type, season_id} = req.query;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const offset = (page - 1) * limit;

      let query = "FROM farm_diary_entries WHERE farmer_id = $1";
      const params: any[] = [farmer_id];
      let paramIndex = 2;

      if (start_date) {
        params.push(start_date);
        query += ` AND entry_date >= $${paramIndex}`;
        paramIndex++;
      }

      if (end_date) {
        params.push(end_date);
        query += ` AND entry_date <= $${paramIndex}`;
        paramIndex++;
      }

      if (entry_type) {
        params.push(entry_type);
        query += ` AND entry_type = $${paramIndex}`;
        paramIndex++;
      }

      if (season_id) {
        params.push(season_id);
        query += ` AND season_id = $${paramIndex}`;
        paramIndex++;
      }

      // Get total count
      const countResult = await pool.query(
        `SELECT COUNT(*) ${query}`,
        params
      );
      const total = parseInt(countResult.rows[0].count, 10);

      // Get paginated data
      params.push(limit);
      params.push(offset);
      const result = await pool.query(
        `SELECT * ${query} 
         ORDER BY entry_date DESC, created_at DESC
         LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
        params
      );

      res.json({data: result.rows, total, page, limit});
    } catch (err) {
      console.error("Error fetching diary entries:", err);
      res.status(500).send("Internal server error");
    }
  });

  // ==========================
  // GET /farm-activities/alerts/farmer/:farmer_id
  // ==========================
  farmActivityRegistry.registerPath({
    method: "get",
    path: "/farm-activities/alerts/farmer/{farmer_id}",
    description: "Get alerts and reminders for a farmer",
    parameters: [
      {
        name: "farmer_id",
        in: "path",
        required: true,
        schema: {type: "string", format: "uuid"},
      },
      {name: "status", in: "query", schema: {type: "string"}},
      {name: "priority", in: "query", schema: {type: "string"}},
      {name: "from_date", in: "query", schema: {type: "string", format: "date"}},
      {name: "to_date", in: "query", schema: {type: "string", format: "date"}},
    ],
    responses: {
      200: {
        description: "List of alerts",
        content: {
          "application/json": {
            schema: z.object({
              data: z.array(FarmAlertSchema),
              summary: z.object({
                pending: z.number(),
                high_priority: z.number(),
                today: z.number(),
              }),
            }),
          },
        },
      },
      500: {description: "Internal server error"},
    },
  });

  router.get("/alerts/farmer/:farmer_id", async (req, res) => {
    try {
      const {farmer_id} = req.params;
      const {status, priority, from_date, to_date} = req.query;

      let query = "FROM farm_alerts_reminders WHERE farmer_id = $1";
      const params: any[] = [farmer_id];
      let paramIndex = 2;

      if (status) {
        params.push(status);
        query += ` AND status = $${paramIndex}`;
        paramIndex++;
      }

      if (priority) {
        params.push(priority);
        query += ` AND priority = $${paramIndex}`;
        paramIndex++;
      }

      if (from_date) {
        params.push(from_date);
        query += ` AND alert_date >= $${paramIndex}`;
        paramIndex++;
      }

      if (to_date) {
        params.push(to_date);
        query += ` AND alert_date <= $${paramIndex}`;
        paramIndex++;
      }

      // Get alerts
      const result = await pool.query(
        `SELECT * ${query} ORDER BY alert_date, priority DESC`,
        params
      );

      // Get summary
      const today = new Date().toISOString().split("T")[0];
      const summaryResult = await pool.query(
        `SELECT 
          COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
          COUNT(CASE WHEN priority = 'high' OR priority = 'critical' THEN 1 END) as high_priority,
          COUNT(CASE WHEN alert_date = $2 THEN 1 END) as today
        FROM farm_alerts_reminders WHERE farmer_id = $1`,
        [farmer_id, today]
      );

      res.json({
        data: result.rows,
        summary: summaryResult.rows[0],
      });
    } catch (err) {
      console.error("Error fetching alerts:", err);
      res.status(500).send("Internal server error");
    }
  });

  // ==========================
  // PUT /farm-activities/alerts/:id/status
  // ==========================
  farmActivityRegistry.registerPath({
    method: "put",
    path: "/farm-activities/alerts/{id}/status",
    description: "Update alert status (mark as read/dismissed)",
    parameters: [
      {
        name: "id",
        in: "path",
        required: true,
        schema: {type: "string", format: "uuid"},
      },
    ],
    request: {
      body: {
        content: {
          "application/json": {
            schema: z.object({status: z.enum(["sent", "read", "dismissed"])}),
          },
        },
      },
    },
    responses: {
      200: {
        description: "Alert status updated",
        content: {"application/json": {schema: FarmAlertSchema}},
      },
      404: {description: "Alert not found"},
      500: {description: "Internal server error"},
    },
  });

  router.put("/alerts/:id/status", async (req, res) => {
    const {id} = req.params;
    const {status} = req.body;

    try {
      const result = await pool.query(
        `UPDATE farm_alerts_reminders 
         SET status = $1, updated_at = NOW()
         WHERE id = $2
         RETURNING *`,
        [status, id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({error: "Alert not found"});
      }

      return res.json(result.rows[0]);
    } catch (err) {
      console.error("Error updating alert:", err);
      return res.status(500).send("Internal server error");
    }
  });

  // ==========================
  // GET /farm-activities/dashboard/:farmer_id
  // ==========================
  farmActivityRegistry.registerPath({
    method: "get",
    path: "/farm-activities/dashboard/{farmer_id}",
    description: "Get farm activity dashboard summary",
    parameters: [
      {
        name: "farmer_id",
        in: "path",
        required: true,
        schema: {type: "string", format: "uuid"},
      },
    ],
    responses: {
      200: {
        description: "Dashboard summary",
        content: {
          "application/json": {
            schema: z.object({
              seasons_summary: z.object({
                total: z.number(),
                active: z.number(),
                upcoming: z.number(),
              }),
              activities_summary: z.object({
                total: z.number(),
                completed: z.number(),
                pending: z.number(),
                overdue: z.number(),
              }),
              recent_diary_entries: z.array(FarmDiaryEntrySchema),
              upcoming_alerts: z.array(FarmAlertSchema),
              season_progress: z.array(z.object({
                season_id: z.string().uuid(),
                season_name: z.string(),
                progress_percentage: z.number(),
                next_activity: SeasonActivitySchema.optional(),
              })),
            }),
          },
        },
      },
      500: {description: "Internal server error"},
    },
  });

  router.get("/dashboard/:farmer_id", async (req, res) => {
    try {
      const {farmer_id} = req.params;
      const today = new Date().toISOString().split("T")[0];
      const nextWeek = new Date();
      nextWeek.setDate(nextWeek.getDate() + 7);

      // Get seasons summary
      const seasonsResult = await pool.query(
        `SELECT 
          COUNT(*) as total,
          COUNT(CASE WHEN status = 'active' THEN 1 END) as active,
          COUNT(CASE WHEN status = 'planned' AND start_date > $2 THEN 1 END) as upcoming
        FROM farm_seasons WHERE farmer_id = $1`,
        [farmer_id, today]
      );

      // Get activities summary
      const activitiesResult = await pool.query(
        `SELECT 
          COUNT(*) as total,
          COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
          COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
          COUNT(CASE WHEN status = 'pending' AND deadline_date < $2 THEN 1 END) as overdue
        FROM season_activities sa
        JOIN farm_seasons fs ON sa.season_id = fs.id
        WHERE fs.farmer_id = $1`,
        [farmer_id, today]
      );

      // Get recent diary entries (last 5)
      const diaryResult = await pool.query(
        `SELECT * FROM farm_diary_entries 
         WHERE farmer_id = $1 
         ORDER BY entry_date DESC, created_at DESC 
         LIMIT 5`,
        [farmer_id]
      );

      // Get upcoming alerts (next 7 days)
      const alertsResult = await pool.query(
        `SELECT * FROM farm_alerts_reminders 
         WHERE farmer_id = $1 
           AND alert_date BETWEEN $2 AND $3
           AND status IN ('pending', 'sent')
         ORDER BY alert_date, priority DESC 
         LIMIT 10`,
        [farmer_id, today, nextWeek.toISOString().split("T")[0]]
      );

      // Get season progress
      const progressResult = await pool.query(
        `WITH season_stats AS (
          SELECT 
            fs.id as season_id,
            fs.season_name,
            COUNT(sa.id) as total_activities,
            COUNT(CASE WHEN sa.status = 'completed' THEN 1 END) as completed_activities
          FROM farm_seasons fs
          LEFT JOIN season_activities sa ON fs.id = sa.season_id
          WHERE fs.farmer_id = $1 AND fs.status IN ('active', 'planned')
          GROUP BY fs.id, fs.season_name
        ),
        next_activities AS (
          SELECT DISTINCT ON (sa.season_id) 
            sa.season_id,
            sa.*
          FROM season_activities sa
          JOIN farm_seasons fs ON sa.season_id = fs.id
          WHERE fs.farmer_id = $1 
            AND sa.status = 'pending'
            AND sa.planned_date >= $2
          ORDER BY sa.season_id, sa.planned_date
        )
        SELECT 
          ss.season_id,
          ss.season_name,
          CASE 
            WHEN ss.total_activities = 0 THEN 0
            ELSE ROUND((ss.completed_activities::DECIMAL / ss.total_activities) * 100, 1)
          END as progress_percentage,
          row_to_json(na) as next_activity
        FROM season_stats ss
        LEFT JOIN next_activities na ON ss.season_id = na.season_id`,
        [farmer_id, today]
      );

      res.json({
        seasons_summary: seasonsResult.rows[0],
        activities_summary: activitiesResult.rows[0],
        recent_diary_entries: diaryResult.rows,
        upcoming_alerts: alertsResult.rows,
        season_progress: progressResult.rows,
      });
    } catch (err) {
      console.error("Error fetching dashboard:", err);
      res.status(500).send("Internal server error");
    }
  });

  return router;
};
