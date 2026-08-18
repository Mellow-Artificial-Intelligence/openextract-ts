import { z } from "zod";
import { loadModuleExport } from "./module-export.js";

export function isZodSchema(value: unknown): value is z.ZodType<unknown> {
  return typeof value === "object" && value !== null && "_zod" in value;
}

/** Converts a JSON Schema document into a Zod schema. */
export function jsonSchemaToZod(spec: object): z.ZodType<unknown> {
  return z.fromJSONSchema(spec as Parameters<typeof z.fromJSONSchema>[0]);
}

export async function loadSchema(spec: unknown): Promise<z.ZodType<unknown>> {
  if (isZodSchema(spec)) return spec;
  if (typeof spec === "object" && spec !== null) {
    return jsonSchemaToZod(spec);
  }
  if (typeof spec !== "string" || !spec.trim()) {
    throw new Error("schema must be a JSON Schema object, JSON string, or 'module:exportName' path.");
  }
  const trimmed = spec.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return jsonSchemaToZod(JSON.parse(trimmed) as Record<string, unknown>);
  }
  const { value, exportName, modulePath } = await loadModuleExport(trimmed);
  if (!isZodSchema(value)) {
    throw new Error(`Export '${exportName}' in '${modulePath}' is not a Zod schema.`);
  }
  return value;
}
