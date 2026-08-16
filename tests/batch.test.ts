import { describe, expect, it } from "vitest";
import {
  extractMany,
  extractManyAsync,
  extractManyWithResults,
  extractManyWithResultsAsync,
  iterExtractMany,
  iterExtractManyAsync,
} from "../src/batch.js";
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
    const { writeFile } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const { tmpdir } = await import("node:os");
    const path = join(tmpdir(), `openextract-batch-${Date.now()}.txt`);
    await writeFile(path, "doc");
    const results = await extractManyWithResults(
      Person,
      mockModel({ name: "Ada", age: 36 }, { inputTokens: 5, outputTokens: 2 }),
      [path, { source: path, name: "b" }],
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
      [Buffer.from("a"), Buffer.from("b"), Buffer.from("c")],
      { mediaType: "text/plain", maxConcurrency: 2 },
    )) {
      seen.push(index);
      expect(result).toMatchObject({ name: "Ada" });
    }
    expect(seen.sort()).toEqual([0, 1, 2]);
  });

  it("uses a single local agent and returns per-item errors", async () => {
    const { defineAgent } = await import("../src/agent.js");
    const agent = defineAgent({
      description: "Batch",
      model: mockModel({ name: "Ada", age: 36 }),
    });
    const results = await extractMany(
      Person,
      agent,
      [Buffer.from("a"), Buffer.from("b")],
      { mediaType: "text/plain" },
    );
    expect(results).toHaveLength(2);
    const { defineAgent: define } = await import("../src/agent.js");
    const team = define({
      description: "Team",
      subagents: [mockModel({ name: "Ada", age: 36 }), mockModel({ name: "Ada", age: 36 })],
    });
    await expect(extractMany(Person, team, [Buffer.from("a")], { mediaType: "text/plain" })).rejects.toThrow(
      /single local agent/,
    );
  });

  it("collects exceptions when asked", async () => {
    const { ModelError } = await import("../src/exceptions.js");
    const { mockModelFn } = await import("./helpers.js");
    let n = 0;
    const model = mockModelFn(() => {
      n += 1;
      if (n === 1) throw new ModelError("nope", { statusCode: 400, retryable: false });
      return { output: { name: "Ada", age: 36 } };
    });
    const results = await extractMany(Person, model, [Buffer.from("a"), Buffer.from("b")], {
      mediaType: "text/plain",
      returnExceptions: true,
    });
    expect(results[0]).toBeInstanceOf(Error);
    expect(results[1]).toEqual({ name: "Ada", age: 36 });
    let calls = 0;
    const failing = mockModelFn(async () => {
      calls += 1;
      if (calls === 1) {
        await new Promise((resolve) => setTimeout(resolve, 40));
        return { output: { name: "Ada", age: 36 } };
      }
      throw new ModelError("nope", { statusCode: 400, retryable: false });
    });
    await expect(
      extractMany(Person, failing, [Buffer.from("c"), Buffer.from("d"), Buffer.from("e"), Buffer.from("f")], {
        mediaType: "text/plain",
        maxConcurrency: 2,
      }),
    ).rejects.toBeInstanceOf(ModelError);
  });

  it("yields errors from iterExtractMany", async () => {
    const { ModelError } = await import("../src/exceptions.js");
    const { mockModelFn } = await import("./helpers.js");
    const model = mockModelFn(() => {
      throw new ModelError("nope", { statusCode: 400, retryable: false });
    });
    const seen: Array<Error | object> = [];
    for await (const [, result] of iterExtractMany(Person, model, [Buffer.from("a")], {
      mediaType: "text/plain",
      returnExceptions: true,
    })) {
      seen.push(result);
    }
    expect(seen[0]).toBeInstanceOf(Error);
    await expect(
      (async () => {
        for await (const item of iterExtractMany(Person, model, [Buffer.from("a")], {
          mediaType: "text/plain",
        })) {
          void item;
        }
      })(),
    ).rejects.toBeInstanceOf(ModelError);
    expect(extractManyAsync).toBe(extractMany);
    expect(extractManyWithResultsAsync).toBe(extractManyWithResults);
    expect(iterExtractManyAsync).toBe(iterExtractMany);
  });
});
