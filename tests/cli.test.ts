import { Readable } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import { isMainModule, main, parseArgs } from "../src/cli.js";
import * as extractMod from "../src/extract.js";
import * as batchMod from "../src/batch.js";
import * as swarmMod from "../src/swarm.js";
import * as agentMod from "../src/agent.js";
import * as schemaMod from "../src/schema.js";
import * as tuiMod from "../src/tui.js";
import {
  ExtractionError,
  ModelError,
  ProviderNotInstalledError,
  SchemaValidationError,
  UrlFetchError,
} from "../src/exceptions.js";
import { Person } from "./helpers.js";

function mockExit() {
  return vi.spyOn(process, "exit").mockImplementation((code) => {
    throw new Error(`EXIT:${code ?? 0}`);
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("parseArgs", () => {
  it("keeps --tui as a no-op flag", () => {
    expect(parseArgs(["--tui", "./doc.pdf"]).inputFiles).toEqual(["./doc.pdf"]);
    expect(parseArgs(["-"]).inputFiles).toEqual(["-"]);
  });

  it("prints help and rejects unknown flags", () => {
    const exit = mockExit();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
    expect(() => parseArgs(["-h"])).toThrow("EXIT:0");
    expect(() => parseArgs(["--help"])).toThrow("EXIT:0");
    expect(() => parseArgs(["--unknown"])).toThrow("EXIT:1");
    exit.mockRestore();
  });
});

describe("isMainModule", () => {
  it("compares the executing file URL", () => {
    expect(isMainModule("file:///tmp/cli.js", "/tmp/cli.js")).toBe(true);
    expect(isMainModule("file:///tmp/cli.js", "/tmp/other.js")).toBe(false);
    expect(isMainModule("file:///tmp/cli.js")).toBe(false);
  });
});

describe("main", () => {
  it("prints help and launches the TUI", async () => {
    const exit = mockExit();
    await expect(main(["--help"])).rejects.toThrow("EXIT:0");
    await expect(main(["-h"])).rejects.toThrow("EXIT:0");
    exit.mockRestore();
    const launch = vi.spyOn(tuiMod, "launchTui").mockResolvedValue(0);
    await expect(main(["--tui", "./doc.pdf"])).resolves.toBe(0);
    expect(launch).toHaveBeenCalled();
  });

  it("extracts one file and prints JSON", async () => {
    vi.spyOn(schemaMod, "loadSchema").mockResolvedValue(Person);
    vi.spyOn(extractMod, "extract").mockResolvedValue({ name: "Ada", age: 36 });
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await expect(
      main(["./doc.txt", "--schema", "./s.ts:S", "--models", "openai/gpt-5.5"]),
    ).resolves.toBe(0);
    expect(log.mock.calls.at(-1)?.[0]).toContain("Ada");
  });

  it("prints usage and repr output", async () => {
    vi.spyOn(schemaMod, "loadSchema").mockResolvedValue(Person);
    vi.spyOn(extractMod, "extractWithUsage").mockResolvedValue({
      output: { name: "Ada", age: 36 },
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
    });
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await expect(
      main(["./doc.txt", "--schema", "./s.ts:S", "--models", "openai/gpt-5.5", "--usage", "--output", "repr"]),
    ).resolves.toBe(0);
    expect(String(log.mock.calls.at(-1)?.[0])).toContain("object");
  });

  it("runs a swarm and a batch", async () => {
    vi.spyOn(schemaMod, "loadSchema").mockResolvedValue(Person);
    vi.spyOn(swarmMod, "extractSwarm").mockResolvedValue({ name: "Ada", age: 36 });
    vi.spyOn(swarmMod, "extractSwarmWithResults").mockResolvedValue({
      output: { name: "Ada", age: 36 },
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      reduce: "merge",
      agents: [],
    });
    vi.spyOn(console, "log").mockImplementation(() => {});
    await expect(
      main(["./doc.txt", "--schema", "./s.ts:S", "--models", "openai/gpt-5.5,xai/grok-4.6"]),
    ).resolves.toBe(0);
    await expect(
      main(["./doc.txt", "--schema", "./s.ts:S", "--model", "openai/gpt-5.5", "--swarm", "2", "--usage"]),
    ).resolves.toBe(0);
    vi.spyOn(batchMod, "extractMany").mockResolvedValue([
      { name: "Ada", age: 36 },
      new Error("nope"),
    ]);
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      main([
        "./a.txt",
        "./b.txt",
        "--schema",
        "./s.ts:S",
        "--models",
        "openai/gpt-5.5",
        "--continue-on-error",
      ]),
    ).resolves.toBe(7);
    expect(err).toHaveBeenCalled();
  });

  it("loads agents and maps typed errors", async () => {
    const { defineAgent } = await import("../src/agent.js");
    const agent = defineAgent({ description: "A", model: "openai/gpt-5.5", outputSchema: Person });
    vi.spyOn(agentMod, "loadAgent").mockResolvedValue(agent);
    vi.spyOn(agentMod, "loadAgents").mockResolvedValue([agent, agent]);
    vi.spyOn(agentMod, "resolveOutputSchema").mockReturnValue(Person);
    vi.spyOn(schemaMod, "loadSchema").mockResolvedValue(Person);
    vi.spyOn(extractMod, "extract").mockResolvedValue({ name: "Ada", age: 36 });
    vi.spyOn(swarmMod, "extractSwarm").mockResolvedValue({ name: "Ada", age: 36 });
    vi.spyOn(console, "log").mockImplementation(() => {});
    await expect(main(["./doc.txt", "--agent", "./agent.ts"])).resolves.toBe(0);
    await expect(main(["./doc.txt", "--agents", "./a.ts,./b.ts"])).resolves.toBe(0);
    vi.spyOn(extractMod, "extract").mockReset();
    vi.spyOn(extractMod, "extract").mockRejectedValueOnce(new UrlFetchError("u"));
    await expect(main(["./doc.txt", "--schema", "./s.ts:S", "--model", "openai/gpt-5.5"])).resolves.toBe(2);
    vi.spyOn(extractMod, "extract").mockRejectedValueOnce(new SchemaValidationError("s"));
    await expect(main(["./doc.txt", "--schema", "./s.ts:S", "--model", "openai/gpt-5.5"])).resolves.toBe(3);
    vi.spyOn(extractMod, "extract").mockRejectedValueOnce(new ModelError("m"));
    await expect(main(["./doc.txt", "--schema", "./s.ts:S", "--model", "openai/gpt-5.5"])).resolves.toBe(4);
    vi.spyOn(extractMod, "extract").mockRejectedValueOnce(new ProviderNotInstalledError("p"));
    await expect(main(["./doc.txt", "--schema", "./s.ts:S", "--model", "openai/gpt-5.5"])).resolves.toBe(6);
    vi.spyOn(extractMod, "extract").mockRejectedValueOnce(new ExtractionError("e"));
    await expect(main(["./doc.txt", "--schema", "./s.ts:S", "--model", "openai/gpt-5.5"])).resolves.toBe(5);
    vi.spyOn(extractMod, "extract").mockRejectedValueOnce(new Error("x"));
    await expect(main(["./doc.txt", "--schema", "./s.ts:S", "--model", "openai/gpt-5.5"])).resolves.toBe(1);
    vi.spyOn(extractMod, "extract").mockRejectedValueOnce("boom");
    await expect(main(["./doc.txt", "--schema", "./s.ts:S", "--model", "openai/gpt-5.5"])).resolves.toBe(1);
  });

  it("validates flags and stdin", async () => {
    const exit = mockExit();
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(main(["--schema", "./s.ts:S"])).rejects.toThrow("EXIT:1");
    await expect(main(["./doc.txt"])).rejects.toThrow("EXIT:1");
    await expect(main(["./doc.txt", "--schema", "./s.ts:S"])).rejects.toThrow("EXIT:1");
    await expect(main(["./doc.txt", "--unknown"])).rejects.toThrow("EXIT:1");
    await expect(main(["./doc.txt", "--schema"])).rejects.toThrow("EXIT:1");
    await expect(main(["./doc.txt", "--reduce", "avg", "--schema", "./s.ts:S", "--model", "x"])).rejects.toThrow(
      "EXIT:1",
    );
    exit.mockRestore();
    vi.spyOn(schemaMod, "loadSchema").mockResolvedValue(Person);
    expect(await main(["./a.txt", "./b.txt", "--schema", "./s.ts:S", "--model", "x", "--usage"])).toBe(1);
    expect(await main(["./doc.txt", "--schema", "./s.ts:S", "--model", "x", "--swarm", "0"])).toBe(1);
    expect(await main(["./a.txt", "./b.txt", "--schema", "./s.ts:S", "--model", "x", "--swarm", "2"])).toBe(1);
    expect(
      await main(["./doc.txt", "--schema", "./s.ts:S", "--models", "a,b", "--swarm", "3"]),
    ).toBe(1);
    expect(await main(["./doc.txt", "--agent", "./a.ts", "--agents", "./b.ts"])).toBe(1);
    vi.spyOn(agentMod, "loadAgent").mockRejectedValue(new Error("bad agent"));
    expect(await main(["./doc.txt", "--agent", "./a.ts"])).toBe(1);
    vi.spyOn(schemaMod, "loadSchema").mockRejectedValueOnce(new Error("bad schema"));
    expect(await main(["./doc.txt", "--schema", "./s.ts:S", "--model", "x"])).toBe(1);
    const stdin = Readable.from(["hello"]);
    const original = process.stdin;
    Object.defineProperty(process, "stdin", { value: stdin, configurable: true });
    try {
      expect(await main(["-", "--schema", "./s.ts:S", "--model", "x"])).toBe(1);
      expect(await main(["-", "./a.txt", "--schema", "./s.ts:S", "--model", "x", "--media-type", "text/plain"])).toBe(
        1,
      );
      vi.spyOn(extractMod, "extract").mockResolvedValue({ name: "Ada", age: 36 });
      vi.spyOn(console, "log").mockImplementation(() => {});
      await expect(
        main(["-", "--schema", "./s.ts:S", "--model", "x", "--media-type", "text/plain"]),
      ).resolves.toBe(0);
    } finally {
      Object.defineProperty(process, "stdin", { value: original, configurable: true });
    }
  });

  it("parses numeric flags", async () => {
    vi.spyOn(schemaMod, "loadSchema").mockResolvedValue(Person);
    const extract = vi.spyOn(extractMod, "extract").mockResolvedValue({ name: "Ada", age: 36 });
    vi.spyOn(console, "log").mockImplementation(() => {});
    await expect(
      main([
        "./doc.txt",
        "--schema",
        "./s.ts:S",
        "--model",
        "openai/gpt-5.5",
        "--instructions",
        "Be brief",
        "--style",
        "search",
        "--media-type",
        "text/plain",
        "--max-retries",
        "2",
        "--max-input-bytes",
        "1000",
        "--retry-backoff",
        "0.1",
        "--retry-max-backoff",
        "2",
        "--reduce",
        "vote",
      ]),
    ).resolves.toBe(0);
    expect(extract).toHaveBeenCalled();
  });
});
