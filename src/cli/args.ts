import { SWARM_REDUCES, type SwarmReduce } from "../reduce.js";
import { splitList } from "../serialized.js";
import { fail, printUsage } from "./runtime.js";

export interface CliArgs {
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
  models: string[];
  agent?: string;
  agents: string[];
}

const USAGE = `Usage: openextract [<input...>] [--schema <module:export> --model <provider/model>]

  openextract                 Launch the OpenTUI app
  openextract --tui [input]   Launch the TUI, optionally with a path or URL

Options:
  --tui                 Open the interactive TUI
  --schema              Zod schema export path (module:exportName); optional when --agent has outputSchema
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
  --models              Comma-separated model ids, one per swarm agent
  --agent               Agent path (directory, file, or module:exportName)
  --agents              Comma-separated agent paths
  --reduce              merge | vote | first (swarm only, default: merge)`;

export function usage(code = 1): never {
  return printUsage(USAGE, code);
}

const DEFAULTS = {
  style: "direct",
  usage: false,
  continueOnError: false,
  output: "json",
  maxRetries: 0,
  retryBackoff: 1,
  retryMaxBackoff: 60,
  swarm: 1,
  reduce: "merge",
  models: [],
  agents: [],
} satisfies Partial<CliArgs>;

export function parseArgs(argv: string[]): CliArgs {
  const inputFiles: string[] = [];
  const args: Partial<CliArgs> = { ...DEFAULTS };
  let index = 0;
  /** Reads the value that follows the current flag. */
  const value = (flag: string): string => {
    const next = argv[index + 1];
    if (!next) fail(`${flag} requires a value`);
    index += 1;
    return next;
  };
  for (; index < argv.length; index++) {
    const arg = argv[index]!;
    switch (arg) {
      case "--schema":
        args.schema = value(arg);
        break;
      case "--model":
        args.model = value(arg);
        break;
      case "--instructions":
        args.instructions = value(arg);
        break;
      case "--style":
        args.style = value(arg);
        break;
      case "--media-type":
        args.mediaType = value(arg);
        break;
      case "--usage":
        args.usage = true;
        break;
      case "--continue-on-error":
        args.continueOnError = true;
        break;
      case "--output":
        args.output = value(arg) as "json" | "repr";
        break;
      case "--max-retries":
        args.maxRetries = Number(value(arg));
        break;
      case "--max-input-bytes":
        args.maxInputBytes = Number(value(arg));
        break;
      case "--retry-backoff":
        args.retryBackoff = Number(value(arg));
        break;
      case "--retry-max-backoff":
        args.retryMaxBackoff = Number(value(arg));
        break;
      case "--swarm":
        args.swarm = Number(value(arg));
        break;
      case "--models":
        args.models = splitList(value(arg));
        break;
      case "--agent":
        args.agent = value(arg);
        break;
      case "--agents":
        args.agents = splitList(value(arg));
        break;
      case "--reduce": {
        const reduce = value(arg);
        if (!(SWARM_REDUCES as readonly string[]).includes(reduce)) {
          fail(`--reduce must be ${SWARM_REDUCES.join(" | ")}`);
        }
        args.reduce = reduce as SwarmReduce;
        break;
      }
      case "--tui":
        break;
      case "--help":
      case "-h":
        usage(0);
      default:
        if (arg.startsWith("-") && arg !== "-") fail(`unknown option ${arg}`);
        inputFiles.push(arg);
    }
  }
  return { ...args, inputFiles } as CliArgs;
}
