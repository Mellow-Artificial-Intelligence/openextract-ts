import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_MAX_INPUT_BYTES,
  resolveMaxInputBytes,
  validateMaxConcurrency,
  validateRetryOptions,
  validateSwarmSize,
  validateTimeout,
} from "../src/config.js";

const ENV = [
  "OPENEXTRACT_MAX_INPUT_BYTES",
  "OPENEXTRACT_URL_TIMEOUT",
  "OPENEXTRACT_MAX_REDIRECTS",
  "OPENEXTRACT_ALLOW_PRIVATE_URLS",
];

afterEach(() => {
  for (const key of ENV) delete process.env[key];
});

describe("resolveMaxInputBytes", () => {
  it("uses the 50 MiB default", () => {
    expect(resolveMaxInputBytes()).toBe(DEFAULT_MAX_INPUT_BYTES);
  });

  it("prefers an explicit value", () => {
    process.env.OPENEXTRACT_MAX_INPUT_BYTES = "10";
    expect(resolveMaxInputBytes(99)).toBe(99);
  });

  it("reads the environment when unset", () => {
    process.env.OPENEXTRACT_MAX_INPUT_BYTES = "2048";
    expect(resolveMaxInputBytes()).toBe(2048);
  });

  it("rejects invalid values", () => {
    expect(() => resolveMaxInputBytes(0)).toThrow(/positive integer/);
    process.env.OPENEXTRACT_MAX_INPUT_BYTES = "nope";
    expect(() => resolveMaxInputBytes()).toThrow(/OPENEXTRACT_MAX_INPUT_BYTES/);
  });
});

describe("option validation", () => {
  it("rejects bad retry options", () => {
    expect(() => validateRetryOptions(-1, 1, 1)).toThrow(/maxRetries/);
    expect(() => validateRetryOptions(0, -1, 1)).toThrow(/retryBackoff/);
    expect(() => validateRetryOptions(0, 1, Number.POSITIVE_INFINITY)).toThrow(
      /retryMaxBackoff/,
    );
  });

  it("rejects bad concurrency and timeout", () => {
    expect(() => validateMaxConcurrency(0)).toThrow(/maxConcurrency/);
    expect(() => validateTimeout(0, "timeout")).toThrow(/timeout/);
    expect(() => validateSwarmSize(0)).toThrow(/size/);
    expect(() => validateSwarmSize(99)).toThrow(/size/);
    expect(validateSwarmSize(4)).toBe(4);
  });
});
