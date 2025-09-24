import {z} from "zod";

export const FarmProductSchema = z.object({
  farmer_id: z.string().uuid(),
  product_name: z.string().min(2, "Product name required"),
  quantity: z.number().positive("Quantity must be greater than 0"),
  unit: z.string().min(1, "Unit of measurement required"),
  harvest_date: z.string().optional(), // format: YYYY-MM-DD
  storage_location: z.string().optional(),
  category: z.string().optional(), // new field
  price: z.number().nonnegative().optional(), // new field
  status: z.enum(["available", "sold", "reserved"]).optional(), // new field
});

// 🔥 infer TypeScript type from schema
export type FarmProduct = z.infer<typeof FarmProductSchema>;
