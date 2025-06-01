import {z} from "zod";

export const DirectorSchema = z.object({
  first_name: z.string().min(2),
  middle_name: z.string().optional(),
  last_name: z.string().min(2),
  dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  id_passport_no: z.string().min(5),
  location: z.string().min(2),
  address: z.string().min(2),
  mobile_no: z.string().regex(/^\+?\d{7,15}$/),
  email: z.string().email(),
});
