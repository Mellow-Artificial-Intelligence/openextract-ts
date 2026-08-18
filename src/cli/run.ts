import { loadAgent, loadAgents, resolveOutputSchema, type DefinedAgent } from "../agent.js";
import { extractMany } from "../batch.js";
import {
  ExtractionError,
  ModelError,
  ProviderNotInstalledError,
  SchemaValidationError,
  UrlFetchError,
} from "../exceptions.js";
import { extract, extractWithUsage } from "../extract.js";
import { loadSchema } from "../schema.js";
import { extractSwarm, extractSwarmWithResults } from "../swarm.js";
import { launchTui, tuiArgv, wantsTui } from "../tui.js";
import type { ExtractOptions, ExtractionInputLike } from "../types.js";
import { parseArgs, usage, type CliArgs } from "./args.js";
import { invalid, printError } from "./runtime.js";
import type { z } from "zod";

/** Typed errors map to stable exit codes; the first match wins. */
const EXIT_CODES: Array<[abstract new (...args: never[]) => Error, number]> = [
  [UrlFetchError, 2],
  [SchemaValidationError, 3],
  [ModelError, 4],
  [ProviderNotInstalledError, 6],
  [ExtractionError, 5],
];

function exitCodeFor(error: unknown): number {
  for (const [type, code] of EXIT_CODES) {
    if (error instanceof type) return code;
  }
  return 1;
}

async function resolveInputs(raw: string[], mediaType?: string): Promise<ExtractionInputLike[]> {
  if (raw.includes("-")) {
    if (raw.length > 1) throw new Error("stdin (-) cannot be combined with other input files");
    if (!mediaType) throw new Error("--media-type is required when reading from stdin (-)");
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
    return [Buffer.concat(chunks)];
  }
  return raw;
}

async function loadCliAgents(args: CliArgs): Promise<DefinedAgent[]> {
  if (args.agent) return [await loadAgent(args.agent)];
  if (args.agents.length > 0) return loadAgents(args.agents);
  return [];
}

/** Rejects flag combinations the extraction paths cannot honor. Returns an exit code, or null when valid. */
function checkFlags(args: CliArgs, agents: DefinedAgent[], inputCount: number): number | null {
  if (args.usage && inputCount !== 1) return invalid("--usage requires exactly one input file");
  if (!Number.isInteger(args.swarm) || args.swarm < 1) return invalid("--swarm must be a positive integer");
  if ((args.swarm > 1 || args.models.length > 1 || agents.length > 1) && inputCount !== 1) {
    return invalid("--swarm, --models, and --agents apply to a single input; omit them for batch files");
  }
  if (args.models.length > 1 && args.swarm > 1 && args.swarm !== args.models.length) {
    return invalid("--swarm does not match the number of --models");
  }
  return null;
}

function printJson(payload: unknown, asRepr: boolean): void {
  console.log(asRepr ? String(payload) : JSON.stringify(payload, null, 2));
}

export async function main(argv = process.argv.slice(2)): Promise<number> {
  if (argv.includes("--help") || argv.includes("-h")) usage(0);
  if (wantsTui(argv)) {
    const args = parseArgs(tuiArgv(argv));
    return launchTui({
      source: args.inputFiles[0],
      mediaType: args.mediaType,
      schema: args.schema,
      model: args.model,
      instructions: args.instructions,
      style: args.style,
    });
  }
  const args = parseArgs(argv);
  if (args.inputFiles.length === 0) usage();
  if (!args.schema && !args.agent && args.agents.length === 0) usage();
  if (args.agent && args.agents.length > 0) return invalid("use --agent or --agents, not both");

  let agents: DefinedAgent[];
  try {
    agents = await loadCliAgents(args);
  } catch (error) {
    printError(error);
    return 1;
  }
  if (!args.model && args.models.length === 0 && agents.length === 0) usage();

  let schema: z.ZodType<unknown>;
  let inputs: ExtractionInputLike[];
  try {
    schema = args.schema ? await loadSchema(args.schema) : resolveOutputSchema(agents[0]!);
    inputs = await resolveInputs(args.inputFiles, args.mediaType);
  } catch (error) {
    printError(error);
    return 1;
  }

  const rejected = checkFlags(args, agents, inputs.length);
  if (rejected !== null) return rejected;

  const options: ExtractOptions = {
    instructions: args.instructions,
    style: args.style,
    mediaType: args.mediaType,
    maxInputBytes: args.maxInputBytes,
    maxRetries: args.maxRetries,
    retryBackoff: args.retryBackoff,
    retryMaxBackoff: args.retryMaxBackoff,
  };
  const model = agents[0] ?? args.model ?? args.models[0]!;
  let payload: unknown;
  let batchFailures = 0;
  try {
    if (inputs.length !== 1) {
      const results = await extractMany(schema, model, inputs, {
        ...options,
        returnExceptions: args.continueOnError,
      });
      payload = results.map((result, index) => {
        if (!(result instanceof Error)) return result;
        batchFailures += 1;
        const input = inputs[index];
        return {
          input: typeof input === "string" ? input : /* v8 ignore next */ "<bytes>",
          error: result.message,
          errorType: result.name,
        };
      });
    } else if (args.swarm > 1 || args.models.length > 1 || agents.length > 1) {
      const members = agents.length > 0 ? agents : args.models.length > 0 ? args.models : args.model!;
      const swarmOptions = {
        ...options,
        size: args.models.length > 1 ? undefined : args.swarm,
        reduce: args.reduce,
      };
      if (args.usage) {
        const swarm = await extractSwarmWithResults(schema, members, inputs[0]!, swarmOptions);
        payload = {
          result: swarm.output,
          usage: swarm.usage,
          agents: swarm.agents.length,
          reduce: swarm.reduce,
        };
      } else {
        payload = await extractSwarm(schema, members, inputs[0]!, swarmOptions);
      }
    } else if (args.usage) {
      const { output, usage: tokens } = await extractWithUsage(schema, model, inputs[0]!, options);
      payload = { result: output, usage: tokens };
    } else {
      payload = await extract(schema, model, inputs[0]!, options);
    }
  } catch (error) {
    printError(error);
    return exitCodeFor(error);
  }
  printJson(payload, args.output === "repr");
  if (batchFailures) {
    console.error(
      `warning: ${batchFailures} of ${inputs.length} input(s) failed; see output for details`,
    );
    return 7;
  }
  return 0;
}
