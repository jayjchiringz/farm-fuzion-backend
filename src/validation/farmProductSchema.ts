import {z} from "zod";

export const FarmProductSchema = z.object({
  id: z.string().uuid().optional(), // DB assigns UUID
  farmer_id: z.string().uuid(),
  product_name: z.string().min(1, "Product name required"),
  quantity: z.number().positive("Quantity must be greater than 0"),
  unit: z.string().min(1, "Unit of measurement required"),
  harvest_date: z.string().optional(), // YYYY-MM-DD
  storage_location: z.string().optional(),
  category: z.string().optional(), // produce, input, service
  price: z.number().nonnegative().optional(),
  status: z.enum(["available", "sold", "hidden"]).optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
  spoilage_reason: z.string().optional(),
});

// ✅ Export type inferred from schema
export type FarmProduct = z.infer<typeof FarmProductSchema>;
