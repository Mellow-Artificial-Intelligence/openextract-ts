import { describe, expect, it } from "vitest";
import { z } from "zod";
import { modelIdentifier, routeModel, runExtraction, usageFromResult } from "../src/model.js";
import { mockModel, Person } from "./helpers.js";

describe("routeModel", () => {
  it("passes through objects and unprefixed ids", () => {
    const model = mockModel({ name: "Ada", age: 36 });
    expect(routeModel(model)).toBe(model);
    expect(routeModel("gpt-5.5")).toBe("gpt-5.5");
    expect(routeModel("anthropic:claude")).toBe("anthropic/claude");
  });
});

describe("modelIdentifier", () => {
  it("reads string and object ids", () => {
    expect(modelIdentifier("openai:gpt-5.5")).toBe("openai/gpt-5.5");
    expect(modelIdentifier(mockModel({ name: "Ada", age: 36 }))).toBeTruthy();
    expect(modelIdentifier({} as never)).toBeNull();
  });
});

describe("usageFromResult", () => {
  it("defaults missing token counts", () => {
    expect(usageFromResult({})).toEqual({ inputTokens: 0, outputTokens: 0, totalTokens: 0 });
  });
});

describe("runExtraction", () => {
  it("sends a prompt-only generateText call", async () => {
    const { output, usage } = await runExtraction({
      schema: Person,
      model: mockModel({ name: "Ada", age: 36 }),
      prompt: "Extract",
      instrument: true,
    });
    expect(output).toEqual({ name: "Ada", age: 36 });
    expect(usage.totalTokens).toBeGreaterThan(0);
  });

  it("runs a tool loop when tools are provided", async () => {
    const { tool } = await import("ai");
    const result = await runExtraction({
      schema: z.object({ ok: z.boolean() }),
      model: mockModel({ ok: true }),
      prompt: "Extract",
      instructions: "Use tools",
      timeoutMs: 5_000,
      tools: {
        ping: tool({
          description: "Ping",
          inputSchema: z.object({}),
          execute: async () => "pong",
        }),
      },
    });
    expect(result.output).toEqual({ ok: true });
  });
});
