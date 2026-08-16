import {
  flattenAgent,
  isDefinedAgent,
  isRemoteMember,
  resolveOutputSchema,
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

function localMember(model: ExtractAgent) {
  if (!isDefinedAgent(model)) return null;
  const members = flattenAgent(model);
  const member = members[0];
  if (members.length !== 1 || !member || isRemoteMember(member)) return null;
  return member;
}

async function extractPrepared<T>(
  schema: z.ZodType<T>,
  model: ExtractAgent,
  inputFile: ExtractionInputLike,
  options: ExtractOptions,
  withUsage: true,
): Promise<{ output: T; usage: Usage }>;
async function extractPrepared<T>(
  schema: z.ZodType<T>,
  model: ExtractAgent,
  inputFile: ExtractionInputLike,
  options: ExtractOptions,
  withUsage: false,
): Promise<T>;
async function extractPrepared<T>(
  schema: z.ZodType<T>,
  model: ExtractAgent,
  inputFile: ExtractionInputLike,
  options: ExtractOptions,
  withUsage: boolean,
): Promise<T | { output: T; usage: Usage }> {
  const member = localMember(model);
  if (isDefinedAgent(model) && !member) {
    const swarm = await extractSwarmWithResults(schema, model, inputFile, options);
    return withUsage ? { output: swarm.output, usage: swarm.usage } : swarm.output;
  }
  return selectExtractionResult(
    await runDocumentExtraction(
      schema,
      member?.model ?? (model as LanguageModel),
      inputFile,
      resolveExtractOptions({
        ...options,
        style: member?.style ?? options.style,
        instructions: member?.instructions ?? options.instructions,
      }),
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
  if (isDefinedAgent(schemaOrAgent)) {
    return extractPrepared(
      resolveOutputSchema(schemaOrAgent) as z.ZodType<T>,
      schemaOrAgent,
      modelOrInput as ExtractionInputLike,
      (inputOrOptions as ExtractOptions | undefined) ?? {},
      false,
    );
  }
  return extractPrepared(
    schemaOrAgent,
    modelOrInput as ExtractAgent,
    inputOrOptions as ExtractionInputLike,
    options,
    false,
  );
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
  if (isDefinedAgent(schemaOrAgent)) {
    return extractPrepared(
      resolveOutputSchema(schemaOrAgent) as z.ZodType<T>,
      schemaOrAgent,
      modelOrInput as ExtractionInputLike,
      (inputOrOptions as ExtractOptions | undefined) ?? {},
      true,
    );
  }
  return extractPrepared(
    schemaOrAgent,
    modelOrInput as ExtractAgent,
    inputOrOptions as ExtractionInputLike,
    options,
    true,
  );
}

export const extractAsync = extract;
export const extractWithUsageAsync = extractWithUsage;
