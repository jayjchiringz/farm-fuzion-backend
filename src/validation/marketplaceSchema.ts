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
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export type MarketplaceProduct = z.infer<typeof MarketplaceProductSchema>;

// For publishing from farm_products to marketplace
export const PublishToMarketplaceSchema = z.object({
  farm_product_id: z.string().uuid(),
  price: z.number().positive("Price must be greater than 0"),
  is_public: z.boolean().optional().default(true),
});

export type PublishToMarketplace = z.infer<typeof PublishToMarketplaceSchema>;

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
  order_id: z.string().uuid(),
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
