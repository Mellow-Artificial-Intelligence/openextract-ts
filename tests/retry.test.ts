import { describe, expect, it, vi } from "vitest";
import { ModelError } from "../src/exceptions.js";
import { retryDelay, runWithRetries } from "../src/retry.js";

describe("retry", () => {
  it("prefers a bounded Retry-After", () => {
    expect(retryDelay(1, 10, 0, 3)).toBe(3);
    expect(retryDelay(1, 2, 0, 9)).toBe(2);
  });

  it("uses exponential backoff with jitter", () => {
    const delay = retryDelay(1, 60, 2, null);
    expect(delay).toBeGreaterThanOrEqual(4);
    expect(delay).toBeLessThanOrEqual(5);
  });

  it("retries transient ModelError then succeeds", async () => {
    let calls = 0;
    const result = await runWithRetries(
      async () => {
        calls += 1;
        if (calls < 3) throw new ModelError("busy", { statusCode: 429, retryAfter: 0 });
        return "ok";
      },
      { maxRetries: 3, retryBackoff: 0, retryMaxBackoff: 0 },
    );
    expect(result).toBe("ok");
    expect(calls).toBe(3);
  });

  it("does not retry permanent errors", async () => {
    const fn = vi.fn(async () => {
      throw new ModelError("nope", { statusCode: 401, retryable: false });
    });
    await expect(
      runWithRetries(fn, { maxRetries: 3, retryBackoff: 0, retryMaxBackoff: 0 }),
    ).rejects.toBeInstanceOf(ModelError);
    expect(fn).toHaveBeenCalledOnce();
  });
});
