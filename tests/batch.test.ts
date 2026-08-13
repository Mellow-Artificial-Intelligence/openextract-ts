import { describe, expect, it } from "vitest";
import { extractMany, extractManyWithResults, iterExtractMany } from "../src/batch.js";
import { totalUsage } from "../src/types.js";
import { mockModel, Person } from "./helpers.js";

describe("batch", () => {
  it("extracts many inputs in order", async () => {
    const results = await extractMany(
      Person,
      mockModel({ name: "Ada", age: 36 }),
      [Buffer.from("a"), Buffer.from("b")],
      { mediaType: "text/plain" },
    );
    expect(results).toEqual([
      { name: "Ada", age: 36 },
      { name: "Ada", age: 36 },
    ]);
  });

  it("returns rich results and aggregates usage", async () => {
    const results = await extractManyWithResults(
      Person,
      mockModel({ name: "Ada", age: 36 }, { inputTokens: 5, outputTokens: 2 }),
      [Buffer.from("a"), Buffer.from("b")],
      { mediaType: "text/plain" },
    );
    expect(results).toHaveLength(2);
    expect(results[0]).not.toBeInstanceOf(Error);
    const usage = totalUsage(results.filter((item) => !(item instanceof Error)));
    expect(usage.inputTokens).toBe(10);
    expect(usage.outputTokens).toBe(4);
  });

  it("yields completion-order pairs", async () => {
    const seen: number[] = [];
    for await (const [index, result] of iterExtractMany(
      Person,
      mockModel({ name: "Ada", age: 36 }),
      [Buffer.from("a"), Buffer.from("b")],
      { mediaType: "text/plain", maxConcurrency: 2 },
    )) {
      seen.push(index);
      expect(result).toMatchObject({ name: "Ada" });
    }
    expect(seen.sort()).toEqual([0, 1]);
  });
});
