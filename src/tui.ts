import { spawnSync } from "node:child_process";
import { toError } from "./errors.js";
import type { TuiLaunchOptions } from "./tui/form.js";

export const TUI_RUNTIME_HELP = `The OpenTUI renderer needs Bun, or Node.js 26.4+ with --experimental-ffi.
Install Bun (https://bun.sh) and run: bunx openextract
Or extract from the CLI: openextract <input> --schema <module:export> --model <provider/model>`;

export function wantsTui(argv: string[]): boolean {
  return argv.length === 0 || argv[0] === "tui" || argv.includes("--tui");
}

export function tuiArgv(argv: string[]): string[] {
  if (argv[0] === "tui") return argv.slice(1).filter((arg) => arg !== "--tui");
  return argv.filter((arg) => arg !== "--tui");
}

function findBun(): string | null {
  const result = spawnSync("bun", ["--version"], { encoding: "utf8" });
  return result.status === 0 ? "bun" : null;
}

function reexecWithBun(): number | null {
  if (process.versions.bun || !process.stdout.isTTY) return null;
  const bun = findBun();
  const script = process.argv[1];
  if (!bun || !script) return null;
  const result = spawnSync(bun, [script, ...process.argv.slice(2)], { stdio: "inherit" });
  return result.status ?? 1;
}

export async function launchTui(options: TuiLaunchOptions = {}): Promise<number> {
  try {
    const { runApp } = await import("./tui/app.js");
    await runApp(options);
    return 0;
  } catch (error) {
    const redirected = reexecWithBun();
    if (redirected !== null) return redirected;
    const message = toError(error).message;
    console.error(`error: failed to start the OpenTUI app (${message})`);
    console.error(TUI_RUNTIME_HELP);
    return 1;
  }
}
