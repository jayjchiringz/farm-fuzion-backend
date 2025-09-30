import {z} from "zod";

// ✅ Canonical worldbank schema
export const WorldBankPriceSchema = z.object({
  id: z.number().int().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  commodity: z.string().min(2, "Commodity name is too short"),
  unit: z.string().min(1, "Unit is required"),
  price: z.number().nullable().optional(),
  created_at: z.string().datetime().optional(),
});
export type WorldBankPrice = z.infer<typeof WorldBankPriceSchema>;

// ✅ MarketPrice schema (view projection of worldbank)
export const MarketPriceSchema = z.object({
  id: z.string().uuid().optional(),
  product_name: z.string().min(2).max(100),
  category: z.string().min(2).max(50),
  unit: z.string().min(1).max(20),
  wholesale_price: z.number().nullable().optional(),
  retail_price: z.number().nullable().optional(),
  broker_price: z.number().nullable().optional(),
  farmgate_price: z.number().nullable().optional(),
  region: z.string().max(100).nullable().optional(),
  source: z.string().max(200).nullable().optional(), // "world_bank",etc.
  volatility: z.enum(["stable", "volatile"]).default("stable"), // NEW 🟢⚠️
  collected_at: z.string().datetime().nullable().optional(),
  benchmark: z.boolean().default(false),
  last_synced: z.string().datetime().nullable().optional(), // MV refresh
});

export type MarketPrice = z.infer<typeof MarketPriceSchema>;
