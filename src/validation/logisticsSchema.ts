// functions/src/validation/logisticsSchema.ts
import {z} from "zod";

export const LogisticsSchema = z.object({
  farmer_id: z.string().uuid(),
  business_id: z.string().uuid().optional(),
  vehicle_id: z.string().min(2, "Vehicle ID required"),
  driver_name: z.string().min(2, "Driver name required"),
  origin: z.string().min(2, "Origin required"),
  destination: z.string().min(2, "Destination required"),
  delivery_date: z.string().regex(
    /^\d{4}-\d{2}-\d{2}$/,
    "Invalid date format (YYYY-MM-DD expected)"
  ),
  status: z.enum(["scheduled", "en_route", "delivered"]).optional(),
});
