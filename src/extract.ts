import {
  resolveExtractOptions,
  runDocumentExtraction,
  selectExtractionResult,
} from "./pipeline.js";
import type { LanguageModel } from "./model.js";
import type { ExtractOptions, ExtractionInputLike, Usage } from "./types.js";
import type { z } from "zod";

export type { ExtractOptions };

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
  return selectExtractionResult(
    await runDocumentExtraction(schema, model, inputFile, resolveExtractOptions(options)),
    withUsage,
  );
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
