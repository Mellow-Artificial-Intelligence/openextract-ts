import { z } from "zod";
import { toError } from "./errors.js";
import { jsonSchemaToZod, loadSchema } from "./schema.js";

const PRIMITIVES = {
  string: () => z.string(),
  number: () => z.number(),
  integer: () => z.number().int(),
  boolean: () => z.boolean(),
} as const;

type PrimitiveName = keyof typeof PRIMITIVES;

type SpecType =
  | { kind: "primitive"; name: PrimitiveName }
  | { kind: "array"; item: SpecType }
  | { kind: "object"; fields: SpecField[] };

interface SpecField {
  name: string;
  type: SpecType;
}

const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;

export const SCHEMA_SPEC_HELP =
  "Use a field list (title: string), a JSON example, JSON Schema, or module:export.";

export function schemaFromSpec(spec: string): z.ZodType<unknown> {
  const trimmed = spec.trim();
  if (!trimmed) throw new Error(`Schema is empty. ${SCHEMA_SPEC_HELP}`);
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return schemaFromJson(trimmed);
  }
  return toZod(parseFieldList(trimmed));
}

export async function resolveSchemaSpec(spec: string): Promise<z.ZodType<unknown>> {
  const trimmed = spec.trim();
  if (isModuleExport(trimmed)) return loadSchema(trimmed);
  return schemaFromSpec(trimmed);
}

export function isModuleExport(spec: string): boolean {
  const trimmed = spec.trim();
  if (!trimmed || trimmed.includes("\n") || trimmed.startsWith("{")) return false;
  const sep = trimmed.lastIndexOf(":");
  if (sep <= 0 || sep === trimmed.length - 1) return false;
  const modulePath = trimmed.slice(0, sep);
  const exportName = trimmed.slice(sep + 1);
  if (!IDENT.test(exportName) || exportName in PRIMITIVES) return false;
  return /[./\\]/.test(modulePath);
}

function schemaFromJson(raw: string): z.ZodType<unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Invalid JSON schema: ${toError(error).message}`);
  }
  if (isJsonSchema(parsed)) return jsonSchemaToZod(parsed);
  return toZod(inferType(parsed, "root"));
}

function isJsonSchema(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    ("properties" in value || ("type" in value && value.type === "object"))
  );
}

export function inferType(value: unknown, path: string): SpecType {
  if (value === null || value === undefined) {
    throw new Error(`Cannot infer a type for ${path}; replace null with a typed example.`);
  }
  if (typeof value === "string") return { kind: "primitive", name: "string" };
  if (typeof value === "boolean") return { kind: "primitive", name: "boolean" };
  if (typeof value === "number") {
    return { kind: "primitive", name: Number.isInteger(value) ? "integer" : "number" };
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      throw new Error(`Cannot infer ${path}[]; add one example element.`);
    }
    return { kind: "array", item: inferType(value[0], `${path}[]`) };
  }
  if (typeof value === "object") {
    const fields = Object.entries(value).map(([name, child]) => ({
      name,
      type: inferType(child, `${path}.${name}`),
    }));
    if (fields.length === 0) throw new Error(`Object ${path} has no fields.`);
    return { kind: "object", fields };
  }
  throw new Error(`Unsupported example value at ${path}.`);
}

function parseFieldList(spec: string): SpecType {
  const body = spec
    .split("\n")
    .map((line) => line.replace(/#.*$/, "").trim())
    .filter(Boolean)
    .join("\n");
  return parseObjectBody(body, 0)[0];
}

function parseObjectBody(input: string, start: number): [SpecType, number] {
  const fields: SpecField[] = [];
  let i = skipWs(input, start);
  while (i < input.length) {
    if (input[i] === "}" || input[i] === "]") break;
    const nameStart = i;
    while (i < input.length && /[A-Za-z0-9_]/.test(input[i]!)) i += 1;
    const name = input.slice(nameStart, i);
    if (!IDENT.test(name)) throw new Error(`Invalid field name '${name || input[i] || /* v8 ignore next */ ""}'.`);
    i = skipWs(input, i);
    if (input[i] !== ":") throw new Error(`Expected ':' after field '${name}'.`);
    i = skipWs(input, i + 1);
    const [type, next] = parseType(input, i);
    fields.push({ name, type });
    i = skipSep(input, next);
  }
  if (fields.length === 0) throw new Error("Schema must declare at least one field.");
  return [{ kind: "object", fields }, i];
}

function parseType(input: string, start: number): [SpecType, number] {
  let i = skipWs(input, start);
  let type: SpecType;
  if (input.startsWith("[{", i)) {
    const [item, next] = parseObjectBody(input, i + 2);
    i = skipWs(input, next);
    if (input[i] !== "}" || input[i + 1] !== "]") {
      throw new Error("Expected '}]' to close an object array.");
    }
    return [{ kind: "array", item }, i + 2];
  }
  if (input[i] === "{") {
    const [obj, next] = parseObjectBody(input, i + 1);
    i = skipWs(input, next);
    if (input[i] !== "}") throw new Error("Expected '}' to close an object type.");
    type = obj;
    i += 1;
  } else if (input[i] === "[") {
    const [item, next] = parseType(input, i + 1);
    i = skipWs(input, next);
    if (input[i] !== "]") throw new Error("Expected ']' to close an array type.");
    type = { kind: "array", item };
    i += 1;
  } else {
    const nameStart = i;
    while (i < input.length && /[A-Za-z]/.test(input[i]!)) i += 1;
    const name = input.slice(nameStart, i);
    if (!(name in PRIMITIVES)) {
      throw new Error(`Unknown type '${name}'. Use string, number, integer, boolean, arrays, or objects.`);
    }
    type = { kind: "primitive", name: name as PrimitiveName };
  }
  while (input.startsWith("[]", i)) {
    type = { kind: "array", item: type };
    i += 2;
  }
  return [type, i];
}

function skipWs(input: string, i: number): number {
  while (i < input.length && /[\s,]/.test(input[i]!)) i += 1;
  return i;
}

function skipSep(input: string, i: number): number {
  let next = skipWs(input, i);
  if (input[next] === "," || input[next] === ";") next = skipWs(input, next + 1);
  return next;
}

function toZod(type: SpecType): z.ZodType<unknown> {
  if (type.kind === "primitive") return PRIMITIVES[type.name]();
  if (type.kind === "array") return z.array(toZod(type.item));
  const shape: Record<string, z.ZodType<unknown>> = {};
  for (const field of type.fields) shape[field.name] = toZod(field.type);
  return z.object(shape);
}
