import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadSchema } from "../src/schema.js";

const schemas = join(dirname(fileURLToPath(import.meta.url)), "../examples/schemas.ts");

describe("loadSchema", () => {
  it("loads a Zod export from module:exportName", async () => {
    const schema = await loadSchema(`${schemas}:Invoice`);
    expect(schema.parse({ vendor: "Acme", total: 10, lineItems: [] })).toEqual({
      vendor: "Acme",
      total: 10,
      lineItems: [],
    });
  });

  it("builds a Zod schema from JSON Schema", async () => {
    const schema = await loadSchema({
      type: "object",
      properties: { name: { type: "string" }, age: { type: "number" } },
      required: ["name", "age"],
    });
    expect(schema.parse({ name: "Ada", age: 36 })).toEqual({ name: "Ada", age: 36 });
  });

  it("parses a JSON Schema string", async () => {
    const schema = await loadSchema('{"type":"object","properties":{"ok":{"type":"boolean"}},"required":["ok"]}');
    expect(schema.parse({ ok: true })).toEqual({ ok: true });
  });

  it("rejects a missing export", async () => {
    await expect(loadSchema(`${schemas}:Missing`)).rejects.toThrow(/Export 'Missing'/);
  });

  it("rejects a malformed path", async () => {
    await expect(loadSchema("no-colon")).rejects.toThrow(/module:exportName/);
    await expect(loadSchema("")).rejects.toThrow(/module:exportName/);
    const agents = join(dirname(fileURLToPath(import.meta.url)), "fixtures/agents.ts");
    await expect(loadSchema(`${agents}:notAgent`)).rejects.toThrow(/not a Zod schema/);
  });

  it("returns a Zod schema as-is", async () => {
    const { z } = await import("zod");
    const schema = z.object({ ok: z.boolean() });
    await expect(loadSchema(schema)).resolves.toBe(schema);
  });
});
