import {
  DEFAULT_RETRY_MAX_BACKOFF,
  resolveMaxInputBytes,
  validateMaxConcurrency,
  validateRetryOptions,
} from "./config.js";
import { withExtractionErrors } from "./errors.js";
import type { ExtractOptions } from "./extract.js";
import { getMedia, itemSourceLabel } from "./media.js";
import { modelIdentifier, runExtraction, type LanguageModel } from "./model.js";
import { runWithRetries } from "./retry.js";
import { ExtractionStyle, normalizeStyle, withStyleWorkspace } from "./styles.js";
import {
  resolveItem,
  type ExtractionInputLike,
  type ExtractionResult,
} from "./types.js";
import type { z } from "zod";

export interface ExtractManyOptions extends ExtractOptions {
  maxConcurrency?: number;
  returnExceptions?: boolean;
}

async function runItem<T>(
  schema: z.ZodType<T>,
  model: LanguageModel,
  item: ExtractionInputLike,
  options: {
    instructions?: string;
    style: ExtractionStyle;
    mediaType?: string;
    limit: number;
    maxRetries: number;
    retryBackoff: number;
    retryMaxBackoff: number;
    timeoutMs?: number;
    instrument?: boolean;
    rich: boolean;
  },
): Promise<T | ExtractionResult<T>> {
  const { source, mediaType, name } = resolveItem(item, options.mediaType);
  const started = performance.now();
  let attempts = 0;
  const { data, mediaType: resolvedType } = await withExtractionErrors(() =>
    getMedia(source, { mediaType, maxInputBytes: options.limit }),
  );
  return withStyleWorkspace(options.style, data, resolvedType, async (prepared) => {
    const result = await runWithRetries(
      async () => {
        attempts += 1;
        return withExtractionErrors(() =>
          runExtraction({
            schema,
            model,
            instructions: options.instructions,
            prompt: prepared.prompt,
            file: prepared.file,
            tools: prepared.tools,
            timeoutMs: options.timeoutMs,
            instrument: options.instrument,
          }),
        );
      },
      {
        maxRetries: options.maxRetries,
        retryBackoff: options.retryBackoff,
        retryMaxBackoff: options.retryMaxBackoff,
      },
    );
    if (!options.rich) return result.output;
    return {
      output: result.output,
      usage: result.usage,
      attempts,
      duration: (performance.now() - started) / 1000,
      model: modelIdentifier(model),
      mediaType: mediaType ?? null,
      source: itemSourceLabel(source, name),
      warnings: [],
    };
  });
}

async function gather<T>(
  schema: z.ZodType<T>,
  model: LanguageModel,
  inputFiles: Iterable<ExtractionInputLike>,
  options: ExtractManyOptions,
  rich: boolean,
): Promise<Array<T | ExtractionResult<T> | Error>> {
  const maxRetries = options.maxRetries ?? 0;
  const retryBackoff = options.retryBackoff ?? 1;
  const retryMaxBackoff = options.retryMaxBackoff ?? DEFAULT_RETRY_MAX_BACKOFF;
  validateRetryOptions(maxRetries, retryBackoff, retryMaxBackoff);
  const maxConcurrency = options.maxConcurrency ?? 5;
  validateMaxConcurrency(maxConcurrency);
  const items = [...inputFiles];
  const shared = {
    instructions: options.instructions,
    style: normalizeStyle(options.style ?? ExtractionStyle.DIRECT),
    mediaType: options.mediaType,
    limit: resolveMaxInputBytes(options.maxInputBytes),
    maxRetries,
    retryBackoff,
    retryMaxBackoff,
    timeoutMs: options.timeout != null ? options.timeout * 1000 : undefined,
    instrument: options.instrument,
    rich,
  };
  const results: Array<T | ExtractionResult<T> | Error> = new Array(items.length);
  let next = 0;
  let firstError: unknown;
  const worker = async () => {
    for (;;) {
      if (firstError) return;
      const index = next++;
      if (index >= items.length) return;
      const item = items[index]!;
      try {
        results[index] = await runItem(schema, model, item, shared);
      } catch (error) {
        if (options.returnExceptions) {
          results[index] = error instanceof Error ? error : new Error(String(error));
        } else {
          firstError = error;
          return;
        }
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(maxConcurrency, items.length) }, () => worker()));
  if (firstError) throw firstError;
  return results;
}

export async function extractMany<T>(
  schema: z.ZodType<T>,
  model: LanguageModel,
  inputFiles: Iterable<ExtractionInputLike>,
  options: ExtractManyOptions = {},
): Promise<Array<T | Error>> {
  return gather(schema, model, inputFiles, options, false) as Promise<Array<T | Error>>;
}

export async function extractManyWithResults<T>(
  schema: z.ZodType<T>,
  model: LanguageModel,
  inputFiles: Iterable<ExtractionInputLike>,
  options: ExtractManyOptions = {},
): Promise<Array<ExtractionResult<T> | Error>> {
  return gather(schema, model, inputFiles, options, true) as Promise<
    Array<ExtractionResult<T> | Error>
  >;
}

export async function* iterExtractMany<T>(
  schema: z.ZodType<T>,
  model: LanguageModel,
  inputFiles: Iterable<ExtractionInputLike>,
  options: ExtractManyOptions = {},
): AsyncGenerator<[number, T | Error]> {
  const maxRetries = options.maxRetries ?? 0;
  const retryBackoff = options.retryBackoff ?? 1;
  const retryMaxBackoff = options.retryMaxBackoff ?? DEFAULT_RETRY_MAX_BACKOFF;
  validateRetryOptions(maxRetries, retryBackoff, retryMaxBackoff);
  const maxConcurrency = options.maxConcurrency ?? 5;
  validateMaxConcurrency(maxConcurrency);
  const items = [...inputFiles];
  const shared = {
    instructions: options.instructions,
    style: normalizeStyle(options.style ?? ExtractionStyle.DIRECT),
    mediaType: options.mediaType,
    limit: resolveMaxInputBytes(options.maxInputBytes),
    maxRetries,
    retryBackoff,
    retryMaxBackoff,
    timeoutMs: options.timeout != null ? options.timeout * 1000 : undefined,
    instrument: options.instrument,
    rich: false as const,
  };
  const pending = new Map<Promise<[number, T | Error]>, number>();
  let next = 0;
  const start = (index: number) => {
    const item = items[index]!;
    const promise = runItem(schema, model, item, shared)
      .then((value) => [index, value as T] as [number, T | Error])
      .catch((error: unknown) => {
        const err = error instanceof Error ? error : new Error(String(error));
        if (!options.returnExceptions) throw err;
        return [index, err] as [number, T | Error];
      });
    pending.set(promise, index);
  };
  while (next < items.length && pending.size < maxConcurrency) start(next++);
  while (pending.size > 0) {
    const settled = await Promise.race(pending.keys());
    for (const [promise, index] of pending) {
      if (index === settled[0]) pending.delete(promise);
    }
    yield settled;
    if (next < items.length) start(next++);
  }
}

export const extractManyAsync = extractMany;
export const extractManyWithResultsAsync = extractManyWithResults;
export const iterExtractManyAsync = iterExtractMany;
