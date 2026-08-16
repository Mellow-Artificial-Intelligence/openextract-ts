import { describe, expect, it } from "vitest";
import { extract, extractAsync, extractWithUsage, extractWithUsageAsync } from "../src/extract.js";
import { ModelError, SchemaValidationError } from "../src/exceptions.js";
import { routeModel } from "../src/model.js";
import { mockModel, mockModelFn, Person } from "./helpers.js";

describe("routeModel", () => {
  it("converts pydantic-ai prefixes to AI Gateway ids", () => {
    expect(routeModel("openai:gpt-5.5")).toBe("openai/gpt-5.5");
    expect(routeModel("openai-chat:gpt-5.5")).toBe("openai/gpt-5.5");
    expect(routeModel("google-gla:gemini-2.5-pro")).toBe("google/gemini-2.5-pro");
    expect(routeModel("xai/grok-4.6")).toBe("xai/grok-4.6");
  });
});

describe("extract", () => {
  it("returns validated structured output", async () => {
    const result = await extract(Person, mockModel({ name: "Ada", age: 36 }), Buffer.from("doc"), {
      mediaType: "text/plain",
    });
    expect(result).toEqual({ name: "Ada", age: 36 });
  });

  it("returns usage alongside output", async () => {
    const { output, usage } = await extractWithUsage(
      Person,
      mockModel({ name: "Ada", age: 36 }, { inputTokens: 11, outputTokens: 7 }),
      Buffer.from("doc"),
      { mediaType: "text/plain" },
    );
    expect(output.name).toBe("Ada");
    expect(usage.inputTokens).toBe(11);
    expect(usage.outputTokens).toBe(7);
    expect(usage.totalTokens).toBe(18);
  });

  it("maps invalid model JSON to SchemaValidationError", async () => {
    await expect(
      extract(Person, mockModel({ name: "Ada" }), Buffer.from("doc"), {
        mediaType: "text/plain",
      }),
    ).rejects.toBeInstanceOf(SchemaValidationError);
  });

  it("retries a transient API error", async () => {
    let calls = 0;
    const model = mockModelFn(() => {
      calls += 1;
      if (calls === 1) {
        throw new ModelError("rate limited", { statusCode: 429, retryAfter: 0 });
      }
      return { output: { name: "Ada", age: 36 } };
    });
    const result = await extract(Person, model, Buffer.from("doc"), {
      mediaType: "text/plain",
      maxRetries: 1,
      retryBackoff: 0,
      retryMaxBackoff: 0,
    });
    expect(result.age).toBe(36);
    expect(calls).toBe(2);
  });

  it("extracts with a defined agent via extractWithUsage", async () => {
    const { defineAgent } = await import("../src/agent.js");
    const agent = defineAgent({
      description: "Person reader",
      model: mockModel({ name: "Ada", age: 36 }, { inputTokens: 3, outputTokens: 1 }),
      outputSchema: Person,
    });
    const { output, usage } = await extractWithUsage(agent, Buffer.from("doc"), {
      mediaType: "text/plain",
    });
    expect(output).toEqual({ name: "Ada", age: 36 });
    expect(usage.totalTokens).toBe(4);
    expect(extractAsync).toBe(extract);
    expect(extractWithUsageAsync).toBe(extractWithUsage);
    const { writeFile } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const { tmpdir } = await import("node:os");
    const path = join(tmpdir(), `openextract-agent-${Date.now()}.txt`);
    await writeFile(path, "doc");
    await expect(extract(agent, path)).resolves.toEqual({ name: "Ada", age: 36 });
    await expect(extractWithUsage(agent, path)).resolves.toMatchObject({ output: { name: "Ada", age: 36 } });
  });

  it("surfaces exhausted model errors", async () => {
    const model = mockModelFn(() => {
      throw new ModelError("unavailable", { statusCode: 503, retryAfter: 0 });
    });
    await expect(
      extract(Person, model, Buffer.from("doc"), {
        mediaType: "text/plain",
        maxRetries: 1,
        retryBackoff: 0,
        retryMaxBackoff: 0,
      }),
    ).rejects.toBeInstanceOf(ModelError);
  });
});
