// functions/src/utils/swagger.ts
import {Express} from "express";
import {OpenApiGeneratorV3} from "@asteasolutions/zod-to-openapi";
import swaggerUi from "swagger-ui-express";

import {registry, mergeRegistries} from "./registry";

// 👇 Import all feature registries
import {farmProductRegistry} from "../api/farm_products";

export const setupSwagger = (app: Express) => {
  // ✅ Merge all feature registries into the central registry
  mergeRegistries(farmProductRegistry);

  // ✅ Create OpenAPI spec from central registry
  const generator = new OpenApiGeneratorV3(registry.definitions);

  const openApiSpec = generator.generateDocument({
    openapi: "3.0.0",
    info: {
      title: "FarmFuzion API",
      version: "1.0.0",
      description: "API documentation for FarmFuzion backend",
    },
  });

  // ✅ Serve Swagger UI
  app.use("/docs", swaggerUi.serve, swaggerUi.setup(openApiSpec));

  // ✅ Raw JSON version
  app.get("/docs-json", (_req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.send(openApiSpec);
  });
};
