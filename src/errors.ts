import {
  APICallError,
  LoadAPIKeyError,
  NoObjectGeneratedError,
  TypeValidationError,
} from "ai";
import {
  ExtractionError,
  ModelError,
  ProviderNotInstalledError,
  SchemaValidationError,
  UrlFetchError,
} from "./exceptions.js";

const TRANSIENT_STATUSES = new Set([408, 409, 425, 429]);

export function parseRetryAfter(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return value;
  }
  if (typeof value !== "string") return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds;
  const date = Date.parse(value);
  if (Number.isNaN(date)) return null;
  const remaining = (date - Date.now()) / 1000;
  return Number.isFinite(remaining) && remaining >= 0 ? remaining : null;
}

function headerRetryAfter(headers?: Record<string, string>): number | null {
  if (!headers) return null;
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === "retry-after") return parseRetryAfter(value);
  }
  return null;
}

export function mapException(error: unknown): ExtractionError {
  if (error instanceof ExtractionError) return error;
  if (error instanceof TypeError) throw error;
  if (NoObjectGeneratedError.isInstance(error) || TypeValidationError.isInstance(error)) {
    return new SchemaValidationError(`Model output did not match schema: ${error.message}`);
  }
  if (LoadAPIKeyError.isInstance(error)) {
    return new ProviderNotInstalledError(
      "No AI Gateway credentials found. Set AI_GATEWAY_API_KEY (or deploy on Vercel with OIDC). " +
        `Original error: ${error.message}`,
    );
  }
  if (APICallError.isInstance(error)) {
    const statusCode = error.statusCode ?? null;
    return new ModelError(`Model API error: ${error.message}`, {
      statusCode,
      retryable: error.isRetryable,
      retryAfter: headerRetryAfter(error.responseHeaders),
    });
  }
  if (error instanceof Error && /fetch|network|ECONN|ENOTFOUND|ETIMEDOUT/i.test(error.message)) {
    return new UrlFetchError(`Failed to fetch URL: ${error.message}`);
  }
  return new ExtractionError(
    `Extraction failed: ${error instanceof Error ? error.message : String(error)}`,
  );
}

export async function withExtractionErrors<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof TypeError || error instanceof ExtractionError) throw error;
    throw mapException(error);
  }
}

export function isTransientStatus(statusCode: number | null): boolean {
  return statusCode != null && (TRANSIENT_STATUSES.has(statusCode) || (statusCode >= 500 && statusCode <= 599));
}
