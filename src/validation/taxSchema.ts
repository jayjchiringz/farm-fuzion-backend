import {z} from "zod";

export const TaxSchema = z.object({
  farmer_id: z.number().int().positive(),
  business_id: z.number().int().positive(),
  tax_id: z.string().min(3),
  tax_obligation: z.string().min(3),
});
