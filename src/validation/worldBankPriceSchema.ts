import {z} from "zod";

// ✅ World Bank Price schema
export const WorldBankPriceSchema = z.object({
  id: z.number().int().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, {
    message: "Date must be in YYYY-MM-DD format",
  }),
  commodity: z.string().min(2, "Commodity name is too short"),
  unit: z.string().min(1, "Unit is required"),
  price: z.number().nullable().optional(),
  created_at: z.string().datetime().optional(),
});

// ✅ Inferred TS type
export type WorldBankPrice = z.infer<typeof WorldBankPriceSchema>;
