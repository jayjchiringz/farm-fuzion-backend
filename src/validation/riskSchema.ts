import {z} from "zod";

export const RiskSchema = z.object({
  farmer_id: z.number().int().positive(),
  credit_check: z.string().min(3),
  fraud_screen: z.string().min(3),
  assessment_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
