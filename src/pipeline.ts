import { resolveMaxInputBytes, validateTimeout } from "./config.js";
import { withExtractionErrors } from "./errors.js";
import { getMedia } from "./media.js";
import { runExtraction, type LanguageModel } from "./model.js";
import { runWithRetries } from "./retry.js";
import { resolveSandboxStyle, runSandboxExtraction } from "./sandbox.js";
import { ExtractionStyle, normalizeStyle, withStyleWorkspace } from "./styles.js";
import {
  RetryPolicy,
  type ExtractOptions,
  type ExtractionInputLike,
  type SandboxOptions,
  type Usage,
} from "./types.js";
import type { z } from "zod";

export interface ResolvedExtractOptions {
  style: ExtractionStyle;
  limit: number;
  maxRetries: number;
  retryBackoff: number;
  retryMaxBackoff: number;
  timeoutMs?: number;
  instructions?: string;
  mediaType?: string;
  instrument?: boolean;
  sandbox?: SandboxOptions;
}

export function resolveExtractOptions(options: ExtractOptions = {}): ResolvedExtractOptions {
  const retry = new RetryPolicy({
    maxRetries: options.maxRetries,
    backoff: options.retryBackoff,
    maxBackoff: options.retryMaxBackoff,
  });
  return {
    style: normalizeStyle(options.style ?? ExtractionStyle.DIRECT),
    limit: resolveMaxInputBytes(options.maxInputBytes),
    maxRetries: retry.maxRetries,
    retryBackoff: retry.backoff,
    retryMaxBackoff: retry.maxBackoff,
    timeoutMs: options.timeout != null ? validateTimeout(options.timeout, "timeout") * 1000 : undefined,
    instructions: options.instructions,
    mediaType: options.mediaType,
    instrument: options.instrument,
    sandbox: options.sandbox,
  };
}

export async function runLoadedExtraction<T>(
  schema: z.ZodType<T>,
  model: LanguageModel,
  data: Uint8Array,
  mediaType: string,
  options: ResolvedExtractOptions,
): Promise<{ output: T; usage: Usage; attempts: number }> {
  const style = resolveSandboxStyle(options.style, model);
  if (style === ExtractionStyle.SANDBOX) {
    let attempts = 0;
    const result = await runWithRetries(
      () => {
        attempts += 1;
        return withExtractionErrors(() =>
          runSandboxExtraction({
            schema,
            model,
            data,
            mediaType,
            instructions: options.instructions,
            timeoutMs: options.timeoutMs,
            sandbox: options.sandbox,
          }),
        );
      },
      {
        maxRetries: options.maxRetries,
        retryBackoff: options.retryBackoff,
        retryMaxBackoff: options.retryMaxBackoff,
      },
    );
    return { ...result, attempts };
  }
  return withStyleWorkspace(style, data, mediaType, async (prepared) => {
    let attempts = 0;
    const result = await runWithRetries(
      () => {
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
    return { ...result, attempts };
  });
}

export async function runDocumentExtraction<T>(
  schema: z.ZodType<T>,
  model: LanguageModel,
  inputFile: ExtractionInputLike,
  options: ResolvedExtractOptions,
): Promise<{ output: T; usage: Usage; attempts: number }> {
  const { data, mediaType } = await withExtractionErrors(() =>
    getMedia(inputFile, { mediaType: options.mediaType, maxInputBytes: options.limit }),
  );
  return runLoadedExtraction(schema, model, data, mediaType, options);
}

export function selectExtractionResult<T>(
  result: { output: T; usage: Usage },
  withUsage: boolean,
): T | { output: T; usage: Usage } {
  return withUsage ? { output: result.output, usage: result.usage } : result.output;
}
