import { afterEach, describe, expect, it, vi } from "vitest";

const spawnSync = vi.fn((cmd: string) => {
  if (cmd === "bun") return { status: 0 };
  return { status: 0 };
});

vi.mock("node:child_process", () => ({
  spawnSync: (cmd: string, args?: string[], options?: unknown) => spawnSync(cmd, args as string[], options),
}));

vi.mock("../src/tui/app.js", () => ({
  runApp: async () => {
    throw new Error("no renderer");
  },
}));

const { launchTui } = await import("../src/tui.js");

afterEach(() => {
  spawnSync.mockClear();
});

describe("launchTui reexec", () => {
  it("re-execs with bun when the renderer fails on a TTY", async () => {
    const tty = Object.getOwnPropertyDescriptor(process.stdout, "isTTY");
    Object.defineProperty(process.stdout, "isTTY", { value: true, configurable: true });
    const prevArgv = process.argv[1];
    process.argv[1] = "/tmp/openextract-cli.js";
    try {
      await expect(launchTui()).resolves.toBe(0);
      spawnSync.mockImplementation((cmd: string, args?: string[]) =>
        args?.[0] === "--version" ? { status: 0 } : { status: null },
      );
      await expect(launchTui()).resolves.toBe(1);
      spawnSync.mockImplementation(() => ({ status: 1 }));
      const errors: string[] = [];
      const original = console.error;
      console.error = (message?: unknown) => {
        errors.push(String(message ?? ""));
      };
      try {
        await expect(launchTui()).resolves.toBe(1);
      } finally {
        console.error = original;
      }
      expect(errors.join("\n")).toContain("failed to start");
    } finally {
      process.argv[1] = prevArgv;
      if (tty) Object.defineProperty(process.stdout, "isTTY", tty);
    }
  });

  it("skips reexec without a script path", async () => {
    const tty = Object.getOwnPropertyDescriptor(process.stdout, "isTTY");
    Object.defineProperty(process.stdout, "isTTY", { value: true, configurable: true });
    const prev = process.argv[1];
    process.argv[1] = undefined as unknown as string;
    const original = console.error;
    console.error = () => {};
    try {
      await expect(launchTui()).resolves.toBe(1);
    } finally {
      process.argv[1] = prev;
      console.error = original;
      if (tty) Object.defineProperty(process.stdout, "isTTY", tty);
    }
  });
});
