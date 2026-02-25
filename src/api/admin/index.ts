// FarmFuzion_Firebase_MVP_Starter\functions\src\api\admin\index.ts
import express from "express";
import {getUsersRouter} from "./getUsers";
import {updateUserRoleRouter} from "./updateUserRole";

// Define the config interface
interface DbConfig {
  PGUSER: string;
  PGPASS: string;
  PGHOST: string;
  PGDB: string;
  PGPORT: string;
  MAIL_USER?: string;
  MAIL_PASS?: string;
}

export const adminRouter = (config: DbConfig) => {
  const router = express.Router();

  // Add logging for debugging (optional)
  router.use((req, res, next) => {
    console.log(`📋 Admin API: ${req.method} ${req.path}`);
    next();
  });

  // Mount both sub-routers on the same base path
  router.use("/", getUsersRouter(config)); // Handles GET /
  router.use("/", updateUserRoleRouter(config)); // Handles PATCH /:userId/role

  return router;
};
