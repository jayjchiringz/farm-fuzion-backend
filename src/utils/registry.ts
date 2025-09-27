// functions/src/utils/registry.ts
import {OpenAPIRegistry, RouteConfig} from "@asteasolutions/zod-to-openapi";
import {ZodTypeAny} from "zod";

// ✅ Central registry
export const registry = new OpenAPIRegistry();

// ✅ Types for definition entries
type SchemaDef = { type: "schema"; name: string; schema: ZodTypeAny };
type RouteDef = { type: "route"; route: RouteConfig };
// Fallback: catch-all definition type
type OtherDef = { type: string; [key: string]: unknown };

type AnyDef = SchemaDef | RouteDef | OtherDef;

// ✅ Helper to merge feature registries
export const mergeRegistries = (...registries: OpenAPIRegistry[]) => {
  registries.forEach((r) => {
    (r.definitions as AnyDef[]).forEach((def) => {
      if (def.type === "schema") {
        const schemaDef = def as SchemaDef;
        registry.register(schemaDef.name, schemaDef.schema);
      } else if (def.type === "route") {
        const routeDef = def as RouteDef;
        registry.registerPath(routeDef.route);
      }
      // ⚠️ Skip other def types (parameter, component, webhook, etc.)
    });
  });
};
