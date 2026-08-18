export const TRANSIENT_STATUSES = new Set([408, 409, 425, 429]);

export function isTransientStatus(statusCode: number | null): boolean {
  return (
    statusCode != null &&
    (TRANSIENT_STATUSES.has(statusCode) || (statusCode >= 500 && statusCode <= 599))
  );
}

export class ExtractionError extends Error {
  override name = "ExtractionError";
}

export interface RetryableErrorOptions {
  statusCode?: number | null;
  retryable?: boolean | null;
  retryAfter?: number | null;
}

/** Base for errors the retry loop inspects: a status code plus an explicit or inferred retryable flag. */
export class RetryableExtractionError extends ExtractionError {
  readonly statusCode: number | null;
  readonly retryable: boolean;
  readonly retryAfter: number | null;

  constructor(message: string, options: RetryableErrorOptions, retryWhenUnknown: boolean) {
    super(message);
    this.statusCode = options.statusCode ?? null;
    this.retryable =
      options.retryable ??
      (this.statusCode == null ? retryWhenUnknown : isTransientStatus(this.statusCode));
    this.retryAfter = options.retryAfter ?? null;
  }
}

export class ModelError extends RetryableExtractionError {
  override name = "ModelError";
  readonly provider: string | null;

  constructor(message: string, options: RetryableErrorOptions & { provider?: string | null } = {}) {
    super(message, options, true);
    this.provider = options.provider ?? null;
  }
}

export class ProviderNotInstalledError extends ExtractionError {
  override name = "ProviderNotInstalledError";
}

export class InputTooLargeError extends ExtractionError {
  override name = "InputTooLargeError";
}

export class SchemaValidationError extends ExtractionError {
  override name = "SchemaValidationError";
}

export class UrlFetchError extends ExtractionError {
  override name = "UrlFetchError";
}

export class RemoteAgentError extends RetryableExtractionError {
  override name = "RemoteAgentError";
  readonly url: string | null;

  constructor(message: string, options: RetryableErrorOptions & { url?: string | null } = {}) {
    super(message, options, false);
    this.url = options.url ?? null;
  }
}
