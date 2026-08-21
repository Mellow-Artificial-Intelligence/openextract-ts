export const DEFAULT_URL_FETCH_TIMEOUT = 30;
export const DEFAULT_MAX_REDIRECTS = 10;
export const DEFAULT_RETRY_MAX_BACKOFF = 60;
export const DEFAULT_MAX_INPUT_BYTES = 50 * 1024 * 1024;
export const MAX_SWARM_SIZE = 16;
export const URL_TIMEOUT_ENV = "OPENEXTRACT_URL_TIMEOUT";
export const MAX_REDIRECTS_ENV = "OPENEXTRACT_MAX_REDIRECTS";
export const ALLOW_PRIVATE_URLS_ENV = "OPENEXTRACT_ALLOW_PRIVATE_URLS";
export const MAX_INPUT_BYTES_ENV = "OPENEXTRACT_MAX_INPUT_BYTES";
export const DEFAULT_SANDBOX_TIMEOUT = 300;
export const SANDBOX_TIMEOUT_ENV = "OPENEXTRACT_SANDBOX_TIMEOUT";
export const SANDBOX_SNAPSHOT_ENV = "OPENEXTRACT_SANDBOX_SNAPSHOT_ID";

function envPositiveFloat(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function envPositiveInt(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

/** True when AI Gateway credentials (API key or Vercel OIDC) are present. */
export function hasGatewayCredentials(): boolean {
  return Boolean(process.env.AI_GATEWAY_API_KEY?.trim() || process.env.VERCEL_OIDC_TOKEN?.trim());
}

export function allowPrivateUrls(): boolean {
  return ["1", "true", "yes"].includes(
    (process.env[ALLOW_PRIVATE_URLS_ENV] ?? "").toLowerCase(),
  );
}

export function urlFetchTimeout(): number {
  return envPositiveFloat(URL_TIMEOUT_ENV, DEFAULT_URL_FETCH_TIMEOUT);
}

export function maxRedirects(): number {
  return envPositiveInt(MAX_REDIRECTS_ENV, DEFAULT_MAX_REDIRECTS);
}

export function resolveMaxInputBytes(maxInputBytes?: number): number {
  if (maxInputBytes === undefined) {
    const raw = process.env[MAX_INPUT_BYTES_ENV]?.trim();
    if (!raw) return DEFAULT_MAX_INPUT_BYTES;
    const value = Number(raw);
    if (!Number.isInteger(value) || value < 1) {
      throw new Error(`${MAX_INPUT_BYTES_ENV} must be a positive integer.`);
    }
    return value;
  }
  if (!Number.isInteger(maxInputBytes) || maxInputBytes < 1) {
    throw new Error("maxInputBytes must be a positive integer.");
  }
  return maxInputBytes;
}

export function validateRetryOptions(
  maxRetries: number,
  retryBackoff: number,
  retryMaxBackoff: number,
): void {
  if (!Number.isInteger(maxRetries) || maxRetries < 0) {
    throw new Error("maxRetries must be a non-negative integer.");
  }
  if (!Number.isFinite(retryBackoff) || retryBackoff < 0) {
    throw new Error("retryBackoff must be a finite non-negative number of seconds.");
  }
  if (!Number.isFinite(retryMaxBackoff) || retryMaxBackoff < 0) {
    throw new Error("retryMaxBackoff must be a finite non-negative number of seconds.");
  }
}

export function validateMaxConcurrency(maxConcurrency: number): void {
  if (!Number.isInteger(maxConcurrency) || maxConcurrency < 1) {
    throw new Error("maxConcurrency must be a positive integer.");
  }
}

export function validateSwarmSize(size: number): number {
  if (!Number.isInteger(size) || size < 1 || size > MAX_SWARM_SIZE) {
    throw new Error(`size must be an integer from 1 to ${MAX_SWARM_SIZE}.`);
  }
  return size;
}

/** Validates that `value` is one of `allowed`, with a consistent message across options. */
export function normalizeChoice<T extends string>(
  name: string,
  allowed: readonly T[],
  value: string,
): T {
  if ((allowed as readonly string[]).includes(value)) return value as T;
  throw new Error(
    `${name} must be one of ${allowed.map((item) => `'${item}'`).join(", ")}; got '${value}'.`,
  );
}

export function validateTimeout(value: number, name: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a finite positive number of seconds.`);
  }
  return value;
}

export function resolveSandboxTimeoutSeconds(timeout?: number): number {
  if (timeout !== undefined) return validateTimeout(timeout, "sandbox.timeout");
  const raw = process.env[SANDBOX_TIMEOUT_ENV]?.trim();
  if (!raw) return DEFAULT_SANDBOX_TIMEOUT;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_SANDBOX_TIMEOUT;
}
