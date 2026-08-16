import { describe, expect, it } from "vitest";
import {
  columnsFromFieldList,
  createStep,
  defaultPipeline,
  insertStepAt,
  isAddableKind,
  moveStepTo,
  patchStep,
  removeStep,
  resolveColumns,
  stepTitle,
  validatePipeline,
  type CustomStep,
  type SchemaStep,
  type SourceStep,
} from "../web/src/lib/builder.ts";

describe("createStep", () => {
  it("pins source and extract defaults", () => {
    expect(createStep("source", "s").source).toBe("");
    expect(createStep("extract", "e")).toMatchObject({ style: "direct", instructions: "" });
    expect(createStep("swarm", "w").agents).toBe(3);
    expect(createStep("custom", "c").label).toBe("Custom");
  });
});

describe("defaultPipeline", () => {
  it("starts with source, schema, extract", () => {
    expect(defaultPipeline().map((step) => step.kind)).toEqual(["source", "schema", "extract"]);
  });
});

describe("columnsFromFieldList", () => {
  it("parses typed fields and bare keys", () => {
    expect(columnsFromFieldList("vendor: string\ntotal: number\npaid")).toEqual([
      { key: "vendor", label: "vendor", type: "string" },
      { key: "total", label: "total", type: "number" },
      { key: "paid", label: "paid", type: "string" },
    ]);
  });

  it("ignores junk and accepts commas", () => {
    expect(columnsFromFieldList("qty: integer, ???, ready: boolean")).toEqual([
      { key: "qty", label: "qty", type: "integer" },
      { key: "ready", label: "ready", type: "boolean" },
    ]);
  });
});

describe("insertStepAt / moveStepTo / removeStep", () => {
  it("inserts after the pinned source", () => {
    const steps = [createStep("source", "s"), createStep("extract", "e")];
    const next = insertStepAt(steps, "custom", 0);
    expect(next.map((step) => step.kind)).toEqual(["source", "custom", "extract"]);
  });

  it("moves a step and keeps source first", () => {
    const steps = [createStep("source", "s"), createStep("schema", "a"), createStep("extract", "e")];
    expect(moveStepTo(steps, 2, 1).map((step) => step.id)).toEqual(["s", "e", "a"]);
    expect(moveStepTo(steps, 1, 3).map((step) => step.id)).toEqual(["s", "e", "a"]);
    expect(moveStepTo(steps, 0, 2).map((step) => step.id)).toEqual(["s", "a", "e"]);
  });

  it("does not remove the source", () => {
    const steps = [createStep("source", "s"), createStep("extract", "e")];
    expect(removeStep(steps, "s")).toHaveLength(2);
    expect(removeStep(steps, "e").map((step) => step.id)).toEqual(["s"]);
  });
});

describe("resolveColumns / validatePipeline", () => {
  it("uses the nearest upstream schema, then a custom field list", () => {
    const schema: SchemaStep = {
      ...createStep("schema", "a"),
      columns: [{ key: "name", label: "Name", type: "string" }],
    };
    const custom: CustomStep = { ...createStep("custom", "c"), fields: "amount: number" };
    const steps = [createStep("source", "s"), schema, createStep("extract", "e"), custom];
    expect(resolveColumns(steps, "e")).toEqual(schema.columns);
    expect(resolveColumns(steps, "c")[0]?.key).toBe("amount");
  });

  it("requires a source, a run step, and columns", () => {
    const empty = [createStep("source", "s")];
    expect(validatePipeline(empty, false)).toMatch(/source/i);
    const source: SourceStep = { ...createStep("source", "s"), source: "hello" };
    expect(validatePipeline([source], false)).toMatch(/extract/i);
    const noCols = [source, createStep("extract", "e")];
    expect(validatePipeline(noCols, false)).toMatch(/columns/i);
    const ok = [
      source,
      { ...createStep("schema", "a"), columns: [{ key: "n", label: "N", type: "string" as const }] },
      createStep("extract", "e"),
    ];
    expect(validatePipeline(ok, false)).toBeNull();
    expect(validatePipeline([createStep("source", "s"), createStep("extract", "e")], true)).toMatch(
      /columns/i,
    );
  });
});

describe("patchStep / stepTitle / isAddableKind", () => {
  it("patches without changing kind", () => {
    const steps = [createStep("source", "s")];
    expect(patchStep(steps, "s", { source: "doc" })[0]).toMatchObject({
      kind: "source",
      source: "doc",
    });
  });

  it("titles custom steps from the label", () => {
    expect(stepTitle(createStep("extract", "e"))).toBe("Extract");
    expect(stepTitle({ ...createStep("custom", "c"), label: "  Totals  " })).toBe("Totals");
  });

  it("accepts palette kinds only", () => {
    expect(isAddableKind("custom")).toBe(true);
    expect(isAddableKind("source")).toBe(false);
  });
});
