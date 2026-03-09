// src/api/index.render.ts
import express from "express";
import {getGroupsRouter} from "./groups";
import {getAuthRouter} from "./auth";
import {adminRouter} from "./admin";
import {getRolesRouter} from "./roles";
import {getRegisterWithDocsRouter} from "./registerWithDocs";
import {AppConfig} from "../main";
import {getFilesRouter} from "./files";

export const apiRouter = (config: AppConfig) => {
  const router = express.Router();

  // Log all API requests (helpful for debugging)
  router.use((req, res, next) => {
    console.log(`📡 API [${req.method}] ${req.path}`);
    next();
  });

  // Mount all API routes
  router.use("/auth", getAuthRouter(config));
  router.use("/groups", getGroupsRouter(config));
  router.use("/admin/users", adminRouter(config));
  router.use("/roles", getRolesRouter(config));
  router.use("/register-with-docs", getRegisterWithDocsRouter(config));

  // Test endpoint to verify API is working
  router.get("/test", (req, res) => {
    res.json({
      message: "FarmFuzion API is working!",
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || "development",
    });
  });

  // 404 handler for API routes
  router.use((req, res) => {
    res.status(404).json({
      error: "API endpoint not found",
      path: req.path,
      method: req.method,
    });
  });

  router.use("/files", getFilesRouter());

  return router;
};
