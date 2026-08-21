import { z } from "zod";
import { EXTRACTION_STYLES } from "../styles.js";

/** Where the bytes come from — shared by every tool that takes one input. */
export const inputFields = {
  source: z.string().optional().describe("Local path or http(s) URL"),
  data: z.string().optional().describe("Base64-encoded bytes (requires mediaType)"),
  mediaType: z.string().optional().describe("MIME type; required for base64 bytes"),
  name: z.string().optional().describe("Optional input label"),
};

/** Schema, model, and extract options shared by every tool. */
export const sharedFields = {
  schema: z
    .union([z.string(), z.record(z.string(), z.unknown())])
    .optional()
    .describe("JSON Schema object/string, or module:exportName. Optional when agent has outputSchema."),
  model: z
    .string()
    .optional()
    .describe(
      "AI Gateway id, e.g. openai/gpt-5.5, or coding agent claude-code / codex. Defaults to OPENEXTRACT_MODEL.",
    ),
  instructions: z.string().optional().describe("Natural-language extraction guidance"),
  style: z.enum(EXTRACTION_STYLES).optional().describe("direct (default), search, code, or sandbox"),
  maxInputBytes: z.number().int().positive().optional(),
  maxRetries: z.number().int().nonnegative().optional(),
  retryBackoff: z.number().nonnegative().optional(),
  retryMaxBackoff: z.number().nonnegative().optional(),
  timeout: z.number().positive().optional().describe("Model call timeout in seconds"),
  agent: z.string().optional().describe("Agent path: directory, file, or module:exportName"),
};

export const maxConcurrencyField = z.number().int().positive().optional();

export function completeStyle(value?: string): string[] {
  return EXTRACTION_STYLES.filter((style) => style.startsWith(value ?? ""));
}
