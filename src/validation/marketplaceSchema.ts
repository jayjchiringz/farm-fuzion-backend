/* eslint-disable max-len */
// FarmFuzion_Firebase_MVP_Starter\functions\src\validation\marketplaceSchema.ts
import {z} from "zod";

// ============================================
// 1. MARKETPLACE PRODUCT SCHEMAS
// ============================================

export const MarketplaceProductSchema = z.object({
  id: z.string().uuid().optional(),
  farm_product_id: z.string().uuid(),
  farmer_id: z.string(),
  product_name: z.string().min(1, "Product name required"),
  quantity: z.number().positive("Quantity must be greater than 0"),
  unit: z.string().min(1, "Unit of measurement required"),
  price: z.number().positive("Price must be greater than 0"),
  category: z.string().optional(),
  status: z.enum(["available", "sold", "reserved", "hidden"]).optional().default("available"),
  location: z.string().optional(),
  rating: z.number().min(0).max(5).optional().default(0),
  total_sales: z.number().int().nonnegative().optional().default(0),
  // 🔥 NEW FIELDS FOR HYBRID TRACKING
  external_sales: z.number().int().nonnegative().optional().default(0),
  manual_adjustments: z.number().int().nonnegative().optional().default(0),
  last_synced_at: z.string().datetime().optional(),
  auto_sync: z.boolean().optional().default(true),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export type MarketplaceProduct = z.infer<typeof MarketplaceProductSchema>;

// For publishing from farm_products to marketplace (UPDATED)
export const PublishToMarketplaceSchema = z.object({
  farm_product_id: z.string().uuid(),
  price: z.number().positive("Price must be greater than 0"),
  is_public: z.boolean().optional().default(true),
  auto_sync: z.boolean().optional().default(true), // NEW: Auto-sync with farm inventory
});

export type PublishToMarketplace = z.infer<typeof PublishToMarketplaceSchema>;

// 🔥 NEW: Manual adjustment schema for external sales/inventory corrections
export const ManualAdjustmentSchema = z.object({
  marketplace_product_id: z.string().uuid(),
  quantity_change: z.number().int(), // Can be negative for sales, positive for additions
  reason: z.enum(["external_sale", "inventory_correction", "damage", "other"]),
  notes: z.string().optional(),
  farmer_id: z.string().uuid(),
});

export type ManualAdjustment = z.infer<typeof ManualAdjustmentSchema>;

// 🔥 NEW: Adjustment history schema
export const InventoryAdjustmentSchema = z.object({
  id: z.string().uuid().optional(),
  marketplace_product_id: z.string().uuid(),
  farm_product_id: z.string().uuid().optional(),
  previous_quantity: z.number().int(),
  new_quantity: z.number().int(),
  change_amount: z.number().int(),
  reason: z.enum(["marketplace_sale", "external_sale", "inventory_correction", "damage", "other"]),
  notes: z.string().optional(),
  farmer_id: z.string().uuid(),
  created_at: z.string().datetime().optional(),
});

export type InventoryAdjustment = z.infer<typeof InventoryAdjustmentSchema>;

// ============================================
// 2. SHOPPING CART SCHEMAS
// ============================================

export const ShoppingCartSchema = z.object({
  id: z.string().uuid().optional(),
  buyer_id: z.string(),
  seller_id: z.string(),
  status: z.enum(["active", "pending", "completed", "abandoned"]).optional().default("active"),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export type ShoppingCart = z.infer<typeof ShoppingCartSchema>;

export const CartItemSchema = z.object({
  id: z.string().uuid().optional(),
  cart_id: z.string().uuid(),
  marketplace_product_id: z.string().uuid(),
  quantity: z.number().int().positive("Quantity must be at least 1"),
  unit_price: z.number().positive("Price must be greater than 0"),
  created_at: z.string().optional(),
});

export type CartItem = z.infer<typeof CartItemSchema>;

export const AddToCartSchema = z.object({
  marketplace_product_id: z.string().uuid(),
  quantity: z.number().int().positive("Quantity must be at least 1"),
});

export type AddToCart = z.infer<typeof AddToCartSchema>;

export const UpdateCartItemSchema = z.object({
  quantity: z.number().int().positive("Quantity must be at least 1"),
});

export type UpdateCartItem = z.infer<typeof UpdateCartItemSchema>;

// ============================================
// 3. ORDER SCHEMAS
// ============================================

export const MarketplaceOrderSchema = z.object({
  id: z.string().uuid().optional(),
  order_number: z.string(),
  buyer_id: z.string(),
  seller_id: z.string(),
  status: z.enum(["pending", "confirmed", "shipping", "delivered", "cancelled", "refunded"]).optional().default("pending"),
  total_amount: z.number().positive("Total amount must be greater than 0"),
  shipping_address: z.string().optional(),
  payment_method: z.enum(["wallet", "mpesa", "paybill", "cash"]).optional().default("wallet"),
  payment_status: z.enum(["pending", "paid", "failed", "refunded"]).optional().default("pending"),
  notes: z.string().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export type MarketplaceOrder = z.infer<typeof MarketplaceOrderSchema>;

export const OrderItemSchema = z.object({
  id: z.string().uuid().optional(),
  order_id: z.string().uuid(),
  marketplace_product_id: z.string().uuid(),
  product_name: z.string(),
  quantity: z.number().int().positive(),
  unit_price: z.number().positive(),
  total_price: z.number().positive(),
  created_at: z.string().optional(),
});

export type OrderItem = z.infer<typeof OrderItemSchema>;

// ============================================
// 4. CHECKOUT & PAYMENT SCHEMAS
// ============================================

export const CheckoutSchema = z.object({
  cart_id: z.string().uuid(),
  shipping_address: z.string().optional(),
  payment_method: z.enum(["wallet", "mpesa", "paybill", "cash"]).optional().default("wallet"),
  notes: z.string().optional(),
});

export type Checkout = z.infer<typeof CheckoutSchema>;

export const PaymentRequestSchema = z.object({
  order_id: z.string().uuid().optional(),
  payment_method: z.enum(["wallet", "mpesa", "paybill", "cash"]),
  // For M-Pesa/Paybill
  phone_number: z.string().optional(),
  account_number: z.string().optional(),
});

export type PaymentRequest = z.infer<typeof PaymentRequestSchema>;

// ============================================
// 5. FILTER & SEARCH SCHEMAS
// ============================================

export const MarketplaceFilterSchema = z.object({
  category: z.string().optional(),
  minPrice: z.number().positive().optional(),
  maxPrice: z.number().positive().optional(),
  location: z.string().optional(),
  farmer_id: z.string().optional(),
  status: z.enum(["available", "sold", "reserved", "hidden"]).optional().default("available"),
  sort: z.enum(["price_asc", "price_desc", "newest", "rating", "sales"]).optional().default("newest"),
  page: z.number().int().positive().optional().default(1),
  limit: z.number().int().positive().max(100).optional().default(20),
  search: z.string().optional(),
});

export type MarketplaceFilter = z.infer<typeof MarketplaceFilterSchema>;

// ============================================
// 6. ORDER STATUS UPDATE SCHEMA
// ============================================

export const OrderStatusUpdateSchema = z.object({
  status: z.enum(["confirmed", "shipping", "delivered", "cancelled"]),
  tracking_number: z.string().optional(),
  delivery_date: z.string().optional(),
});

export type OrderStatusUpdate = z.infer<typeof OrderStatusUpdateSchema>;

// ============================================
// 7. SYNC SCHEMAS (NEW)
// ============================================

export const SyncRequestSchema = z.object({
  marketplace_product_id: z.string().uuid(),
  farmer_id: z.string().uuid(),
});

export type SyncRequest = z.infer<typeof SyncRequestSchema>;

export const SyncResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  new_quantity: z.number().int(),
});

export type SyncResponse = z.infer<typeof SyncResponseSchema>;
