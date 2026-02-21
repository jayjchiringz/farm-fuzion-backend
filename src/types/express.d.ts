/* eslint-disable @typescript-eslint/no-unused-vars */
// src/types/express.d.ts
import {Request} from "express";

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email?: string;
        role?: string;
      };
      dbConfig?: {
        PGUSER: string;
        PGPASS: string;
        PGHOST: string;
        PGDB: string;
        PGPORT: string;
        MAIL_USER: string;
        MAIL_PASS: string;
      };
    }
  }
}
