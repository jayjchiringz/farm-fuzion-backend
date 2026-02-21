import {v4 as uuidv4} from "uuid";
import {Request, Response, NextFunction} from "express";

export const requestId = (req: Request, res: Response, next: NextFunction) => {
  req.headers["x-request-id"] = req.headers["x-request-id"] || uuidv4();
  res.setHeader("x-request-id", req.headers["x-request-id"] as string);
  next();
};
