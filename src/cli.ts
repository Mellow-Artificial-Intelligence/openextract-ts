#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { extract, extractWithUsage } from "./extract.js";
import { extractMany } from "./batch.js";
import {
  ExtractionError,
  ModelError,
  ProviderNotInstalledError,
  SchemaValidationError,
  UrlFetchError,
} from "./exceptions.js";
import type { ExtractionInputLike } from "./types.js";
import type { z } from "zod";

interface CliArgs {
  inputFiles: string[];
  schema: string;
  model: string;
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
}

function usage(code = 1): never {
  const stream = code === 0 ? console.log : console.error;
  stream(`Usage: openextract <input...> --schema <module:export> --model <provider/model>

Options:
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
  --retry-max-backoff   Max backoff seconds (default: 60)`);
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
  if (!args.schema || !args.model || inputFiles.length === 0) usage();
  return { ...args, inputFiles } as CliArgs;
}

async function resolveSchema(schemaPath: string): Promise<z.ZodType<unknown>> {
  const sep = schemaPath.lastIndexOf(":");
  if (sep <= 0 || sep === schemaPath.length - 1) {
    throw new Error(`Invalid schema path '${schemaPath}'. Expected format 'module:exportName'.`);
  }
  const modulePath = schemaPath.slice(0, sep);
  const exportName = schemaPath.slice(sep + 1);
  const href = pathToFileURL(resolve(modulePath)).href;
  const mod = (await import(href)) as Record<string, unknown>;
  const schema = mod[exportName];
  if (schema == null) {
    throw new Error(`Export '${exportName}' not found in module '${modulePath}'.`);
  }
  return schema as z.ZodType<unknown>;
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

export async function main(argv = process.argv.slice(2)): Promise<number> {
  const args = parseArgs(argv);
  let schema: z.ZodType<unknown>;
  try {
    schema = await resolveSchema(args.schema);
  } catch (error) {
    console.error(`error: ${error instanceof Error ? error.message : error}`);
    return 1;
  }
  let inputs: ExtractionInputLike[];
  try {
    inputs = await resolveInputs(args.inputFiles, args.mediaType);
  } catch (error) {
    console.error(`error: ${error instanceof Error ? error.message : error}`);
    return 1;
  }
  if (args.usage && inputs.length !== 1) {
    console.error("error: --usage requires exactly one input file");
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
      if (args.usage) {
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
    console.error(`error: ${error instanceof Error ? error.message : error}`);
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
