import {
  isDefinedAgent,
  resolveOutputSchema,
  soleLocalMember,
  withMemberOptions,
  type DefinedAgent,
  type ExtractAgent,
} from "./agent.js";
import type { LanguageModel } from "./model.js";
import {
  resolveExtractOptions,
  runDocumentExtraction,
  selectExtractionResult,
} from "./pipeline.js";
import { extractSwarmWithResults } from "./swarm.js";
import type { ExtractOptions, ExtractionInputLike, Usage } from "./types.js";
import type { z } from "zod";

export type { ExtractOptions };

interface ExtractCall<T> {
  schema: z.ZodType<T>;
  model: ExtractAgent;
  input: ExtractionInputLike;
  options: ExtractOptions;
}

/** Normalizes both call shapes: (schema, model, input, options) and (agent, input, options). */
function resolveCall<T>(
  schemaOrAgent: z.ZodType<T> | DefinedAgent,
  modelOrInput: ExtractAgent | ExtractionInputLike,
  inputOrOptions: ExtractionInputLike | ExtractOptions | undefined,
  options: ExtractOptions,
): ExtractCall<T> {
  if (isDefinedAgent(schemaOrAgent)) {
    return {
      schema: resolveOutputSchema(schemaOrAgent) as z.ZodType<T>,
      model: schemaOrAgent,
      input: modelOrInput as ExtractionInputLike,
      options: (inputOrOptions as ExtractOptions | undefined) ?? {},
    };
  }
  return {
    schema: schemaOrAgent,
    model: modelOrInput as ExtractAgent,
    input: inputOrOptions as ExtractionInputLike,
    options,
  };
}

async function runExtract<T>(
  call: ExtractCall<T>,
  withUsage: boolean,
): Promise<T | { output: T; usage: Usage }> {
  const member = soleLocalMember(call.model);
  if (isDefinedAgent(call.model) && !member) {
    const swarm = await extractSwarmWithResults(call.schema, call.model, call.input, call.options);
    return selectExtractionResult(swarm, withUsage);
  }
  return selectExtractionResult(
    await runDocumentExtraction(
      call.schema,
      member?.model ?? (call.model as LanguageModel),
      call.input,
      resolveExtractOptions(withMemberOptions(call.options, member)),
    ),
    withUsage,
  );
}

export async function extract<T>(
  schema: z.ZodType<T>,
  model: ExtractAgent,
  inputFile: ExtractionInputLike,
  options?: ExtractOptions,
): Promise<T>;
export async function extract<T>(
  agent: DefinedAgent,
  inputFile: ExtractionInputLike,
  options?: ExtractOptions,
): Promise<T>;
export async function extract<T>(
  schemaOrAgent: z.ZodType<T> | DefinedAgent,
  modelOrInput: ExtractAgent | ExtractionInputLike,
  inputOrOptions?: ExtractionInputLike | ExtractOptions,
  options: ExtractOptions = {},
): Promise<T> {
  return (await runExtract(
    resolveCall(schemaOrAgent, modelOrInput, inputOrOptions, options),
    false,
  )) as T;
}

export async function extractWithUsage<T>(
  schema: z.ZodType<T>,
  model: ExtractAgent,
  inputFile: ExtractionInputLike,
  options?: ExtractOptions,
): Promise<{ output: T; usage: Usage }>;
export async function extractWithUsage<T>(
  agent: DefinedAgent,
  inputFile: ExtractionInputLike,
  options?: ExtractOptions,
): Promise<{ output: T; usage: Usage }>;
export async function extractWithUsage<T>(
  schemaOrAgent: z.ZodType<T> | DefinedAgent,
  modelOrInput: ExtractAgent | ExtractionInputLike,
  inputOrOptions?: ExtractionInputLike | ExtractOptions,
  options: ExtractOptions = {},
): Promise<{ output: T; usage: Usage }> {
  return (await runExtract(
    resolveCall(schemaOrAgent, modelOrInput, inputOrOptions, options),
    true,
  )) as { output: T; usage: Usage };
}

export const extractAsync = extract;
export const extractWithUsageAsync = extractWithUsage;
