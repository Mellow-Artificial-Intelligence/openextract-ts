import { describe, expect, it, vi } from "vitest";
import { extractWorkflow, extractManyWorkflow } from "../src/workflow.js";
import {
  resolveWorkflowSource,
  runSerializableExtract,
  runSerializableExtractMany,
  workflowExtractOptions,
} from "../src/workflow.js";
import { mockModel } from "./helpers.js";

const PersonSchema = {
  type: "object",
  properties: { name: { type: "string" }, age: { type: "number" } },
  required: ["name", "age"],
};

describe("resolveWorkflowSource", () => {
  it("decodes base64 bytes", () => {
    const input = resolveWorkflowSource({
      data: Buffer.from("hello").toString("base64"),
      mediaType: "text/plain",
      name: "note.txt",
    });
    expect(input).toEqual({
      source: Buffer.from("hello"),
      mediaType: "text/plain",
      name: "note.txt",
    });
  });

  it("passes through a URL", () => {
    expect(resolveWorkflowSource({ source: "https://example.com/doc.pdf" })).toBe(
      "https://example.com/doc.pdf",
    );
  });

  it("requires mediaType for base64", () => {
    expect(() => resolveWorkflowSource({ data: "YQ==" })).toThrow(/mediaType/);
  });
});

describe("workflowExtractOptions", () => {
  it("forwards serializable extract options", () => {
    expect(
      workflowExtractOptions({
        instructions: "Be brief",
        style: "search",
        maxRetries: 2,
        timeout: 15,
      }),
    ).toEqual({
      instructions: "Be brief",
      style: "search",
      maxInputBytes: undefined,
      maxRetries: 2,
      retryBackoff: undefined,
      retryMaxBackoff: undefined,
      timeout: 15,
    });
  });
});

describe("runSerializableExtract", () => {
  it("loads JSON Schema and extracts", async () => {
    const result = await runSerializableExtract(
      {
        schema: PersonSchema,
        model: "openai/gpt-5.5",
        input: { data: Buffer.from("doc").toString("base64"), mediaType: "text/plain" },
      },
      mockModel({ name: "Ada", age: 36 }, { inputTokens: 4, outputTokens: 2 }),
    );
    expect(result.output).toEqual({ name: "Ada", age: 36 });
    expect(result.usage.totalTokens).toBe(6);
  });

  it("extracts a batch from serializable inputs", async () => {
    const results = await runSerializableExtractMany(
      {
        schema: PersonSchema,
        model: "openai/gpt-5.5",
        inputs: [
          { data: Buffer.from("a").toString("base64"), mediaType: "text/plain" },
          { data: Buffer.from("b").toString("base64"), mediaType: "text/plain" },
        ],
      },
      mockModel({ name: "Ada", age: 36 }),
    );
    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({ output: { name: "Ada", age: 36 } });
  });
});

describe("workflow exports", () => {
  it("exposes startable workflow functions", () => {
    expect(typeof extractWorkflow).toBe("function");
    expect(typeof extractManyWorkflow).toBe("function");
  });

  it("passes through a named path source", () => {
    expect(resolveWorkflowSource({ source: "./a.txt", name: "a", mediaType: "text/plain" })).toEqual({
      source: "./a.txt",
      mediaType: "text/plain",
      name: "a",
    });
    expect(() => resolveWorkflowSource({})).toThrow(/source \(path\/URL\) or data/);
  });

  it("runs extractWorkflow through the serializable path", async () => {
    const extract = await import("../src/extract.js");
    const spy = vi.spyOn(extract, "extractWithUsage").mockResolvedValue({
      output: { name: "Ada", age: 36 },
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
    });
    try {
      await expect(
        extractWorkflow({
          schema: PersonSchema,
          model: "openai/gpt-5.5",
          input: { data: Buffer.from("doc").toString("base64"), mediaType: "text/plain" },
        }),
      ).resolves.toEqual({
        output: { name: "Ada", age: 36 },
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      });
      await expect(
        extractManyWorkflow({
          schema: PersonSchema,
          model: "openai/gpt-5.5",
          inputs: [
            { data: Buffer.from("a").toString("base64"), mediaType: "text/plain" },
            { data: Buffer.from("b").toString("base64"), mediaType: "text/plain" },
          ],
          maxConcurrency: 1,
        }),
      ).resolves.toHaveLength(2);
      spy.mockRejectedValueOnce(new Error("nope"));
      await expect(
        extractManyWorkflow({
          schema: PersonSchema,
          model: "openai/gpt-5.5",
          inputs: [{ data: Buffer.from("a").toString("base64"), mediaType: "text/plain" }],
          returnExceptions: true,
        }),
      ).resolves.toEqual([{ error: "nope", errorType: "Error" }]);
    } finally {
      spy.mockRestore();
    }
  });
});
