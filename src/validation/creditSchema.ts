/* eslint-disable max-len */
import {z} from "zod";

// Credit Provider Schema
export const CreditProviderSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(2, "Provider name required"),
  logo_url: z.string().url().optional(),
  description: z.string().optional(),
  website: z.string().url().optional(),
  api_endpoint: z.string().url().optional(),
  api_key_required: z.boolean().default(true),
  integration_type: z.enum(["direct", "iframe", "redirect", "manual"]),
  status: z.enum(["active", "inactive", "testing"]).default("active"),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

// Credit Product Schema
export const CreditProductSchema = z.object({
  id: z.string().uuid().optional(),
  provider_id: z.string().uuid(),
  name: z.string().min(2, "Product name required"),
  description: z.string().optional(),
  min_amount: z.number().positive(),
  max_amount: z.number().positive(),
  interest_rate: z.number().min(0).max(100),
  interest_rate_type: z.enum(["fixed", "reducing", "flat"]),
  repayment_period_min: z.number().int().positive(), // in months
  repayment_period_max: z.number().int().positive(), // in months
  processing_fee: z.number().min(0).optional(),
  collateral_required: z.boolean().default(false),
  requirements: z.array(z.string()).optional(),
  status: z.enum(["available", "unavailable", "coming_soon"]).default("available"),
  external_product_id: z.string().optional(), // ID in provider's system
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

// Credit Application Schema
export const CreditApplicationSchema = z.object({
  id: z.string().uuid().optional(),
  farmer_id: z.string().uuid(),
  product_id: z.string().uuid(),
  amount: z.number().positive(),
  repayment_period: z.number().int().positive(),
  purpose: z.string().optional(),
  status: z.enum(["draft", "submitted", "under_review", "approved", "rejected", "disbursed", "completed"]).default("draft"),
  external_application_id: z.string().optional(),
  provider_response: z.any().optional(),
  applied_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export type CreditProvider = z.infer<typeof CreditProviderSchema>;
export type CreditProduct = z.infer<typeof CreditProductSchema>;
export type CreditApplication = z.infer<typeof CreditApplicationSchema>;
