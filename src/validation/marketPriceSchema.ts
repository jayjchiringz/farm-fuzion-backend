import {z} from "zod";

// ✅ MarketPrice schema
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
  source: z.string().max(200).nullable().optional(),
  collected_at: z.string().datetime().nullable().optional(),
});

// ✅ Inferred TS type
export type MarketPrice = z.infer<typeof MarketPriceSchema>;
