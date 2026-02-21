/* eslint-disable max-len */
import {Request, Response, NextFunction} from "express";
import xss from "xss";

export const sanitizeInput = (req: Request, res: Response, next: NextFunction) => {
  if (req.body) {
    Object.keys(req.body).forEach((key) => {
      if (typeof req.body[key] === "string") {
        // Skip password fields - don't sanitize passwords
        if (!key.toLowerCase().includes("password") &&
            !key.toLowerCase().includes("pass") &&
            !key.toLowerCase().includes("secret")) {
          req.body[key] = xss(req.body[key].trim());
        }
      }
    });
  }
  next();
};
