import {z} from "zod";

export const LoanSchema = z.object({
  farmer_id: z.number().int(),
  amount: z.number().positive(),
  purpose: z.string().optional(),
  repayment_due: z.string().datetime().optional(), // ISO format
});

export const LoanRepaymentSchema = z.object({
  loan_id: z.number().int(),
  farmer_id: z.number().int(),
  amount: z.number().positive(),
  method: z.string().optional(),
  reference_no: z.string().optional(),
});
