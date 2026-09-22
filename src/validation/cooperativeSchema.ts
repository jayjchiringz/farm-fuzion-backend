/* eslint-disable arrow-parens */
/* eslint-disable max-len */
// farmfuzion-backend/functions/src/validation/cooperativeSchema.ts
import {z} from "zod";

// Schema for publishing a farmer's product to cooperative marketplace
export const PublishToCooperativeSchema = z.object({
  farm_product_id: z.string().uuid("Invalid farm product ID format"),
  product_name: z.string().min(1, "Product name is required"),
  category: z.string().optional(),
  quantity: z.number()
    .positive("Quantity must be greater than 0")
    .max(999999, "Quantity cannot exceed 999,999"),
  unit: z.string().min(1, "Unit is required"),
  price_per_unit: z.number()
    .positive("Price per unit must be greater than 0")
    .max(9999999, "Price cannot exceed 9,999,999"),
  certification: z.string().optional(),
  description: z.string().optional().transform(val => val?.trim()).pipe(z.string().max(1000, "Description cannot exceed 1000 characters").optional()),
});

// Schema for cooperative product creation (by group admin)
export const CooperativeProductSchema = z.object({
  product_name: z.string().min(1, "Product name is required"),
  category: z.string().optional(),
  quantity: z.number()
    .positive("Quantity must be greater than 0")
    .max(999999, "Quantity cannot exceed 999,999"),
  unit: z.string().min(1, "Unit is required"),
  price_per_unit: z.number()
    .positive("Price per unit must be greater than 0")
    .max(9999999, "Price cannot exceed 9,999,999"),
  certification: z.string().optional(),
  description: z.string().optional().transform(val => val?.trim()).pipe(z.string().max(1000, "Description cannot exceed 1000 characters").optional()),
  currency: z.string().default("KES"),
  available: z.boolean().default(true),
});

// Schema for updating cooperative product
export const UpdateCooperativeProductSchema = CooperativeProductSchema.partial();

// Schema for recalling product back to farmer
export const RecallProductSchema = z.object({
  quantity: z.number()
    .positive("Quantity must be greater than 0")
    .max(999999, "Quantity cannot exceed 999,999"),
  reason: z.string()
    .min(1, "Reason is required")
    .max(500, "Reason cannot exceed 500 characters"),
});

// Schema for bulk order creation
export const BulkOrderSchema = z.object({
  cooperative_product_id: z.string().uuid("Invalid product ID"),
  buyer_name: z.string().min(1, "Buyer name is required"),
  buyer_company: z.string().optional(),
  buyer_email: z.string().email("Invalid email format"),
  buyer_phone: z.string().optional(),
  buyer_country: z.string().min(1, "Country is required"),
  quantity: z.number()
    .positive("Quantity must be greater than 0")
    .max(999999, "Quantity cannot exceed 999,999"),
  shipping_address: z.string().optional(),
  shipping_method: z.string().optional(),
  notes: z.string().optional().transform(val => val?.trim()).pipe(z.string().max(500, "Notes cannot exceed 500 characters").optional()),
});

// Schema for updating order status
export const UpdateOrderStatusSchema = z.object({
  status: z.enum(["pending", "confirmed", "shipped", "delivered", "cancelled"]),
  tracking_number: z.string().optional(),
});

// Schema for tender creation
export const TenderSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  category: z.string().optional(),
  quantity_needed: z.number().positive("Quantity must be greater than 0"),
  unit: z.string().min(1, "Unit is required"),
  deadline: z.string().datetime("Invalid deadline format"),
  buyer_name: z.string().min(1, "Buyer name is required"),
  buyer_company: z.string().optional(),
  buyer_email: z.string().email("Invalid email format"),
  buyer_phone: z.string().optional(),
});

// Schema for responding to tender
export const TenderResponseSchema = z.object({
  offered_price: z.number().positive("Offered price must be greater than 0"),
  available_quantity: z.number().positive("Available quantity must be greater than 0"),
  delivery_timeline: z.number().positive("Delivery timeline must be greater than 0"),
  message: z.string().optional().transform(val => val?.trim()).pipe(z.string().max(1000, "Message cannot exceed 1000 characters").optional()),
});

// Schema for inventory adjustment
export const InventoryAdjustmentSchema = z.object({
  quantity_change: z.number().int().refine(val => val !== 0, "Quantity change cannot be zero"),
  reason: z.enum(["sale", "recall", "damage", "correction"]),
  notes: z.string().optional().transform(val => val?.trim()).pipe(z.string().max(500, "Notes cannot exceed 500 characters").optional()),
});
