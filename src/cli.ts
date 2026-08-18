#!/usr/bin/env node
import { parseArgs } from "./cli/args.js";
import { main } from "./cli/run.js";
import { isMainModule } from "./cli/runtime.js";

export { parseArgs, main, isMainModule };
export type { CliArgs } from "./cli/args.js";

/* v8 ignore next 3 -- process entry */
if (isMainModule(import.meta.url, process.argv[1])) {
  void main().then((code) => process.exit(code));
}
