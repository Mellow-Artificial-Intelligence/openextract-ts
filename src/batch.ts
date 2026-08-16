import { flattenAgent, isDefinedAgent, isRemoteMember, type ExtractAgent } from "./agent.js";
import { validateMaxConcurrency } from "./config.js";
import { toError } from "./errors.js";
import { itemSourceLabel } from "./media.js";
import { modelIdentifier, type LanguageModel } from "./model.js";
import {
  resolveExtractOptions,
  runDocumentExtraction,
  type ResolvedExtractOptions,
} from "./pipeline.js";
import {
  resolveItem,
  type ExtractOptions,
  type ExtractionInputLike,
  type ExtractionResult,
} from "./types.js";
import type { z } from "zod";

function resolveBatchAgent(model: ExtractAgent): { model: LanguageModel; options: ExtractOptions } {
  if (!isDefinedAgent(model)) return { model, options: {} };
  const members = flattenAgent(model);
  const member = members[0];
  if (members.length !== 1 || !member || isRemoteMember(member)) {
    throw new Error("extractMany expects a single local agent; use extract or extractSwarm.");
  }
  return { model: member.model, options: { style: member.style, instructions: member.instructions } };
}

export interface ExtractManyOptions extends ExtractOptions {
  maxConcurrency?: number;
  returnExceptions?: boolean;
}

function resolveBatchOptions(options: ExtractManyOptions) {
  const resolved = resolveExtractOptions(options);
  const maxConcurrency = options.maxConcurrency ?? 5;
  validateMaxConcurrency(maxConcurrency);
  return { resolved, maxConcurrency };
}

async function runItem<T>(
  schema: z.ZodType<T>,
  model: LanguageModel,
  item: ExtractionInputLike,
  options: ResolvedExtractOptions,
  rich: boolean,
): Promise<T | ExtractionResult<T>> {
  const { source, mediaType, name } = resolveItem(item, options.mediaType);
  const started = performance.now();
  const result = await runDocumentExtraction(schema, model, source, { ...options, mediaType });
  if (!rich) return result.output;
  return {
    output: result.output,
    usage: result.usage,
    attempts: result.attempts,
    duration: (performance.now() - started) / 1000,
    model: modelIdentifier(model),
    mediaType: mediaType ?? null,
    source: itemSourceLabel(source, name),
    warnings: [],
  };
}

async function gather<T>(
  schema: z.ZodType<T>,
  model: ExtractAgent,
  inputFiles: Iterable<ExtractionInputLike>,
  options: ExtractManyOptions,
  rich: boolean,
): Promise<Array<T | ExtractionResult<T> | Error>> {
  const agent = resolveBatchAgent(model);
  const { resolved, maxConcurrency } = resolveBatchOptions({
    ...options,
    style: agent.options.style ?? options.style,
    instructions: agent.options.instructions ?? options.instructions,
  });
  const items = [...inputFiles];
  const results: Array<T | ExtractionResult<T> | Error> = new Array(items.length);
  let next = 0;
  let firstError: unknown;
  const worker = async () => {
    for (;;) {
      if (firstError) return;
      const index = next++;
      if (index >= items.length) return;
      const item = items[index]!;
      try {
        results[index] = await runItem(schema, agent.model, item, resolved, rich);
      } catch (error) {
        if (options.returnExceptions) {
          results[index] = toError(error);
        } else {
          firstError = error;
          return;
        }
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(maxConcurrency, items.length) }, () => worker()));
  if (firstError) throw firstError;
  return results;
}

export async function extractMany<T>(
  schema: z.ZodType<T>,
  model: ExtractAgent,
  inputFiles: Iterable<ExtractionInputLike>,
  options: ExtractManyOptions = {},
): Promise<Array<T | Error>> {
  return gather(schema, model, inputFiles, options, false) as Promise<Array<T | Error>>;
}

export async function extractManyWithResults<T>(
  schema: z.ZodType<T>,
  model: ExtractAgent,
  inputFiles: Iterable<ExtractionInputLike>,
  options: ExtractManyOptions = {},
): Promise<Array<ExtractionResult<T> | Error>> {
  return gather(schema, model, inputFiles, options, true) as Promise<
    Array<ExtractionResult<T> | Error>
  >;
}

export async function* iterExtractMany<T>(
  schema: z.ZodType<T>,
  model: ExtractAgent,
  inputFiles: Iterable<ExtractionInputLike>,
  options: ExtractManyOptions = {},
): AsyncGenerator<[number, T | Error]> {
  const agent = resolveBatchAgent(model);
  const { resolved, maxConcurrency } = resolveBatchOptions({
    ...options,
    style: agent.options.style ?? options.style,
    instructions: agent.options.instructions ?? options.instructions,
  });
  const items = [...inputFiles];
  const pending = new Map<Promise<[number, T | Error]>, number>();
  let next = 0;
  const start = (index: number) => {
    const item = items[index]!;
    const promise = runItem(schema, agent.model, item, resolved, false)
      .then((value) => [index, value as T] as [number, T | Error])
      .catch((error: unknown) => {
        const err = toError(error);
        if (!options.returnExceptions) throw err;
        return [index, err] as [number, T | Error];
      });
    pending.set(promise, index);
  };
  while (next < items.length && pending.size < maxConcurrency) start(next++);
  while (pending.size > 0) {
    const settled = await Promise.race(pending.keys());
    for (const [promise, index] of pending) {
      if (index === settled[0]) pending.delete(promise);
    }
    yield settled;
    if (next < items.length) start(next++);
  }
}

export const extractManyAsync = extractMany;
export const extractManyWithResultsAsync = extractManyWithResults;
export const iterExtractManyAsync = iterExtractMany;
