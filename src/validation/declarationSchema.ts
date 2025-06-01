import {z} from "zod";

export const DeclarationSchema = z.object({
  farmer_id: z.number().int().positive(),
  business_id: z.number().int().positive(),
  tax_id: z.string().min(3),
  tax_obligation: z.string().min(3),
  declaration_date: z.string(), // Or .datetime() if using datetime parser
  account_balance: z.number(),
  tax_amount: z.number(),
});
