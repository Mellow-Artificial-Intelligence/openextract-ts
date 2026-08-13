import {
  DEFAULT_RETRY_MAX_BACKOFF,
  resolveMaxInputBytes,
  validateRetryOptions,
} from "./config.js";
import { withExtractionErrors } from "./errors.js";
import { getMedia } from "./media.js";
import { runExtraction } from "./model.js";
import { runWithRetries } from "./retry.js";
import { ExtractionStyle, normalizeStyle, withStyleWorkspace } from "./styles.js";
import type { ExtractionInputLike, Usage } from "./types.js";
import type { LanguageModel } from "./model.js";
import type { z } from "zod";

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

function oneshotOptions(options: ExtractOptions = {}) {
  const maxRetries = options.maxRetries ?? 0;
  const retryBackoff = options.retryBackoff ?? 1;
  const retryMaxBackoff = options.retryMaxBackoff ?? DEFAULT_RETRY_MAX_BACKOFF;
  validateRetryOptions(maxRetries, retryBackoff, retryMaxBackoff);
  return {
    style: normalizeStyle(options.style ?? ExtractionStyle.DIRECT),
    limit: resolveMaxInputBytes(options.maxInputBytes),
    maxRetries,
    retryBackoff,
    retryMaxBackoff,
    timeoutMs: options.timeout != null ? options.timeout * 1000 : undefined,
    instructions: options.instructions,
    mediaType: options.mediaType,
    instrument: options.instrument,
  };
}

async function extractPrepared<T>(
  schema: z.ZodType<T>,
  model: LanguageModel,
  inputFile: ExtractionInputLike,
  options: ExtractOptions,
  withUsage: true,
): Promise<{ output: T; usage: Usage }>;
async function extractPrepared<T>(
  schema: z.ZodType<T>,
  model: LanguageModel,
  inputFile: ExtractionInputLike,
  options: ExtractOptions,
  withUsage: false,
): Promise<T>;
async function extractPrepared<T>(
  schema: z.ZodType<T>,
  model: LanguageModel,
  inputFile: ExtractionInputLike,
  options: ExtractOptions,
  withUsage: boolean,
): Promise<T | { output: T; usage: Usage }> {
  const opts = oneshotOptions(options);
  const { data, mediaType } = await withExtractionErrors(() =>
    getMedia(inputFile, { mediaType: opts.mediaType, maxInputBytes: opts.limit }),
  );
  return withStyleWorkspace(opts.style, data, mediaType, async (prepared) => {
    const run = () =>
      withExtractionErrors(() =>
        runExtraction({
          schema,
          model,
          instructions: opts.instructions,
          prompt: prepared.prompt,
          file: prepared.file,
          tools: prepared.tools,
          timeoutMs: opts.timeoutMs,
          instrument: opts.instrument,
        }),
      );
    const result = await runWithRetries(run, opts);
    return withUsage ? result : result.output;
  });
}

export async function extract<T>(
  schema: z.ZodType<T>,
  model: LanguageModel,
  inputFile: ExtractionInputLike,
  options: ExtractOptions = {},
): Promise<T> {
  return extractPrepared(schema, model, inputFile, options, false);
}

export async function extractWithUsage<T>(
  schema: z.ZodType<T>,
  model: LanguageModel,
  inputFile: ExtractionInputLike,
  options: ExtractOptions = {},
): Promise<{ output: T; usage: Usage }> {
  return extractPrepared(schema, model, inputFile, options, true);
}

export const extractAsync = extract;
export const extractWithUsageAsync = extractWithUsage;
