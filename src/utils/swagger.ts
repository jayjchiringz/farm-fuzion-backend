// functions/src/utils/swagger.ts
import {Express} from "express";
import {OpenApiGeneratorV3} from "@asteasolutions/zod-to-openapi";
import swaggerUi from "swagger-ui-express";

import {registry, mergeRegistries} from "./registry";

// 👇 Import registries
import {farmProductRegistry} from "../api/farm_products";

export const setupSwagger = (app: Express) => {
  // ✅ Merge all feature registries into central registry
  mergeRegistries(farmProductRegistry);

  const generator = new OpenApiGeneratorV3(registry.definitions);

  const openApiSpec = generator.generateDocument({
    openapi: "3.0.0",
    info: {
      title: "FarmFuzion API",
      version: "1.0.0",
      description: "API documentation for FarmFuzion backend",
    },
  });

  app.use("/docs", swaggerUi.serve, swaggerUi.setup(openApiSpec));

  app.get("/docs-json", (req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.send(openApiSpec);
  });
};
