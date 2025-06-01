import {Request, Response, NextFunction} from "express";
import {ZodSchema} from "zod";

export const validate =
  (schema: ZodSchema) => (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      return res.status(400).json({
        error: "Validation failed",
        issues: result.error.issues,
      });
    }

    req.body = result.data;
    return next();
  };
