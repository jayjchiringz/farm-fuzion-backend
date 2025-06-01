import {z} from "zod";

export const PaymentSchema = z.object({
  declaration_id: z.number().int().positive(),
  farmer_id: z.number().int().positive(),
  business_id: z.number().int().positive(),
  tax_id: z.string(),
  tax_obligation: z.string(),
  payment_date: z.string(),
  reference_no: z.string(),
  payment_type: z.string(),
  paid_amount: z.number(),
  paid: z.boolean(),
});
