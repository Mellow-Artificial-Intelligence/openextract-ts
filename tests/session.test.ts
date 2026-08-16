import { describe, expect, it } from "vitest";
import { AsyncExtractor, Extractor } from "../src/session.js";
import { RetryPolicy, isExtractionInput, resolveItem } from "../src/types.js";
import { mockModel, Person } from "./helpers.js";

describe("Extractor", () => {
  it("reuses schema and model across calls", async () => {
    const extractor = new Extractor(Person, mockModel({ name: "Ada", age: 36 }), {
      retryPolicy: new RetryPolicy({ maxRetries: 0 }),
      urlTimeout: 5,
    });
    const first = await extractor.extract(Buffer.from("a"), { mediaType: "text/plain" });
    const { output, usage } = await extractor.extractWithUsage(Buffer.from("b"), {
      mediaType: "text/plain",
    });
    expect(first.name).toBe("Ada");
    expect(output.age).toBe(36);
    expect(usage.totalTokens).toBeGreaterThan(0);
    extractor.close();
    await expect(
      extractor.extract(Buffer.from("c"), { mediaType: "text/plain" }),
    ).rejects.toThrow(/closed/);
  });

  it("accepts a defined agent and supports async dispose", async () => {
    const { defineAgent } = await import("../src/agent.js");
    const agent = defineAgent({
      description: "Session agent",
      model: mockModel({ name: "Ada", age: 36 }),
      outputSchema: Person,
    });
    const extractor = new Extractor(agent);
    await expect(extractor.extract(Buffer.from("a"), { mediaType: "text/plain" })).resolves.toEqual({
      name: "Ada",
      age: 36,
    });
    await extractor[Symbol.asyncDispose]();
    await expect(extractor.extract(Buffer.from("b"), { mediaType: "text/plain" })).rejects.toThrow(/closed/);
    expect(AsyncExtractor).toBe(Extractor);
    expect(isExtractionInput({ source: "./a.txt", name: "a" })).toBe(true);
    expect(resolveItem({ source: "./a.txt", name: "a" }, "text/plain")).toEqual({
      source: "./a.txt",
      mediaType: "text/plain",
      name: "a",
    });
    expect(resolveItem("./a.txt", "text/plain")).toEqual({ source: "./a.txt", mediaType: "text/plain" });
  });
});
