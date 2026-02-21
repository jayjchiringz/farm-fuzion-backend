/* eslint-disable max-len */
// src/utils/logger.ts
import {Request, Response, NextFunction} from "express";

// Define a local interface
interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email?: string;
    role?: string;
  };
}

export const safeLogger = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const logData = {
    timestamp: new Date().toISOString(),
    method: req.method,
    path: req.path,
    ip: req.ip,
    userId: req.user?.id || "anonymous",
    userAgent: req.get("user-agent"),
    statusCode: res.statusCode,
  };

  console.log(JSON.stringify(logData));
  next();
};
