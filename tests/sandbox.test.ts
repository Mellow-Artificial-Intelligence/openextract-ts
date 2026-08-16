import { afterEach, describe, expect, it, vi } from "vitest";
import { extract } from "../src/extract.js";
import { ModelError, ProviderNotInstalledError, SchemaValidationError } from "../src/exceptions.js";
import {
  parseAgentStdout,
  parseCodingAgent,
  resolveSandboxStyle,
  runSandboxExtraction,
} from "../src/sandbox.js";
import { ExtractionStyle, workspaceFilename } from "../src/styles.js";
import type { SandboxClient } from "../src/types.js";
import { Person } from "./helpers.js";

const ENV = [
  "AI_GATEWAY_API_KEY",
  "VERCEL_OIDC_TOKEN",
  "OPENEXTRACT_SANDBOX_TIMEOUT",
  "OPENEXTRACT_SANDBOX_SNAPSHOT_ID",
  "VERCEL_TOKEN",
  "VERCEL_TEAM_ID",
  "VERCEL_PROJECT_ID",
];

afterEach(() => {
  for (const key of ENV) delete process.env[key];
  vi.restoreAllMocks();
});

function mockSandbox(options: {
  stdout?: string;
  resultJson?: string | null;
  exitCode?: number;
  stderr?: string;
}): SandboxClient & { writes: { path: string; content: string | Uint8Array }[]; commands: string[][] } {
  const writes: { path: string; content: string | Uint8Array }[] = [];
  const commands: string[][] = [];
  return {
    writes,
    commands,
    async writeFiles(files) {
      writes.push(...files);
    },
    async runCommand(command, args = []) {
      commands.push([command, ...args]);
      return {
        exitCode: options.exitCode ?? 0,
        stdout: async () => options.stdout ?? "",
        stderr: async () => options.stderr ?? "",
      };
    },
    async readFileToBuffer({ path }) {
      if (path !== "result.json") return null;
      if (options.resultJson == null) return null;
      return Buffer.from(options.resultJson);
    },
    async stop() {},
  };
}

describe("parseCodingAgent", () => {
  it("parses claude-code and codex ids", () => {
    expect(parseCodingAgent("claude-code")).toEqual({ agent: "claude-code" });
    expect(parseCodingAgent("codex/openai/gpt-5.6")).toEqual({
      agent: "codex",
      model: "openai/gpt-5.6",
    });
    expect(parseCodingAgent("claude-code:anthropic/claude-sonnet-4.6")).toEqual({
      agent: "claude-code",
      model: "anthropic/claude-sonnet-4.6",
    });
    expect(parseCodingAgent("openai/gpt-5.5")).toBeNull();
    expect(parseCodingAgent("claude-code/")).toEqual({ agent: "claude-code" });
    expect(parseCodingAgent({} as never)).toBeNull();
  });
});

describe("resolveSandboxStyle", () => {
  it("defaults coding agents to sandbox", () => {
    expect(resolveSandboxStyle(ExtractionStyle.DIRECT, "claude-code")).toBe(ExtractionStyle.SANDBOX);
    expect(resolveSandboxStyle(ExtractionStyle.SANDBOX, "codex")).toBe(ExtractionStyle.SANDBOX);
    expect(resolveSandboxStyle(ExtractionStyle.DIRECT, "openai/gpt-5.5")).toBe(ExtractionStyle.DIRECT);
  });

  it("rejects search/code with coding agents and sandbox with gateway models", () => {
    expect(() => resolveSandboxStyle(ExtractionStyle.SEARCH, "claude-code")).toThrow(/sandbox/);
    expect(() => resolveSandboxStyle(ExtractionStyle.SANDBOX, "openai/gpt-5.5")).toThrow(/claude-code/);
  });
});

describe("parseAgentStdout", () => {
  it("reads Claude Code result envelopes", () => {
    const parsed = parseAgentStdout(
      JSON.stringify({
        type: "result",
        subtype: "success",
        result: { name: "Ada", age: 36 },
        usage: { input_tokens: 4, output_tokens: 2 },
      }),
    );
    expect(parsed.output).toEqual({ name: "Ada", age: 36 });
    expect(parsed.usage).toEqual({ inputTokens: 4, outputTokens: 2, totalTokens: 6 });
    expect(
      parseAgentStdout(JSON.stringify({ type: "result", result: { name: "Ada" } })).output,
    ).toEqual({ name: "Ada" });
  });

  it("throws when the agent reports failure", () => {
    expect(() =>
      parseAgentStdout(JSON.stringify({ type: "result", subtype: "error", result: "boom" })),
    ).toThrow(/boom/);
    expect(() =>
      parseAgentStdout(JSON.stringify({ type: "result", subtype: "error", errors: "bad" })),
    ).toThrow(/bad/);
    expect(() => parseAgentStdout(JSON.stringify({ type: "result", subtype: "error" }))).toThrow(
      /Coding agent failed/,
    );
  });

  it("reads fenced JSON when stdout is not a result envelope", () => {
    expect(parseAgentStdout('note\n```json\n{"ok":true}\n```').output).toEqual({ ok: true });
  });
});

describe("workspaceFilename", () => {
  it("keeps binary extensions for sandbox workspaces", () => {
    expect(workspaceFilename("application/pdf")).toBe("document.pdf");
    expect(workspaceFilename("image/png")).toBe("document.png");
    expect(workspaceFilename("text/plain")).toBe("document.txt");
    expect(workspaceFilename("application/msword")).toBe("document.msword");
    expect(workspaceFilename("image/+++")).toBe("document.bin");
    expect(workspaceFilename("application/octet-stream")).toBe("document.txt");
  });
});

describe("runSandboxExtraction", () => {
  it("writes the document and validates result.json", async () => {
    process.env.AI_GATEWAY_API_KEY = "gw-key";
    const sandbox = mockSandbox({ resultJson: JSON.stringify({ name: "Ada", age: 36 }) });
    const output = await runSandboxExtraction({
      schema: Person,
      model: "claude-code",
      data: new Uint8Array(Buffer.from("Ada is 36")),
      mediaType: "text/plain",
      sandbox: { create: async () => sandbox },
    });
    expect(output.output).toEqual({ name: "Ada", age: 36 });
    expect(sandbox.writes.map((file) => file.path)).toEqual(["document.txt", "schema.json"]);
    expect(sandbox.commands[0]?.[0]).toBe("sh");
    expect(sandbox.commands[0]?.join(" ")).toContain("claude");
  });

  it("runs Codex with a config file", async () => {
    process.env.AI_GATEWAY_API_KEY = "gw-key";
    const sandbox = mockSandbox({
      stdout: JSON.stringify({ name: "Ada", age: 36 }),
    });
    await runSandboxExtraction({
      schema: Person,
      model: "codex",
      data: new Uint8Array(Buffer.from("%PDF")),
      mediaType: "application/pdf",
      sandbox: { create: async () => sandbox },
    });
    expect(sandbox.writes.map((file) => file.path)).toEqual([
      "document.pdf",
      "schema.json",
      "codex-config.toml",
    ]);
    expect(sandbox.commands.some((cmd) => cmd.join(" ").includes("codex-config.toml"))).toBe(true);
  });

  it("maps invalid JSON to SchemaValidationError", async () => {
    process.env.AI_GATEWAY_API_KEY = "gw-key";
    const sandbox = mockSandbox({ resultJson: JSON.stringify({ name: "Ada" }) });
    await expect(
      runSandboxExtraction({
        schema: Person,
        model: "claude-code",
        data: new Uint8Array(Buffer.from("doc")),
        mediaType: "text/plain",
        sandbox: { create: async () => sandbox },
      }),
    ).rejects.toBeInstanceOf(SchemaValidationError);
  });

  it("requires a gateway key", async () => {
    await expect(
      runSandboxExtraction({
        schema: Person,
        model: "claude-code",
        data: new Uint8Array(Buffer.from("doc")),
        mediaType: "text/plain",
        sandbox: { create: async () => mockSandbox({}) },
      }),
    ).rejects.toBeInstanceOf(ProviderNotInstalledError);
  });

  it("rejects a non-coding-agent model", async () => {
    process.env.AI_GATEWAY_API_KEY = "gw-key";
    await expect(
      runSandboxExtraction({
        schema: Person,
        model: "openai/gpt-5.5",
        data: new Uint8Array(Buffer.from("doc")),
        mediaType: "text/plain",
        sandbox: { create: async () => mockSandbox({}) },
      }),
    ).rejects.toThrow(/claude-code/);
  });

  it("maps a non-zero agent exit to ModelError", async () => {
    process.env.VERCEL_OIDC_TOKEN = "oidc";
    const sandbox = mockSandbox({ exitCode: 1, stderr: "", stdout: "nope", resultJson: null });
    await expect(
      runSandboxExtraction({
        schema: Person,
        model: "claude-code/anthropic/claude-sonnet-4.6",
        data: new Uint8Array(Buffer.from("doc")),
        mediaType: "text/plain",
        instructions: "Be brief.",
        timeoutMs: 5_000,
        sandbox: { create: async () => sandbox },
      }),
    ).rejects.toBeInstanceOf(ModelError);
  });

  it("runs Codex with a nested model", async () => {
    process.env.AI_GATEWAY_API_KEY = "gw-key";
    const sandbox = mockSandbox({ resultJson: JSON.stringify({ name: "Ada", age: 36 }) });
    await runSandboxExtraction({
      schema: Person,
      model: "codex/openai/gpt-5.6",
      data: new Uint8Array(Buffer.from("doc")),
      mediaType: "text/plain",
      sandbox: { timeout: 12, create: async () => sandbox },
    });
    expect(sandbox.commands.some((cmd) => cmd.join(" ").includes("model="))).toBe(true);
  });
});

describe("extract sandbox", () => {
  it("extracts through a coding agent", async () => {
    process.env.AI_GATEWAY_API_KEY = "gw-key";
    const sandbox = mockSandbox({
      stdout: JSON.stringify({
        type: "result",
        subtype: "success",
        result: JSON.stringify({ name: "Ada", age: 36 }),
        usage: { inputTokens: 11, outputTokens: 7 },
      }),
    });
    const result = await extract(Person, "claude-code", Buffer.from("doc"), {
      mediaType: "text/plain",
      sandbox: { create: async () => sandbox },
    });
    expect(result).toEqual({ name: "Ada", age: 36 });
  });

  it("rejects search style with a coding agent", async () => {
    await expect(
      extract(Person, "claude-code", Buffer.from("doc"), {
        mediaType: "text/plain",
        style: "search",
      }),
    ).rejects.toThrow(/sandbox/);
  });
});

describe("defaultCreate", () => {
  it("wraps Sandbox.create with credentials and a snapshot", async () => {
    process.env.AI_GATEWAY_API_KEY = "gw-key";
    process.env.VERCEL_TOKEN = "token";
    process.env.VERCEL_TEAM_ID = "team";
    process.env.VERCEL_PROJECT_ID = "project";
    process.env.OPENEXTRACT_SANDBOX_SNAPSHOT_ID = "snap-1";
    const { Sandbox } = await import("@vercel/sandbox");
    const created = mockSandbox({ resultJson: JSON.stringify({ name: "Ada", age: 36 }) });
    const spy = vi.spyOn(Sandbox, "create").mockResolvedValue(created as never);
    await runSandboxExtraction({
      schema: Person,
      model: "claude-code",
      data: new Uint8Array(Buffer.from("doc")),
      mediaType: "text/plain",
    });
    expect(spy.mock.calls[0]?.[0]).toMatchObject({
      token: "token",
      teamId: "team",
      projectId: "project",
      persistent: false,
      source: { type: "snapshot", snapshotId: "snap-1" },
    });
    spy.mockRestore();
  });

  it("creates without a snapshot when none is set", async () => {
    process.env.AI_GATEWAY_API_KEY = "gw-key";
    const { Sandbox } = await import("@vercel/sandbox");
    const created = mockSandbox({ resultJson: JSON.stringify({ name: "Ada", age: 36 }) });
    const spy = vi.spyOn(Sandbox, "create").mockResolvedValue(created as never);
    await runSandboxExtraction({
      schema: Person,
      model: "claude-code",
      data: new Uint8Array(Buffer.from("doc")),
      mediaType: "text/plain",
    });
    expect(spy.mock.calls[0]?.[0]).not.toHaveProperty("source");
    spy.mockRestore();
  });

  it("errors when @vercel/sandbox cannot be imported", async () => {
    process.env.AI_GATEWAY_API_KEY = "gw-key";
    vi.resetModules();
    vi.doMock("@vercel/sandbox", () => {
      throw new Error("missing");
    });
    const { runSandboxExtraction: run } = await import("../src/sandbox.js");
    const { Person: Schema } = await import("./helpers.js");
    const { ProviderNotInstalledError: Missing } = await import("../src/exceptions.js");
    await expect(
      run({
        schema: Schema,
        model: "claude-code",
        data: new Uint8Array(Buffer.from("doc")),
        mediaType: "text/plain",
      }),
    ).rejects.toBeInstanceOf(Missing);
    vi.doUnmock("@vercel/sandbox");
    vi.resetModules();
  });
});
