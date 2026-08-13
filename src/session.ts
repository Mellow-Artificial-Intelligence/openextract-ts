import { resolveMaxInputBytes, validateTimeout } from "./config.js";
import { withExtractionErrors } from "./errors.js";
import { getMedia } from "./media.js";
import { runExtraction, type LanguageModel } from "./model.js";
import { runWithRetries } from "./retry.js";
import { ExtractionStyle, normalizeStyle, withStyleWorkspace } from "./styles.js";
import { RetryPolicy, type ExtractionInputLike, type Usage } from "./types.js";
import type { z } from "zod";

export interface ExtractorOptions {
  instructions?: string;
  style?: ExtractionStyle | string;
  timeout?: number;
  instrument?: boolean;
  retryPolicy?: RetryPolicy;
  maxInputBytes?: number;
  urlTimeout?: number;
}

export class Extractor<T> {
  private readonly schema: z.ZodType<T>;
  private readonly model: LanguageModel;
  private readonly instructions?: string;
  private readonly style: ExtractionStyle;
  private readonly timeoutMs?: number;
  private readonly instrument?: boolean;
  private readonly retryPolicy: RetryPolicy;
  private readonly maxInputBytes: number;
  private closed = false;

  constructor(schema: z.ZodType<T>, model: LanguageModel, options: ExtractorOptions = {}) {
    this.schema = schema;
    this.model = model;
    this.instructions = options.instructions;
    this.style = normalizeStyle(options.style ?? ExtractionStyle.DIRECT);
    this.timeoutMs = options.timeout != null ? validateTimeout(options.timeout, "timeout") * 1000 : undefined;
    this.instrument = options.instrument;
    this.retryPolicy = options.retryPolicy ?? new RetryPolicy();
    this.maxInputBytes = resolveMaxInputBytes(options.maxInputBytes);
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
    const { data, mediaType } = await withExtractionErrors(() =>
      getMedia(inputFile, { mediaType: options.mediaType, maxInputBytes: this.maxInputBytes }),
    );
    return withStyleWorkspace(this.style, data, mediaType, async (prepared) => {
      const result = await runWithRetries(
        () =>
          withExtractionErrors(() =>
            runExtraction({
              schema: this.schema,
              model: this.model,
              instructions: this.instructions,
              prompt: prepared.prompt,
              file: prepared.file,
              tools: prepared.tools,
              timeoutMs: this.timeoutMs,
              instrument: this.instrument,
            }),
          ),
        {
          maxRetries: this.retryPolicy.maxRetries,
          retryBackoff: this.retryPolicy.backoff,
          retryMaxBackoff: this.retryPolicy.maxBackoff,
        },
      );
      return withUsage ? result : result.output;
    });
  }
}

export { Extractor as AsyncExtractor };
