import { pathToFileURL } from "node:url";
import { toError } from "../errors.js";

/** True when this module is the process entry point. */
export function isMainModule(url: string, argv1?: string): boolean {
  return url === pathToFileURL(argv1 ?? "").href;
}

/** Prints help on stdout for `--help`, on stderr for a usage error, then exits. */
export function printUsage(text: string, code: number): never {
  (code === 0 ? console.log : console.error)(text);
  process.exit(code);
}

export function fail(message: string): never {
  console.error(`error: ${message}`);
  process.exit(1);
}

/** Reports a rejected flag combination and yields the exit code to return. */
export function invalid(message: string): number {
  console.error(`error: ${message}`);
  return 1;
}

export function printError(error: unknown): void {
  console.error(`error: ${toError(error).message}`);
}
