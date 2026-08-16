import {
  flattenAgent,
  isRemoteMember,
  type AgentInput,
  type ResolvedAgentMember,
} from "./agent.js";
import { runRemoteExtraction } from "./agent-remote.js";
import { validateMaxConcurrency, validateSwarmSize } from "./config.js";
import { toError, withExtractionErrors } from "./errors.js";
import { getMedia, itemSourceLabel } from "./media.js";
import { modelIdentifier, type LanguageModel } from "./model.js";
import {
  resolveExtractOptions,
  runLoadedExtraction,
  type ResolvedExtractOptions,
} from "./pipeline.js";
import { normalizeReduce, reduceOutputs, type SwarmReduce } from "./reduce.js";
import {
  resolveItem,
  totalUsage,
  type ExtractOptions,
  type ExtractionInputLike,
  type ExtractionResult,
  type Usage,
} from "./types.js";
import type { z } from "zod";

export type { SwarmReduce };
export type SwarmAgentInput = AgentInput;
export type { ResolvedAgentMember };

export interface SwarmMember {
  model: LanguageModel;
  instructions?: string;
  style?: ExtractOptions["style"];
}

export interface ExtractSwarmOptions extends ExtractOptions {
  size?: number;
  maxConcurrency?: number;
  reduce?: SwarmReduce | string;
}

export interface SwarmResult<T> {
  output: T;
  agents: Array<ExtractionResult<T> | Error>;
  usage: Usage;
  reduce: SwarmReduce;
}

export function resolveSwarmMembers(
  agents: SwarmAgentInput | readonly SwarmAgentInput[],
  size?: number,
): ResolvedAgentMember[] {
  const raw = Array.isArray(agents) ? agents : [agents];
  if (raw.length === 0) throw new Error("agents must include at least one model.");
  const members = raw.flatMap((item) => flattenAgent(item));
  if (members.length === 0) throw new Error("agents must include at least one model.");
  if (members.length === 1) {
    const n = validateSwarmSize(size ?? 1);
    return Array.from({ length: n }, () => ({ ...members[0]! }));
  }
  if (size != null && size !== members.length) {
    throw new Error(
      "size cannot be combined with a multi-agent list; pass one model plus size, or the full agent list.",
    );
  }
  validateSwarmSize(members.length);
  return members;
}

function agentInstructions(base: string | undefined, index: number, total: number): string | undefined {
  if (total === 1) return base;
  const role =
    `You are extraction agent ${index + 1} of ${total}. ` +
    "Work independently. Prefer recall: extract every matching record you can justify from the source.";
  return base?.trim() ? `${base.trim()}\n\n${role}` : role;
}

function memberOptions(
  options: ExtractSwarmOptions,
  member: ResolvedAgentMember,
  index: number,
  total: number,
): ResolvedExtractOptions {
  return resolveExtractOptions({
    ...options,
    style: member.style ?? options.style,
    instructions: agentInstructions(member.instructions ?? options.instructions, index, total),
  });
}

function memberLabel(member: ResolvedAgentMember): string | null {
  if (member.kind === "remote") {
    return typeof member.remote.url === "string" ? member.remote.url : member.remote.description;
  }
  return modelIdentifier(member.model);
}

async function runSwarm<T>(
  schema: z.ZodType<T>,
  agents: SwarmAgentInput | readonly SwarmAgentInput[],
  inputFile: ExtractionInputLike,
  options: ExtractSwarmOptions,
): Promise<SwarmResult<T>> {
  const members = resolveSwarmMembers(agents, options.size);
  const reduce = normalizeReduce(options.reduce);
  const maxConcurrency = options.maxConcurrency ?? Math.min(5, members.length);
  validateMaxConcurrency(maxConcurrency);
  const resolved = resolveExtractOptions(options);
  const { source, name } = resolveItem(inputFile, options.mediaType);
  const { data, mediaType } = await withExtractionErrors(() =>
    getMedia(inputFile, { mediaType: resolved.mediaType, maxInputBytes: resolved.limit }),
  );
  const sourceLabel = itemSourceLabel(source, name);
  const results: Array<ExtractionResult<T> | Error> = new Array(members.length);
  let next = 0;
  const worker = async () => {
    for (;;) {
      const index = next++;
      if (index >= members.length) return;
      const member = members[index]!;
      const started = performance.now();
      try {
        const opts = memberOptions(options, member, index, members.length);
        const result =
          member.kind === "remote"
            ? await runRemoteExtraction(schema, member.remote, data, mediaType, opts)
            : await runLoadedExtraction(schema, member.model, data, mediaType, opts);
        results[index] = {
          output: result.output,
          usage: result.usage,
          attempts: result.attempts,
          duration: (performance.now() - started) / 1000,
          model: memberLabel(member),
          mediaType,
          source: sourceLabel,
          warnings: [],
        };
      } catch (error) {
        results[index] = toError(error);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(maxConcurrency, members.length) }, () => worker()));
  const successes = results.filter((item): item is ExtractionResult<T> => !(item instanceof Error));
  if (successes.length === 0) {
    throw results[0] instanceof Error ? results[0] : /* v8 ignore next */ new Error("Swarm produced no results.");
  }
  return {
    output: reduceOutputs(
      successes.map((item) => item.output),
      reduce,
    ),
    agents: results,
    usage: totalUsage(successes),
    reduce,
  };
}

export async function extractSwarm<T>(
  schema: z.ZodType<T>,
  agents: SwarmAgentInput | readonly SwarmAgentInput[],
  inputFile: ExtractionInputLike,
  options: ExtractSwarmOptions = {},
): Promise<T> {
  return (await runSwarm(schema, agents, inputFile, options)).output;
}

export async function extractSwarmWithResults<T>(
  schema: z.ZodType<T>,
  agents: SwarmAgentInput | readonly SwarmAgentInput[],
  inputFile: ExtractionInputLike,
  options: ExtractSwarmOptions = {},
): Promise<SwarmResult<T>> {
  return runSwarm(schema, agents, inputFile, options);
}

export const extractSwarmAsync = extractSwarm;
export const extractSwarmWithResultsAsync = extractSwarmWithResults;
