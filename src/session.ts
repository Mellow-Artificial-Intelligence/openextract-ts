import { validateTimeout } from "./config.js";
import {
  resolveExtractOptions,
  runDocumentExtraction,
  selectExtractionResult,
  type ResolvedExtractOptions,
} from "./pipeline.js";
import type { LanguageModel } from "./model.js";
import { RetryPolicy, type ExtractOptions, type ExtractionInputLike, type Usage } from "./types.js";
import type { z } from "zod";

export interface ExtractorOptions extends Pick<
  ExtractOptions,
  "instructions" | "style" | "timeout" | "instrument" | "maxInputBytes"
> {
  retryPolicy?: RetryPolicy;
  urlTimeout?: number;
}

export class Extractor<T> {
  private readonly schema: z.ZodType<T>;
  private readonly model: LanguageModel;
  private readonly options: ResolvedExtractOptions;
  private closed = false;

  constructor(schema: z.ZodType<T>, model: LanguageModel, options: ExtractorOptions = {}) {
    const retry = options.retryPolicy ?? new RetryPolicy();
    this.schema = schema;
    this.model = model;
    this.options = resolveExtractOptions({
      ...options,
      maxRetries: retry.maxRetries,
      retryBackoff: retry.backoff,
      retryMaxBackoff: retry.maxBackoff,
    });
    if (options.urlTimeout != null) validateTimeout(options.urlTimeout, "urlTimeout");
  }

  async extract(inputFile: ExtractionInputLike, options: { mediaType?: string } = {}): Promise<T> {
    return (await this.run(inputFile, options, false)) as T;
  }

  async extractWithUsage(
    inputFile: ExtractionInputLike,
    options: { mediaType?: string } = {},
  ): Promise<{ output: T; usage: Usage }> {
    return (await this.run(inputFile, options, true)) as { output: T; usage: Usage };
  }

  close(): void {
    this.closed = true;
  }

  async [Symbol.asyncDispose](): Promise<void> {
    this.close();
  }

  private async run(
    inputFile: ExtractionInputLike,
    options: { mediaType?: string },
    withUsage: boolean,
  ): Promise<T | { output: T; usage: Usage }> {
    if (this.closed) throw new Error("Extractor is closed and cannot be reused.");
    return selectExtractionResult(
      await runDocumentExtraction(this.schema, this.model, inputFile, {
        ...this.options,
        mediaType: options.mediaType,
      }),
      withUsage,
    );
  }
}

export { Extractor as AsyncExtractor };
