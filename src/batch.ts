import {
  isDefinedAgent,
  soleLocalMember,
  withMemberOptions,
  type ExtractAgent,
} from "./agent.js";
import { validateMaxConcurrency } from "./config.js";
import { runPool } from "./concurrency.js";
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
  toExtractionResult,
  type ExtractOptions,
  type ExtractionInputLike,
  type ExtractionResult,
} from "./types.js";
import type { z } from "zod";

export interface ExtractManyOptions extends ExtractOptions {
  maxConcurrency?: number;
  returnExceptions?: boolean;
}

interface PreparedBatch {
  model: LanguageModel;
  options: ResolvedExtractOptions;
  maxConcurrency: number;
  items: ExtractionInputLike[];
}

function prepareBatch(
  model: ExtractAgent,
  inputFiles: Iterable<ExtractionInputLike>,
  options: ExtractManyOptions,
): PreparedBatch {
  const member = soleLocalMember(model);
  if (isDefinedAgent(model) && !member) {
    throw new Error("extractMany expects a single local agent; use extract or extractSwarm.");
  }
  const maxConcurrency = options.maxConcurrency ?? 5;
  validateMaxConcurrency(maxConcurrency);
  return {
    model: member?.model ?? (model as LanguageModel),
    options: resolveExtractOptions(withMemberOptions(options, member)),
    maxConcurrency,
    items: [...inputFiles],
  };
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
  return toExtractionResult(result, {
    started,
    model: modelIdentifier(model),
    mediaType: mediaType ?? null,
    source: itemSourceLabel(source, name),
  });
}

async function gather<T>(
  schema: z.ZodType<T>,
  model: ExtractAgent,
  inputFiles: Iterable<ExtractionInputLike>,
  options: ExtractManyOptions,
  rich: boolean,
): Promise<Array<T | ExtractionResult<T> | Error>> {
  const batch = prepareBatch(model, inputFiles, options);
  const results: Array<T | ExtractionResult<T> | Error> = new Array(batch.items.length);
  let firstError: unknown;
  let failed = false;
  await runPool(
    batch.items.length,
    batch.maxConcurrency,
    async (index) => {
      try {
        results[index] = await runItem(schema, batch.model, batch.items[index]!, batch.options, rich);
      } catch (error) {
        if (options.returnExceptions) results[index] = toError(error);
        else {
          firstError = error;
          failed = true;
        }
      }
    },
    () => failed,
  );
  if (failed) throw firstError;
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
  const batch = prepareBatch(model, inputFiles, options);
  const pending = new Map<Promise<[number, T | Error]>, number>();
  let next = 0;
  const start = (index: number) => {
    const promise = runItem(schema, batch.model, batch.items[index]!, batch.options, false)
      .then((value) => [index, value as T] as [number, T | Error])
      .catch((error: unknown) => {
        const err = toError(error);
        if (!options.returnExceptions) throw err;
        return [index, err] as [number, T | Error];
      });
    pending.set(promise, index);
  };
  while (next < batch.items.length && pending.size < batch.maxConcurrency) start(next++);
  while (pending.size > 0) {
    const settled = await Promise.race(pending.keys());
    for (const [promise, index] of pending) {
      if (index === settled[0]) pending.delete(promise);
    }
    yield settled;
    if (next < batch.items.length) start(next++);
  }
}

export const extractManyAsync = extractMany;
export const extractManyWithResultsAsync = extractManyWithResults;
export const iterExtractManyAsync = iterExtractMany;
