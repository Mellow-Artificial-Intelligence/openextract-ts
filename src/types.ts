import { DEFAULT_RETRY_MAX_BACKOFF, validateRetryOptions } from "./config.js";
import type { ExtractionStyle } from "./styles.js";

export type MediaSource = string | URL | Uint8Array | NodeJS.ReadableStream;

export interface ExtractOptions {
  instructions?: string;
  style?: ExtractionStyle | string;
  mediaType?: string;
  maxInputBytes?: number;
  maxRetries?: number;
  retryBackoff?: number;
  retryMaxBackoff?: number;
  timeout?: number;
  instrument?: boolean;
}

export interface ExtractionInput {
  source: MediaSource;
  mediaType?: string;
  name?: string;
}

export type ExtractionInputLike = MediaSource | ExtractionInput;

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface ExtractionResult<T> {
  output: T;
  usage: Usage;
  attempts: number;
  duration: number;
  model: string | null;
  mediaType: string | null;
  source: string | null;
  warnings: readonly string[];
}

export class RetryPolicy {
  readonly maxRetries: number;
  readonly backoff: number;
  readonly maxBackoff: number;

  constructor(
    options: {
      maxRetries?: number;
      backoff?: number;
      maxBackoff?: number;
    } = {},
  ) {
    this.maxRetries = options.maxRetries ?? 0;
    this.backoff = options.backoff ?? 1;
    this.maxBackoff = options.maxBackoff ?? DEFAULT_RETRY_MAX_BACKOFF;
    validateRetryOptions(this.maxRetries, this.backoff, this.maxBackoff);
  }
}

/** Normalizes a usage-shaped value (model result or remote agent payload) into `Usage`. */
export function toUsage(value: unknown): Usage {
  const usage = (typeof value === "object" && value !== null ? value : {}) as Record<string, unknown>;
  return {
    inputTokens: Number(usage.inputTokens) || 0,
    outputTokens: Number(usage.outputTokens) || 0,
    totalTokens: Number(usage.totalTokens) || 0,
  };
}

/** Builds the rich result shape shared by batch and swarm runs. */
export function toExtractionResult<T>(
  result: { output: T; usage: Usage; attempts: number },
  meta: { started: number; model: string | null; mediaType: string | null; source: string | null },
): ExtractionResult<T> {
  return {
    output: result.output,
    usage: result.usage,
    attempts: result.attempts,
    duration: (performance.now() - meta.started) / 1000,
    model: meta.model,
    mediaType: meta.mediaType,
    source: meta.source,
    warnings: [],
  };
}

export function totalUsage<T>(results: Iterable<ExtractionResult<T>>): Usage {
  let inputTokens = 0;
  let outputTokens = 0;
  let totalTokens = 0;
  for (const result of results) {
    inputTokens += result.usage.inputTokens;
    outputTokens += result.usage.outputTokens;
    totalTokens += result.usage.totalTokens;
  }
  return { inputTokens, outputTokens, totalTokens };
}

export function resolveItem(
  item: ExtractionInputLike,
  globalMediaType?: string,
): { source: MediaSource; mediaType?: string; name?: string } {
  if (isExtractionInput(item)) {
    return {
      source: item.source,
      mediaType: item.mediaType ?? globalMediaType,
      name: item.name,
    };
  }
  return { source: item, mediaType: globalMediaType };
}

export function isExtractionInput(value: ExtractionInputLike): value is ExtractionInput {
  return (
    typeof value === "object" &&
    value !== null &&
    !(value instanceof URL) &&
    !(value instanceof Uint8Array) &&
    "source" in value
  );
}
