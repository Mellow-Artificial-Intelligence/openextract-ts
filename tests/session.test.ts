import { describe, expect, it } from "vitest";
import { Extractor } from "../src/session.js";
import { RetryPolicy } from "../src/types.js";
import { mockModel, Person } from "./helpers.js";

describe("Extractor", () => {
  it("reuses schema and model across calls", async () => {
    const extractor = new Extractor(Person, mockModel({ name: "Ada", age: 36 }), {
      retryPolicy: new RetryPolicy({ maxRetries: 0 }),
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
});
