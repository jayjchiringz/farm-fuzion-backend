/* eslint-disable max-len */
import {z} from "zod";

// Farm Season Schema - Using integer IDs to match existing schema
export const FarmSeasonSchema = z.object({
  id: z.number().int().optional(),
  farmer_id: z.number().int(),
  season_name: z.string().min(2, "Season name required"),
  season_type: z.enum(["long_rains", "short_rains", "dry_season", "irrigated"]),
  target_crop: z.string().min(2, "Target crop required"),
  location: z.string().min(2, "Location required"),
  county: z.string().optional(),
  sub_county: z.string().optional(),
  acreage: z.number().positive("Acreage must be positive"),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  expected_end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  status: z.enum(["planned", "active", "completed", "cancelled"]).optional(),
  notes: z.string().optional(),
  weather_zone: z.string().optional(),
  soil_type: z.string().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

// Season Activity Schema - For CREATION (season_id optional)
export const SeasonActivityCreateSchema = z.object({
  id: z.number().int().optional(),
  season_id: z.number().int().optional(), // Make optional for creation
  activity_type: z.enum([
    "land_preparation",
    "planting",
    "fertilizer_application",
    "pest_control",
    "weeding",
    "irrigation",
    "harvesting",
    "post_harvest",
    "monitoring",
  ]),
  activity_name: z.string().min(2, "Activity name required"),
  description: z.string().optional(),
  planned_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  actual_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  deadline_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  status: z.enum(["pending", "in_progress", "completed", "delayed", "cancelled"]).optional(),
  priority: z.enum(["low", "medium", "high", "critical"]).optional(),
  assigned_to: z.string().optional(),
  notes: z.string().optional(),
  cost_estimate: z.number().nonnegative().optional(),
  actual_cost: z.number().nonnegative().optional(),
  weather_notes: z.string().optional(),
  completion_percentage: z.number().min(0).max(100).optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

// Season Activity Schema - For READ operations (season_id required)
export const SeasonActivitySchema = SeasonActivityCreateSchema.extend({
  season_id: z.number().int(), // Required for existing records
  id: z.number().int(), // Required for existing records
});

// Combined schema for season creation with activities
export const CreateSeasonWithActivitiesSchema = z.object({
  season: FarmSeasonSchema,
  activities: z.array(SeasonActivityCreateSchema).optional().default([]),
});

// Farm Diary Entry Schema
export const FarmDiaryEntrySchema = z.object({
  id: z.number().int().optional(),
  farmer_id: z.number().int(),
  season_id: z.number().int().optional(),
  entry_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  title: z.string().optional(),
  entry_type: z.enum(["observation", "issue", "milestone", "weather", "expense", "harvest", "learning"]),
  content: z.string().min(1, "Content required"),
  weather_condition: z.string().optional(),
  temperature: z.number().optional(),
  rainfall_mm: z.number().optional(),
  related_activity_id: z.number().int().optional(),
  tags: z.array(z.string()).optional(),
  images_urls: z.array(z.string()).optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

// Farm Alert Schema
export const FarmAlertSchema = z.object({
  id: z.number().int().optional(),
  farmer_id: z.number().int(),
  season_id: z.number().int().optional(),
  activity_id: z.number().int().optional(),
  alert_type: z.enum(["reminder", "warning", "system", "weather", "market"]),
  title: z.string().min(2, "Title required"),
  message: z.string().min(5, "Message required"),
  alert_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  alert_time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  status: z.enum(["pending", "sent", "read", "dismissed"]).optional(),
  priority: z.enum(["low", "medium", "high", "critical"]).optional(),
  repeat_pattern: z.string().optional(),
  repeat_until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  action_url: z.string().url().optional(),
  metadata: z.record(z.any()).optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

// Crop Planning Request Schema
export const CropPlanningRequestSchema = z.object({
  farmer_id: z.number().int(),
  crop_name: z.string().min(2),
  location: z.string().min(2),
  county: z.string().optional(),
  sub_county: z.string().optional(),
  acreage: z.number().positive(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  soil_type: z.string().optional(),
  farming_method: z.enum(["rainfed", "irrigated", "greenhouse"]).optional(),
});

// Export types
export type FarmSeason = z.infer<typeof FarmSeasonSchema>;
export type SeasonActivity = z.infer<typeof SeasonActivitySchema>;
export type SeasonActivityCreate = z.infer<typeof SeasonActivityCreateSchema>;
export type FarmDiaryEntry = z.infer<typeof FarmDiaryEntrySchema>;
export type FarmAlert = z.infer<typeof FarmAlertSchema>;
export type CropPlanningRequest = z.infer<typeof CropPlanningRequestSchema>;
export type CreateSeasonWithActivities = z.infer<typeof CreateSeasonWithActivitiesSchema>;
