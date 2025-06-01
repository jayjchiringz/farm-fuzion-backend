import {z} from "zod";

export const BusinessSchema = z.object({
  farmer_id: z.number().int().positive(),
  business_reg_no: z.string().min(5),
  business_address: z.string().min(5),
  director_id: z.number().int().positive(),
  mobile_no_1: z.string().regex(/^\+?\d{7,15}$/),
  mobile_no_2: z.string().regex(/^\+?\d{7,15}$/).optional(),
  mobile_no_3: z.string().regex(/^\+?\d{7,15}$/).optional(),
  email: z.string().email(),
});
