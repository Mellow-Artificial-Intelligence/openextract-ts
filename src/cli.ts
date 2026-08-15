#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import { extract, extractWithUsage } from "./extract.js";
import { extractMany } from "./batch.js";
import { extractSwarm, extractSwarmWithResults } from "./swarm.js";
import { SWARM_REDUCES, type SwarmReduce } from "./reduce.js";
import { toError } from "./errors.js";
import {
  ExtractionError,
  ModelError,
  ProviderNotInstalledError,
  SchemaValidationError,
  UrlFetchError,
} from "./exceptions.js";
import { loadSchema } from "./schema.js";
import { launchTui, tuiArgv, wantsTui } from "./tui.js";
import type { ExtractionInputLike } from "./types.js";
import type { z } from "zod";

interface CliArgs {
  inputFiles: string[];
  schema?: string;
  model?: string;
  instructions?: string;
  style: string;
  mediaType?: string;
  usage: boolean;
  continueOnError: boolean;
  output: "json" | "repr";
  maxRetries: number;
  maxInputBytes?: number;
  retryBackoff: number;
  retryMaxBackoff: number;
  swarm: number;
  reduce: SwarmReduce;
}

function usage(code = 1): never {
  const stream = code === 0 ? console.log : console.error;
  stream(`Usage: openextract [<input...>] [--schema <module:export> --model <provider/model>]

  openextract                 Launch the OpenTUI app
  openextract --tui [input]   Launch the TUI, optionally with a path or URL

Options:
  --tui                 Open the interactive TUI
  --schema              Zod schema export path (module:exportName)
  --model               AI Gateway model id (e.g. openai/gpt-5.5)
  --instructions        Optional natural-language guidance
  --style               direct | search | code (default: direct)
  --media-type          MIME type (required for stdin)
  --usage               Print token usage (single input only)
  --continue-on-error   Batch: keep going and exit 7 on partial failure
  --output              json | repr (default: json)
  --max-retries         Retry transient model errors (default: 0)
  --max-input-bytes     Per-input byte cap
  --retry-backoff       Base backoff seconds (default: 1)
  --retry-max-backoff   Max backoff seconds (default: 60)
  --swarm               Parallel agents on one input (default: 1)
  --reduce              merge | vote | first (swarm only, default: merge)`);
  process.exit(code);
}

function takeValue(argv: string[], i: number, flag: string): [string, number] {
  const value = argv[i + 1];
  if (!value) {
    console.error(`error: ${flag} requires a value`);
    process.exit(1);
  }
  return [value, i + 1];
}

function parseArgs(argv: string[]): CliArgs {
  const inputFiles: string[] = [];
  const args: Partial<CliArgs> = {
    style: "direct",
    usage: false,
    continueOnError: false,
    output: "json",
    maxRetries: 0,
    retryBackoff: 1,
    retryMaxBackoff: 60,
    swarm: 1,
    reduce: "merge",
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    switch (arg) {
      case "--schema":
        [args.schema, i] = takeValue(argv, i, arg);
        break;
      case "--model":
        [args.model, i] = takeValue(argv, i, arg);
        break;
      case "--instructions":
        [args.instructions, i] = takeValue(argv, i, arg);
        break;
      case "--style":
        [args.style, i] = takeValue(argv, i, arg);
        break;
      case "--media-type":
        [args.mediaType, i] = takeValue(argv, i, arg);
        break;
      case "--usage":
        args.usage = true;
        break;
      case "--continue-on-error":
        args.continueOnError = true;
        break;
      case "--output":
        [args.output, i] = takeValue(argv, i, arg) as ["json" | "repr", number];
        break;
      case "--max-retries":
        [args.maxRetries, i] = [Number(takeValue(argv, i, arg)[0]), i + 1];
        break;
      case "--max-input-bytes":
        [args.maxInputBytes, i] = [Number(takeValue(argv, i, arg)[0]), i + 1];
        break;
      case "--retry-backoff":
        [args.retryBackoff, i] = [Number(takeValue(argv, i, arg)[0]), i + 1];
        break;
      case "--retry-max-backoff":
        [args.retryMaxBackoff, i] = [Number(takeValue(argv, i, arg)[0]), i + 1];
        break;
      case "--swarm":
        [args.swarm, i] = [Number(takeValue(argv, i, arg)[0]), i + 1];
        break;
      case "--reduce": {
        const [value, next] = takeValue(argv, i, arg);
        if (!(SWARM_REDUCES as readonly string[]).includes(value)) {
          console.error(`error: --reduce must be ${SWARM_REDUCES.join(" | ")}`);
          process.exit(1);
        }
        args.reduce = value as SwarmReduce;
        i = next;
        break;
      }
      case "--tui":
        break;
      case "--help":
      case "-h":
        usage(0);
      default:
        if (arg.startsWith("-") && arg !== "-") {
          console.error(`error: unknown option ${arg}`);
          process.exit(1);
        }
        inputFiles.push(arg);
    }
  }
  return { ...args, inputFiles } as CliArgs;
}

async function resolveInputs(
  raw: string[],
  mediaType?: string,
): Promise<ExtractionInputLike[]> {
  if (raw.includes("-")) {
    if (raw.length > 1) throw new Error("stdin (-) cannot be combined with other input files");
    if (!mediaType) throw new Error("--media-type is required when reading from stdin (-)");
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
    return [Buffer.concat(chunks)];
  }
  return raw;
}

function printJson(payload: unknown, asRepr: boolean): void {
  console.log(asRepr ? String(payload) : JSON.stringify(payload, null, 2));
}

function printError(error: unknown): void {
  console.error(`error: ${toError(error).message}`);
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
  if (!args.schema || !args.model || args.inputFiles.length === 0) usage();
  let schema: z.ZodType<unknown>;
  try {
    schema = await loadSchema(args.schema);
  } catch (error) {
    printError(error);
    return 1;
  }
  let inputs: ExtractionInputLike[];
  try {
    inputs = await resolveInputs(args.inputFiles, args.mediaType);
  } catch (error) {
    printError(error);
    return 1;
  }
  if (args.usage && inputs.length !== 1) {
    console.error("error: --usage requires exactly one input file");
    return 1;
  }
  if (!Number.isInteger(args.swarm) || args.swarm < 1) {
    console.error("error: --swarm must be a positive integer");
    return 1;
  }
  if (args.swarm > 1 && inputs.length !== 1) {
    console.error("error: --swarm applies to a single input; omit it for batch files");
    return 1;
  }
  const shared = {
    instructions: args.instructions,
    style: args.style,
    mediaType: args.mediaType,
    maxInputBytes: args.maxInputBytes,
    maxRetries: args.maxRetries,
    retryBackoff: args.retryBackoff,
    retryMaxBackoff: args.retryMaxBackoff,
  };
  let payload: unknown;
  let batchFailures = 0;
  try {
    if (inputs.length === 1) {
      const inputFile = inputs[0]!;
      if (args.swarm > 1) {
        if (args.usage) {
          const swarm = await extractSwarmWithResults(schema, args.model, inputFile, {
            ...shared,
            size: args.swarm,
            reduce: args.reduce,
          });
          payload = { result: swarm.output, usage: swarm.usage, agents: swarm.agents.length, reduce: swarm.reduce };
        } else {
          payload = await extractSwarm(schema, args.model, inputFile, {
            ...shared,
            size: args.swarm,
            reduce: args.reduce,
          });
        }
      } else if (args.usage) {
        const { output, usage } = await extractWithUsage(schema, args.model, inputFile, shared);
        payload = { result: output, usage };
      } else {
        payload = await extract(schema, args.model, inputFile, shared);
      }
    } else {
      const results = await extractMany(schema, args.model, inputs, {
        ...shared,
        returnExceptions: args.continueOnError,
      });
      payload = results.map((result, i) => {
        if (result instanceof Error) {
          batchFailures += 1;
          const input = inputs[i];
          return {
            input: typeof input === "string" ? input : "<bytes>",
            error: result.message,
            errorType: result.name,
          };
        }
        return result;
      });
    }
  } catch (error) {
    printError(error);
    if (error instanceof UrlFetchError) return 2;
    if (error instanceof SchemaValidationError) return 3;
    if (error instanceof ModelError) return 4;
    if (error instanceof ProviderNotInstalledError) return 6;
    if (error instanceof ExtractionError) return 5;
    if (error instanceof Error) return 1;
    return 1;
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

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().then((code) => process.exit(code));
}
