import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { z } from "zod";

export function isZodSchema(value: unknown): value is z.ZodType<unknown> {
  return typeof value === "object" && value !== null && "_zod" in value;
}

export async function loadSchema(spec: unknown): Promise<z.ZodType<unknown>> {
  if (isZodSchema(spec)) return spec;
  if (typeof spec === "object" && spec !== null) {
    return z.fromJSONSchema(spec as Parameters<typeof z.fromJSONSchema>[0]);
  }
  if (typeof spec !== "string" || !spec.trim()) {
    throw new Error("schema must be a JSON Schema object, JSON string, or 'module:exportName' path.");
  }
  const trimmed = spec.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return z.fromJSONSchema(JSON.parse(trimmed) as Record<string, unknown>);
  }
  const sep = trimmed.lastIndexOf(":");
  if (sep <= 0 || sep === trimmed.length - 1) {
    throw new Error(`Invalid schema path '${spec}'. Expected format 'module:exportName'.`);
  }
  const modulePath = trimmed.slice(0, sep);
  const exportName = trimmed.slice(sep + 1);
  const href = pathToFileURL(resolve(modulePath)).href;
  const mod = (await import(href)) as Record<string, unknown>;
  const schema = mod[exportName];
  if (schema == null) {
    throw new Error(`Export '${exportName}' not found in module '${modulePath}'.`);
  }
  if (!isZodSchema(schema)) {
    throw new Error(`Export '${exportName}' in '${modulePath}' is not a Zod schema.`);
  }
  return schema;
}
