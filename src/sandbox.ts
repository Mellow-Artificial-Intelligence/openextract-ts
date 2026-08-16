import { toJSONSchema } from "zod";
import { resolveSandboxTimeoutSeconds, SANDBOX_SNAPSHOT_ENV } from "./config.js";
import { ModelError, ProviderNotInstalledError, SchemaValidationError } from "./exceptions.js";
import type { LanguageModel } from "./model.js";
import { ExtractionStyle, workspaceFilename } from "./styles.js";
import type {
  SandboxClient,
  SandboxCreateOptions,
  SandboxOptions,
  Usage,
} from "./types.js";
import type { z } from "zod";

export const CODING_AGENTS = ["claude-code", "codex"] as const;
export type CodingAgent = (typeof CODING_AGENTS)[number];

export interface CodingAgentRef {
  agent: CodingAgent;
  model?: string;
}

const CLAUDE_ENV = {
  ANTHROPIC_BASE_URL: "https://ai-gateway.vercel.sh/claude-code",
  CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY: "1",
} as const;

export function parseCodingAgent(model: LanguageModel): CodingAgentRef | null {
  if (typeof model !== "string") return null;
  for (const agent of CODING_AGENTS) {
    if (model === agent) return { agent };
    if (model.startsWith(`${agent}/`) || model.startsWith(`${agent}:`)) {
      const nested = model.slice(agent.length + 1);
      return nested ? { agent, model: nested } : { agent };
    }
  }
  return null;
}

export function resolveSandboxStyle(style: ExtractionStyle, model: LanguageModel): ExtractionStyle {
  const agent = parseCodingAgent(model);
  if (agent) {
    if (style === ExtractionStyle.SEARCH || style === ExtractionStyle.CODE) {
      throw new Error(
        `style '${style}' cannot be used with '${agent.agent}'. Use style='sandbox' (the default for coding agents).`,
      );
    }
    return ExtractionStyle.SANDBOX;
  }
  if (style === ExtractionStyle.SANDBOX) {
    throw new Error("style 'sandbox' requires model 'claude-code' or 'codex'.");
  }
  return style;
}

function gatewayKey(): string {
  const key = process.env.AI_GATEWAY_API_KEY?.trim() || process.env.VERCEL_OIDC_TOKEN?.trim();
  if (!key) {
    throw new ProviderNotInstalledError(
      "Sandbox coding agents need AI_GATEWAY_API_KEY so Claude Code and Codex can call the gateway from the VM.",
    );
  }
  return key;
}

function sandboxCredentials(): { token: string; teamId: string; projectId: string } | Record<string, never> {
  const token = process.env.VERCEL_TOKEN?.trim();
  const teamId = process.env.VERCEL_TEAM_ID?.trim();
  const projectId = process.env.VERCEL_PROJECT_ID?.trim();
  if (token && teamId && projectId) return { token, teamId, projectId };
  return {};
}

async function defaultCreate(options: SandboxCreateOptions): Promise<SandboxClient> {
  let Sandbox: typeof import("@vercel/sandbox").Sandbox;
  try {
    ({ Sandbox } = await import("@vercel/sandbox"));
  } catch {
    throw new ProviderNotInstalledError(
      "Install @vercel/sandbox to extract with Claude Code or Codex (style='sandbox').",
    );
  }
  const snapshotId = options.snapshotId ?? process.env[SANDBOX_SNAPSHOT_ENV]?.trim();
  const shared = {
    ...sandboxCredentials(),
    persistent: false as const,
    timeout: options.timeout,
    env: options.env,
  };
  const sandbox = snapshotId
    ? await Sandbox.create({ ...shared, source: { type: "snapshot", snapshotId } })
    : await Sandbox.create(shared);
  return {
    writeFiles: (files) => sandbox.writeFiles(files),
    runCommand: (command, args, opts) => sandbox.runCommand(command, args, opts),
    readFileToBuffer: (file) => sandbox.readFileToBuffer(file),
    stop: async () => {
      await sandbox.stop();
    },
  };
}

function asNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function usageFromUnknown(value: unknown): Usage {
  if (!value || typeof value !== "object") {
    return { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
  }
  const rec = value as Record<string, unknown>;
  const inputTokens = asNumber(rec.input_tokens ?? rec.inputTokens);
  const outputTokens = asNumber(rec.output_tokens ?? rec.outputTokens);
  const totalTokens = asNumber(rec.total_tokens ?? rec.totalTokens) || inputTokens + outputTokens;
  return { inputTokens, outputTokens, totalTokens };
}

function parseJsonValue(text: string): unknown {
  const trimmed = text.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  return JSON.parse(fence ? fence[1]!.trim() : trimmed);
}

export function parseAgentStdout(stdout: string): { output: unknown; usage: Usage } {
  const trimmed = stdout.trim();
  if (!trimmed) throw new ModelError("Coding agent returned empty output.", { retryable: false });
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    if (parsed && typeof parsed === "object" && parsed.type === "result") {
      if (parsed.subtype != null && parsed.subtype !== "success") {
        throw new ModelError(String(parsed.result ?? parsed.errors ?? "Coding agent failed"), {
          provider: "claude-code",
          retryable: false,
        });
      }
      const result = parsed.result;
      return {
        output: typeof result === "string" ? parseJsonValue(result) : result,
        usage: usageFromUnknown(parsed.usage),
      };
    }
    return { output: parsed, usage: usageFromUnknown(parsed.usage) };
  } catch (error) {
    if (error instanceof ModelError) throw error;
    return { output: parseJsonValue(trimmed), usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 } };
  }
}

function extractionPrompt(
  filename: string,
  mediaType: string,
  instructions?: string,
): string {
  const extra = instructions?.trim();
  return [
    `Extract structured data from '${filename}' (${mediaType}) in this workspace.`,
    "Inspect the file with the tools available. Match schema.json exactly.",
    "Write the JSON object to result.json and print the same JSON as the final answer.",
    extra ? `Instructions: ${extra}` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

function claudeArgs(prompt: string, nestedModel?: string): string[] {
  const args = [
    "-p",
    "--output-format",
    "json",
    "--dangerously-skip-permissions",
    "--max-turns",
    "25",
  ];
  if (nestedModel) args.push("--model", nestedModel);
  args.push(prompt);
  return args;
}

function codexArgs(prompt: string, nestedModel?: string): string[] {
  const args = [
    "exec",
    "--skip-git-repo-check",
    "--sandbox",
    "danger-full-access",
    "-c",
    "approval_policy=never",
    "--output-schema",
    "schema.json",
    "-o",
    "result.json",
  ];
  if (nestedModel) args.push("-c", `model=${JSON.stringify(nestedModel)}`);
  args.push(prompt);
  return args;
}

async function runAgent(
  sandbox: SandboxClient,
  agent: CodingAgentRef,
  prompt: string,
  timeoutMs: number,
): Promise<{ stdout: string }> {
  const cmd = agent.agent === "codex" ? "codex" : "claude";
  const pkg = agent.agent === "codex" ? "@openai/codex" : "@anthropic-ai/claude-code";
  const agentArgs = agent.agent === "codex" ? codexArgs(prompt, agent.model) : claudeArgs(prompt, agent.model);
  const result = await sandbox.runCommand(
    "sh",
    [
      "-c",
      `if command -v ${cmd} >/dev/null 2>&1; then exec ${cmd} "$@"; else exec npx -y ${pkg} "$@"; fi`,
      cmd,
      ...agentArgs,
    ],
    { timeoutMs },
  );
  const stdout = await result.stdout();
  if (result.exitCode !== 0) {
    const stderr = await result.stderr();
    throw new ModelError(
      `${agent.agent} exited ${result.exitCode}: ${(stderr || stdout).slice(0, 2000)}`,
      { provider: agent.agent, retryable: true },
    );
  }
  return { stdout };
}

export async function runSandboxExtraction<T>(options: {
  schema: z.ZodType<T>;
  model: LanguageModel;
  data: Uint8Array;
  mediaType: string;
  instructions?: string;
  timeoutMs?: number;
  sandbox?: SandboxOptions;
}): Promise<{ output: T; usage: Usage }> {
  const agent = parseCodingAgent(options.model);
  if (!agent) {
    throw new Error("style 'sandbox' requires model 'claude-code' or 'codex'.");
  }
  const timeoutSec = resolveSandboxTimeoutSeconds(
    options.sandbox?.timeout ?? (options.timeoutMs != null ? options.timeoutMs / 1000 : undefined),
  );
  const timeoutMs = Math.round(timeoutSec * 1000);
  const key = gatewayKey();
  const filename = workspaceFilename(options.mediaType);
  const schemaJson = JSON.stringify(toJSONSchema(options.schema), null, 2);
  const prompt = extractionPrompt(filename, options.mediaType, options.instructions);
  const env: Record<string, string> = {
    AI_GATEWAY_API_KEY: key,
    ANTHROPIC_AUTH_TOKEN: key,
    ANTHROPIC_API_KEY: "",
    ...CLAUDE_ENV,
  };
  const create = options.sandbox?.create ?? defaultCreate;
  const sandbox = await create({
    timeout: timeoutMs,
    snapshotId: options.sandbox?.snapshotId,
    env,
  });
  try {
    const files: { path: string; content: string | Uint8Array }[] = [
      { path: filename, content: options.data },
      { path: "schema.json", content: schemaJson },
    ];
    if (agent.agent === "codex") {
      const modelLine = agent.model ? `model = ${JSON.stringify(agent.model)}\n` : "";
      files.push({
        path: "codex-config.toml",
        content:
          `model_provider = "vercel"\n${modelLine}\n[model_providers.vercel]\n` +
          'name = "Vercel AI Gateway"\nbase_url = "https://ai-gateway.vercel.sh/codex/v1"\n' +
          'env_key = "AI_GATEWAY_API_KEY"\nwire_api = "responses"\n',
      });
    }
    await sandbox.writeFiles(files);
    if (agent.agent === "codex") {
      await sandbox.runCommand("sh", ["-c", "mkdir -p ~/.codex && cp codex-config.toml ~/.codex/config.toml"]);
    }
    const { stdout } = await runAgent(sandbox, agent, prompt, timeoutMs);
    const file = await sandbox.readFileToBuffer({ path: "result.json" });
    let parsed: { output: unknown; usage: Usage };
    if (file?.length) {
      parsed = { output: parseJsonValue(file.toString("utf8")), usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 } };
      try {
        parsed.usage = parseAgentStdout(stdout).usage;
      } catch {
        // keep zeros when stdout is not a usage envelope
      }
    } else {
      parsed = parseAgentStdout(stdout);
    }
    const result = options.schema.safeParse(parsed.output);
    if (!result.success) {
      throw new SchemaValidationError(`Model output did not match schema: ${result.error.message}`);
    }
    return { output: result.data, usage: parsed.usage };
  } finally {
    await sandbox.stop();
  }
}
