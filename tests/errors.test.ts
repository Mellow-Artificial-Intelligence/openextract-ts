import { APICallError, LoadAPIKeyError, NoObjectGeneratedError, TypeValidationError } from "ai";
import { describe, expect, it } from "vitest";
import { headerRetryAfter, mapException, parseRetryAfter, toError, withExtractionErrors } from "../src/errors.js";
import {
  ExtractionError,
  isTransientStatus,
  ModelError,
  ProviderNotInstalledError,
  RemoteAgentError,
  SchemaValidationError,
  UrlFetchError,
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
        responseHeaders: { "X-Other": "nope", "Retry-After": "1" },
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
    expect(mapException(new ExtractionError("kept"))).toBeInstanceOf(ExtractionError);
    expect(
      mapException(
        new NoObjectGeneratedError({
          message: "empty",
          text: "",
          response: { id: "1", timestamp: new Date(), modelId: "m" },
          usage: { inputTokens: { total: 0 }, outputTokens: { total: 0 } },
          finishReason: "stop",
        }),
      ),
    ).toBeInstanceOf(SchemaValidationError);
    expect(mapException(new Error("ENOTFOUND host"))).toBeInstanceOf(UrlFetchError);
    expect(mapException("boom")).toBeInstanceOf(ExtractionError);
    expect(() => mapException(new TypeError("bad"))).toThrow(TypeError);
  });

  it("parses Retry-After edge cases and wraps values", () => {
    expect(parseRetryAfter(5)).toBe(5);
    expect(parseRetryAfter(Number.POSITIVE_INFINITY)).toBeNull();
    expect(parseRetryAfter(true)).toBeNull();
    expect(parseRetryAfter("not-a-date")).toBeNull();
    expect(parseRetryAfter(new Date(Date.now() - 5000).toUTCString())).toBeNull();
    expect(headerRetryAfter()).toBeNull();
    expect(headerRetryAfter({ foo: "1" })).toBeNull();
    expect(headerRetryAfter({ "Retry-After": "2" })).toBe(2);
    expect(toError("x")).toEqual(new Error("x"));
    expect(toError(new Error("y")).message).toBe("y");
  });

  it("maps API errors without retry headers", () => {
    const model = mapException(
      new APICallError({
        message: "boom",
        url: "https://example.com",
        requestBodyValues: {},
        isRetryable: true,
        responseHeaders: { "x-other": "1" },
      }),
    );
    expect(model).toBeInstanceOf(ModelError);
    expect((model as ModelError).retryAfter).toBeNull();
  });

  it("rethrows typed extraction errors from withExtractionErrors", async () => {
    await expect(withExtractionErrors(async () => 1)).resolves.toBe(1);
    await expect(
      withExtractionErrors(async () => {
        throw new TypeError("bad");
      }),
    ).rejects.toBeInstanceOf(TypeError);
    await expect(
      withExtractionErrors(async () => {
        throw new Error("ENOTFOUND");
      }),
    ).rejects.toBeInstanceOf(UrlFetchError);
  });

  it("defaults ModelError and RemoteAgentError retryable flags", () => {
    expect(new ModelError("x").retryable).toBe(true);
    expect(new ModelError("x", { statusCode: 400 }).retryable).toBe(false);
    expect(new RemoteAgentError("x").retryable).toBe(false);
    expect(new RemoteAgentError("x", { statusCode: 503 }).retryable).toBe(true);
  });
});
