import { APICallError, LoadAPIKeyError, TypeValidationError } from "ai";
import { describe, expect, it } from "vitest";
import { mapException, parseRetryAfter } from "../src/errors.js";
import {
  isTransientStatus,
  ModelError,
  ProviderNotInstalledError,
  SchemaValidationError,
} from "../src/exceptions.js";

describe("error mapping", () => {
  it("treats rate-limit and 5xx statuses as transient", () => {
    expect(isTransientStatus(429)).toBe(true);
    expect(isTransientStatus(503)).toBe(true);
    expect(isTransientStatus(401)).toBe(false);
    expect(isTransientStatus(null)).toBe(false);
  });

  it("parses Retry-After seconds and HTTP dates", () => {
    expect(parseRetryAfter("2")).toBe(2);
    expect(parseRetryAfter(-1)).toBeNull();
    const future = new Date(Date.now() + 5000).toUTCString();
    expect(parseRetryAfter(future)).toBeGreaterThan(0);
  });

  it("maps API, schema, and credential failures", () => {
    const model = mapException(
      new APICallError({
        message: "boom",
        url: "https://example.com",
        requestBodyValues: {},
        statusCode: 429,
        responseHeaders: { "retry-after": "1" },
        isRetryable: true,
      }),
    );
    expect(model).toBeInstanceOf(ModelError);
    expect((model as ModelError).retryable).toBe(true);
    expect((model as ModelError).retryAfter).toBe(1);

    expect(mapException(new TypeValidationError({ value: {}, cause: new Error("bad") }))).toBeInstanceOf(
      SchemaValidationError,
    );
    expect(mapException(new LoadAPIKeyError({ message: "missing" }))).toBeInstanceOf(
      ProviderNotInstalledError,
    );
  });
});
