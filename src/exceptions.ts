export class ExtractionError extends Error {
  override name = "ExtractionError";
}

export class ModelError extends ExtractionError {
  override name = "ModelError";
  readonly provider: string | null;
  readonly statusCode: number | null;
  readonly retryable: boolean;
  readonly retryAfter: number | null;

  constructor(
    message: string,
    options: {
      provider?: string | null;
      statusCode?: number | null;
      retryable?: boolean | null;
      retryAfter?: number | null;
    } = {},
  ) {
    super(message);
    this.provider = options.provider ?? null;
    this.statusCode = options.statusCode ?? null;
    this.retryable =
      options.retryable ??
      (this.statusCode == null ||
        [408, 409, 425, 429].includes(this.statusCode) ||
        (this.statusCode >= 500 && this.statusCode <= 599));
    this.retryAfter = options.retryAfter ?? null;
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
