import swaggerJsdoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";
import {Express} from "express";

export const setupSwagger = (app: Express) => {
  const options = {
    definition: {
      openapi: "3.0.0",
      info: {
        title: "FarmFuzion API",
        version: "1.0.0",
        description: "API documentation for FarmFuzion backend",
      },
    },
    apis: ["./src/api/*.ts"], // 👈 scan route files for JSDoc annotations
  };

  const swaggerSpec = swaggerJsdoc(options);

  // Docs UI
  app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

  // Raw JSON spec (for frontend typegen)
  app.get("/docs-json", (req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.send(swaggerSpec);
  });
};
