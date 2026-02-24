/* eslint-disable max-len */
// FarmFuzion_Firebase_MVP_Starter\functions\src\validation\servicesSchema.ts
import {z} from "zod";

// ============================================
// SERVICE PROVIDER SCHEMAS
// ============================================

export const ServiceProviderSchema = z.object({
  id: z.string().uuid().optional(),
  user_id: z.string().uuid(),
  business_name: z.string().min(2, "Business name must be at least 2 characters"),
  business_registration: z.string().optional(),
  service_category: z.string().min(1, "Service category required"),
  description: z.string().optional(),
  phone: z.string().min(10, "Valid phone number required").regex(/^\+?\d{10,15}$/, "Invalid phone format"),
  email: z.string().email().optional(),
  website: z.string().url().optional(),
  county: z.string().optional(),
  constituency: z.string().optional(),
  ward: z.string().optional(),
  location: z.string().optional(),
  years_of_experience: z.number().min(0).optional(),
  is_verified: z.boolean().optional().default(false),
  verification_document_path: z.string().optional(),
  profile_image_url: z.string().url().optional(),
  status: z.enum(["pending", "active", "suspended", "inactive"]).optional().default("pending"),
  avg_rating: z.number().min(0).max(5).optional().default(0),
  review_count: z.number().int().min(0).optional().default(0),
  service_count: z.number().int().min(0).optional().default(0),
  created_at: z.string().datetime().optional(),
  updated_at: z.string().datetime().optional(),
});

export type ServiceProvider = z.infer<typeof ServiceProviderSchema>;

// ============================================
// SERVICE SCHEMAS
// ============================================

export const ServiceSchema = z.object({
  id: z.string().uuid().optional(),
  provider_id: z.string().uuid(),
  service_name: z.string().min(2, "Service name must be at least 2 characters"),
  description: z.string().optional(),
  category: z.string().min(1, "Category required"),
  price: z.number().positive("Price must be greater than 0").optional(),
  price_unit: z.string().optional(),
  is_negotiable: z.boolean().optional().default(true),
  service_area: z.string().optional(),
  availability: z.string().optional(),
  estimated_duration: z.string().optional(),
  status: z.enum(["active", "inactive"]).optional().default("active"),
  created_at: z.string().datetime().optional(),
  updated_at: z.string().datetime().optional(),
});

export type Service = z.infer<typeof ServiceSchema>;

// ============================================
// SERVICE BOOKING SCHEMAS
// ============================================

export const ServiceBookingSchema = z.object({
  id: z.string().uuid().optional(),
  farmer_id: z.string().uuid(),
  provider_id: z.string().uuid(),
  service_id: z.string().uuid(),
  booking_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
  booking_time: z.string().regex(/^\d{2}:\d{2}$/, "Time must be HH:MM").optional(),
  status: z.enum(["pending", "confirmed", "completed", "cancelled", "rejected"]).optional().default("pending"),
  location: z.string().optional(),
  notes: z.string().optional(),
  total_price: z.number().positive().optional(),
  payment_status: z.enum(["pending", "paid", "failed", "refunded"]).optional().default("pending"),
  payment_method: z.string().optional(),
  completed_at: z.string().datetime().optional(),
  created_at: z.string().datetime().optional(),
  updated_at: z.string().datetime().optional(),
});

export type ServiceBooking = z.infer<typeof ServiceBookingSchema>;

// ============================================
// SERVICE REVIEW SCHEMAS
// ============================================

export const ServiceReviewSchema = z.object({
  id: z.string().uuid().optional(),
  booking_id: z.string().uuid(),
  farmer_id: z.string().uuid(),
  provider_id: z.string().uuid(),
  rating: z.number().int().min(1, "Rating must be at least 1").max(5, "Rating cannot exceed 5"),
  review: z.string().optional(),
  would_recommend: z.boolean().optional().default(true),
  response_from_provider: z.string().optional(),
  created_at: z.string().datetime().optional(),
  updated_at: z.string().datetime().optional(),
});

export type ServiceReview = z.infer<typeof ServiceReviewSchema>;

// ============================================
// PROVIDER AVAILABILITY SCHEMAS
// ============================================

export const ProviderAvailabilitySchema = z.object({
  id: z.string().uuid().optional(),
  provider_id: z.string().uuid(),
  day_of_week: z.number().int().min(0, "Day must be 0-6").max(6, "Day must be 0-6"),
  start_time: z.string().regex(/^\d{2}:\d{2}$/, "Time must be HH:MM"),
  end_time: z.string().regex(/^\d{2}:\d{2}$/, "Time must be HH:MM"),
  is_available: z.boolean().optional().default(true),
  created_at: z.string().datetime().optional(),
  updated_at: z.string().datetime().optional(),
});

export type ProviderAvailability = z.infer<typeof ProviderAvailabilitySchema>;

// ============================================
// REQUEST/ACTION SCHEMAS
// ============================================

export const RegisterProviderSchema = ServiceProviderSchema.omit({
  id: true,
  is_verified: true,
  avg_rating: true,
  review_count: true,
  service_count: true,
  status: true,
  created_at: true,
  updated_at: true,
});

export type RegisterProvider = z.infer<typeof RegisterProviderSchema>;

export const CreateServiceSchema = ServiceSchema.omit({
  id: true,
  status: true,
  created_at: true,
  updated_at: true,
});

export type CreateService = z.infer<typeof CreateServiceSchema>;

export const CreateBookingSchema = ServiceBookingSchema.omit({
  id: true,
  status: true,
  payment_status: true,
  completed_at: true,
  created_at: true,
  updated_at: true,
});

export type CreateBooking = z.infer<typeof CreateBookingSchema>;

export const CreateReviewSchema = ServiceReviewSchema.omit({
  id: true,
  response_from_provider: true,
  created_at: true,
  updated_at: true,
});

export type CreateReview = z.infer<typeof CreateReviewSchema>;

// ============================================
// FILTER SCHEMAS
// ============================================

export const ServiceProviderFilterSchema = z.object({
  category: z.string().optional(),
  county: z.string().optional(),
  search: z.string().optional(),
  verified: z.boolean().optional(),
  min_rating: z.number().min(0).max(5).optional(),
  page: z.number().int().positive().optional().default(1),
  limit: z.number().int().positive().max(100).optional().default(10),
});

export type ServiceProviderFilter = z.infer<typeof ServiceProviderFilterSchema>;

export const ServiceSearchSchema = z.object({
  category: z.string().optional(),
  provider_id: z.string().uuid().optional(),
  min_price: z.number().positive().optional(),
  max_price: z.number().positive().optional(),
  search: z.string().optional(),
  page: z.number().int().positive().optional().default(1),
  limit: z.number().int().positive().max(100).optional().default(10),
});

export type ServiceSearch = z.infer<typeof ServiceSearchSchema>;
