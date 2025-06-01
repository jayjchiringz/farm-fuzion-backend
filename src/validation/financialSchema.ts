import {z} from "zod";

export const FinancialSchema = z.object({
  farmer_id: z.number().int().positive(),
  wallet_account_number: z.string().min(5),
  bank_branch: z.string().min(2),
  bank_code: z.string().min(2),
  account_name: z.string().min(2),
  account_number: z.string().min(5),
});
