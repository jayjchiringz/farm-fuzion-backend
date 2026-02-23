/* eslint-disable max-len */
// functions/src/validation/insuranceSchema.ts
import {z} from "zod";

export const InsuranceProviderSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(2, "Provider name required"),
  logo_url: z.string().url().optional(),
  description: z.string().optional(),
  website: z.string().url().optional(),
  contact_phone: z.string().optional(),
  contact_email: z.string().email().optional(),
  status: z.enum(["active", "inactive", "pending"]).default("active"),
});

export const InsuranceProductSchema = z.object({
  id: z.string().uuid().optional(),
  provider_id: z.string().uuid(),
  name: z.string().min(2, "Product name required"),
  type: z.enum(["crop", "livestock", "equipment", "health", "weather", "liability"]),
  description: z.string().optional(),
  coverage_details: z.record(z.any()).optional(),
  premium_min: z.number().positive("Minimum premium must be positive"),
  premium_max: z.number().positive("Maximum premium must be positive"),
  coverage_period: z.string().optional(),
  eligibility_requirements: z.array(z.string()).optional(),
  features: z.array(z.string()).optional(),
  documents_required: z.record(z.any()).optional(),
  status: z.enum(["active", "inactive"]).default("active"),
  popular: z.boolean().default(false),
  external_product_id: z.string().optional(),
});

export const InsuranceApplicationSchema = z.object({
  id: z.string().uuid().optional(),
  farmer_id: z.number().int().positive(),
  product_id: z.string().uuid(),
  coverage_amount: z.number().positive("Coverage amount must be positive"),
  premium: z.number().positive("Premium must be positive"),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format (YYYY-MM-DD)"),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format (YYYY-MM-DD)"),
  status: z.enum(["draft", "submitted", "under_review", "approved", "rejected", "active", "expired", "cancelled"]).default("draft"),
  documents: z.record(z.any()).optional(),
  notes: z.string().optional(),
  external_application_id: z.string().optional(),
});

export const InsuranceClaimSchema = z.object({
  id: z.string().uuid().optional(),
  application_id: z.string().uuid(),
  incident_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format (YYYY-MM-DD)"),
  description: z.string().min(10, "Description must be at least 10 characters"),
  amount_claimed: z.number().positive("Claim amount must be positive"),
  documents: z.record(z.any()).optional(),
});

export type InsuranceProvider = z.infer<typeof InsuranceProviderSchema>;
export type InsuranceProduct = z.infer<typeof InsuranceProductSchema>;
export type InsuranceApplication = z.infer<typeof InsuranceApplicationSchema>;
export type InsuranceClaim = z.infer<typeof InsuranceClaimSchema>;
