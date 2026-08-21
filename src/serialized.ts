import type { ExtractOptions, ExtractionInputLike } from "./types.js";

/** Serializable input used by MCP tools and workflows: a path/URL, or base64 bytes plus mediaType. */
export interface SerializedInput {
  source?: string;
  data?: string;
  mediaType?: string;
  name?: string;
}

/** Extract options as they arrive over a serializable boundary (MCP arguments, workflow input). */
export type SerializedExtractOptions = Omit<ExtractOptions, "instrument">;

/** Splits a comma-separated CLI/env list into trimmed, non-empty entries. */
export function splitList(value: string): string[] {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

export function resolveSerializedInput(input: SerializedInput): ExtractionInputLike {
  if (input.data != null) {
    if (!input.mediaType) throw new Error("mediaType is required when data is base64 bytes.");
    return { source: Buffer.from(input.data, "base64"), mediaType: input.mediaType, name: input.name };
  }
  if (!input.source) throw new Error("Each input needs source (path/URL) or data (base64).");
  return input.mediaType || input.name
    ? { source: input.source, mediaType: input.mediaType, name: input.name }
    : input.source;
}

/** Picks the extract options out of a wider argument bag. */
export function toExtractOptions(args: SerializedExtractOptions): ExtractOptions {
  return {
    instructions: args.instructions,
    style: args.style,
    mediaType: args.mediaType,
    maxInputBytes: args.maxInputBytes,
    maxRetries: args.maxRetries,
    retryBackoff: args.retryBackoff,
    retryMaxBackoff: args.retryMaxBackoff,
    timeout: args.timeout,
  };
}
