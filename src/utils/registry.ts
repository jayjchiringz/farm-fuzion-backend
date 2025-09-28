// functions/src/utils/registry.ts
import {z, ZodTypeAny} from "zod";
import {
  OpenAPIRegistry,
  RouteConfig,
  extendZodWithOpenApi,
} from "@asteasolutions/zod-to-openapi";

// ✅ Apply the patch ONCE globally (adds `.openapi()` to all Zod schemas)
extendZodWithOpenApi(z);

// ✅ Central registry
export const registry = new OpenAPIRegistry();

// ✅ Types for definition entries
type SchemaDef = { type: "schema"; name: string; schema: ZodTypeAny };
type RouteDef = { type: "route"; route: RouteConfig };
type OtherDef = { type: string; [key: string]: unknown };

type AnyDef = SchemaDef | RouteDef | OtherDef;

// ✅ Helper to merge feature registries into the central one
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
      // ⚠️ Skip other def types for now
    });
  });
};
