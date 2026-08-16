import { describe, expect, it } from "vitest";
import {
  ExtractionStyle,
  Extractor,
  RetryPolicy,
  defineAgent,
  extract,
  extractMany,
  extractSwarm,
  normalizeReduce,
  routeModel,
} from "../src/index.js";

describe("public exports", () => {
  it("re-exports the library surface", () => {
    expect(typeof extract).toBe("function");
    expect(typeof extractMany).toBe("function");
    expect(typeof extractSwarm).toBe("function");
    expect(typeof defineAgent).toBe("function");
    expect(typeof routeModel).toBe("function");
    expect(typeof normalizeReduce).toBe("function");
    expect(Extractor).toBeTypeOf("function");
    expect(new RetryPolicy().maxRetries).toBe(0);
    expect(ExtractionStyle.DIRECT).toBe("direct");
  });
});
