import { extractWithUsage, type ExtractOptions } from "./extract.js";
import { toError } from "./errors.js";
import { extractManyWithResults, type ExtractManyOptions } from "./batch.js";
import type { LanguageModel } from "./model.js";
import { loadSchema } from "./schema.js";
import type { ExtractionInputLike, ExtractionResult, Usage } from "./types.js";

export type JsonSchema = Record<string, unknown>;

/** Path/URL or base64 bytes. Zod schemas are not serializable — pass JSON Schema instead. */
export interface ExtractWorkflowSource {
  source?: string;
  data?: string;
  mediaType?: string;
  name?: string;
}

export interface ExtractWorkflowInput {
  schema: JsonSchema | string;
  model: string;
  input: ExtractWorkflowSource;
  instructions?: string;
  style?: "direct" | "search" | "code";
  maxInputBytes?: number;
  maxRetries?: number;
  retryBackoff?: number;
  retryMaxBackoff?: number;
  timeout?: number;
}

export interface ExtractManyWorkflowInput extends Omit<ExtractWorkflowInput, "input"> {
  inputs: ExtractWorkflowSource[];
  maxConcurrency?: number;
  returnExceptions?: boolean;
}

export interface ExtractWorkflowResult {
  output: unknown;
  usage: Usage;
}

export type ExtractWorkflowFailure = { error: string; errorType: string };
export type ExtractManyWorkflowItem = ExtractWorkflowResult | ExtractWorkflowFailure;

export function resolveWorkflowSource(input: ExtractWorkflowSource): ExtractionInputLike {
  if (input.data != null) {
    if (!input.mediaType) throw new Error("mediaType is required when data is base64 bytes.");
    return { source: Buffer.from(input.data, "base64"), mediaType: input.mediaType, name: input.name };
  }
  if (!input.source) throw new Error("Each input needs source (path/URL) or data (base64).");
  return input.mediaType || input.name
    ? { source: input.source, mediaType: input.mediaType, name: input.name }
    : input.source;
}

export function workflowExtractOptions(
  input: Pick<
    ExtractWorkflowInput,
    "instructions" | "style" | "maxInputBytes" | "maxRetries" | "retryBackoff" | "retryMaxBackoff" | "timeout"
  >,
): ExtractOptions {
  return {
    instructions: input.instructions,
    style: input.style,
    maxInputBytes: input.maxInputBytes,
    maxRetries: input.maxRetries,
    retryBackoff: input.retryBackoff,
    retryMaxBackoff: input.retryMaxBackoff,
    timeout: input.timeout,
  };
}

/** Runs extraction from serializable workflow arguments. `model` is overridable for tests. */
export async function runSerializableExtract(
  input: ExtractWorkflowInput,
  model: LanguageModel = input.model,
): Promise<ExtractWorkflowResult> {
  const schema = await loadSchema(input.schema);
  return extractWithUsage(schema, model, resolveWorkflowSource(input.input), workflowExtractOptions(input));
}

export async function runSerializableExtractMany(
  input: ExtractManyWorkflowInput,
  model: LanguageModel = input.model,
): Promise<Array<ExtractionResult<unknown> | Error>> {
  const schema = await loadSchema(input.schema);
  const options: ExtractManyOptions = {
    ...workflowExtractOptions(input),
    maxConcurrency: input.maxConcurrency,
    returnExceptions: input.returnExceptions,
  };
  return extractManyWithResults(
    schema,
    model,
    input.inputs.map((item) => resolveWorkflowSource(item)),
    options,
  );
}

/**
 * Durable extraction. Call with `start(extractWorkflow, [input])` from `workflow/api`.
 * Next.js apps should wrap `next.config` with `withWorkflow` and set
 * `transpilePackages: ["openextract"]` so the directives are compiled.
 */
export async function extractWorkflow(input: ExtractWorkflowInput): Promise<ExtractWorkflowResult> {
  "use workflow";
  console.log("extractWorkflow", input.model, input.style ?? "direct");
  return extractDocumentStep(input);
}

export async function extractManyWorkflow(
  input: ExtractManyWorkflowInput,
): Promise<ExtractManyWorkflowItem[]> {
  "use workflow";
  console.log("extractManyWorkflow", input.model, input.inputs.length);
  const concurrency = input.maxConcurrency ?? 5;
  const results: ExtractManyWorkflowItem[] = [];
  for (let i = 0; i < input.inputs.length; i += concurrency) {
    const chunk = input.inputs.slice(i, i + concurrency);
    results.push(
      ...(await Promise.all(
        chunk.map((item) => {
          const next = { ...input, input: item };
          return input.returnExceptions ? extractDocumentSettledStep(next) : extractDocumentStep(next);
        }),
      )),
    );
  }
  return results;
}

async function extractDocumentStep(input: ExtractWorkflowInput): Promise<ExtractWorkflowResult> {
  "use step";
  console.log("extractDocumentStep", input.model);
  return runSerializableExtract(input);
}

async function extractDocumentSettledStep(input: ExtractWorkflowInput): Promise<ExtractManyWorkflowItem> {
  "use step";
  try {
    return await runSerializableExtract(input);
  } catch (error) {
    const err = toError(error);
    return { error: err.message, errorType: err.name };
  }
}
