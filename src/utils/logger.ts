/* eslint-disable max-len */
// src/utils/logger.ts
import {Response, NextFunction} from "express";
import {AuthRequest} from "../middleware/auth";

// Use AuthRequest type which includes the user property
export const safeLogger = (req: AuthRequest, res: Response, next: NextFunction) => {
  const logData = {
    timestamp: new Date().toISOString(),
    method: req.method,
    path: req.path,
    ip: req.ip,
    userId: req.user?.id || "anonymous",
    userEmail: req.user?.email || "unknown",
    userRole: req.user?.role || "none",
    userAgent: req.get("user-agent"),
    statusCode: res.statusCode,
  };

  console.log(JSON.stringify(logData));
  next();
};
