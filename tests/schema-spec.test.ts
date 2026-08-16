import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { inferType, isModuleExport, resolveSchemaSpec, schemaFromSpec } from "../src/schema-spec.js";

function parse(spec: string) {
  return schemaFromSpec(spec);
}

describe("schemaFromSpec field lists", () => {
  it("parses primitives and arrays", () => {
    const schema = parse("title: string\ncount: number\nok: boolean\ntags: string[]");
    expect(
      schema.parse({ title: "A", count: 2.5, ok: true, tags: ["x"] }),
    ).toEqual({ title: "A", count: 2.5, ok: true, tags: ["x"] });
  });

  it("parses nested objects and object arrays", () => {
    const schema = parse(
      "vendor: string\naddress: { city: string, zip: string }\nlineItems: [{ description: string, amount: number }]",
    );
    expect(
      schema.parse({
        vendor: "Acme",
        address: { city: "X", zip: "1" },
        lineItems: [{ description: "Widget", amount: 9 }],
      }),
    ).toMatchObject({ vendor: "Acme" });
  });

  it("ignores comments and blank lines", () => {
    const schema = parse("# header\n\nname: string\n");
    expect(schema.parse({ name: "Ada" })).toEqual({ name: "Ada" });
  });

  it("rejects unknown types", () => {
    expect(() => parse("when: date")).toThrow(/Unknown type/);
  });

  it("parses array-of-type syntax and separators", () => {
    const schema = parse("tags: [string]; ok: boolean");
    expect(schema.parse({ tags: ["a"], ok: true })).toEqual({ tags: ["a"], ok: true });
  });

  it("rejects empty, invalid JSON, and broken field lists", () => {
    expect(() => parse("")).toThrow(/Schema is empty/);
    expect(() => parse("{")).toThrow(/Invalid JSON schema/);
    expect(() => parse("1name: string")).toThrow(/Invalid field name/);
    expect(() => parse(": string")).toThrow(/Invalid field name/);
    expect(() => parse("name string")).toThrow(/Expected ':'/);
    expect(() => parse("items: [{ name: string }")).toThrow(/Expected '}]'/);
    expect(() => parse("addr: { city: string")).toThrow(/Expected '}'/);
    expect(() => parse("tags: [string")).toThrow(/Expected ']'/);
    expect(() => parse("# only a comment")).toThrow(/at least one field/);
    expect(isModuleExport("{\n")).toBe(false);
    expect(isModuleExport("mod:string")).toBe(false);
    expect(isModuleExport("mod:")).toBe(false);
  });
});

describe("schemaFromSpec JSON", () => {
  it("infers a type from a JSON example", () => {
    const schema = parse('{"title":"x","count":1,"tags":["a"]}');
    expect(schema.parse({ title: "y", count: 2, tags: ["b"] })).toEqual({
      title: "y",
      count: 2,
      tags: ["b"],
    });
  });

  it("rejects untyped JSON examples", () => {
    expect(() => parse("{\"title\":null}")).toThrow(/replace null/);
    expect(() => parse("{\"tags\":[]}")).toThrow(/add one example element/);
    expect(() => parse("{}")).toThrow(/has no fields/);
    expect(() => inferType(undefined, "root")).toThrow(/replace null/);
    expect(() => inferType(Symbol("x"), "root")).toThrow(/Unsupported example value/);
  });

  it("treats type:object as JSON Schema", () => {
    const schema = parse(JSON.stringify({ type: "object" }));
    expect(schema.parse({})).toEqual({});
  });

  it("infers booleans and floats from examples", () => {
    const schema = parse('{"ok":true,"ratio":1.5}');
    expect(schema.parse({ ok: false, ratio: 2.25 })).toEqual({ ok: false, ratio: 2.25 });
  });

  it("reads a JSON Schema object", () => {
    const schema = parse(
      JSON.stringify({
        type: "object",
        properties: {
          name: { type: "string" },
          age: { type: "integer" },
        },
      }),
    );
    expect(schema.parse({ name: "Ada", age: 36 })).toEqual({ name: "Ada", age: 36 });
  });
});

describe("resolveSchemaSpec", () => {
  it("detects module:export paths", () => {
    expect(isModuleExport("./schemas.ts:Invoice")).toBe(true);
    expect(isModuleExport("title: string")).toBe(false);
    expect(isModuleExport("name: string")).toBe(false);
  });

  it("loads a Zod export from a module", async () => {
    const file = join(dirname(fileURLToPath(import.meta.url)), "fixtures/person-schema.mjs");
    const schema = await resolveSchemaSpec(`${file}:Person`);
    expect(schema.parse({ name: "Ada" })).toEqual({ name: "Ada" });
  });

  it("resolves field lists without importing a module", async () => {
    const schema = await resolveSchemaSpec("label: string");
    expect(schema.parse({ label: "ok" })).toEqual({ label: "ok" });
  });
});

describe("zod object shape", () => {
  it("keeps integer constraints", () => {
    const schema = parse("age: integer");
    expect(schema.parse({ age: 3 })).toEqual({ age: 3 });
    expect(() => schema.parse({ age: 1.5 })).toThrow(z.ZodError);
  });
});
