import { describe, expect, it } from "vitest";
import { DEFAULT_MAX_INPUT_BYTES, DEFAULT_RETRY_MAX_BACKOFF } from "../src/config.js";
import { resolveExtractOptions } from "../src/pipeline.js";
import { ExtractionStyle } from "../src/styles.js";

describe("resolveExtractOptions", () => {
  it("applies shared defaults", () => {
    const opts = resolveExtractOptions();
    expect(opts.style).toBe(ExtractionStyle.DIRECT);
    expect(opts.limit).toBe(DEFAULT_MAX_INPUT_BYTES);
    expect(opts.maxRetries).toBe(0);
    expect(opts.retryBackoff).toBe(1);
    expect(opts.retryMaxBackoff).toBe(DEFAULT_RETRY_MAX_BACKOFF);
    expect(opts.timeoutMs).toBeUndefined();
  });

  it("rejects invalid timeout", () => {
    expect(() => resolveExtractOptions({ timeout: 0 })).toThrow(/timeout/);
  });
});
