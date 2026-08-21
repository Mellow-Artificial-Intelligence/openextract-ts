import { Sandbox } from "@vercel/sandbox";
import { toJSONSchema } from "zod";
import type { z } from "zod";
import { isCodingAgentId } from "@/lib/models";
import { extractOutputSchema } from "@/lib/table-schema";
import type { PreparedExtract } from "./extract-types";

function gatewayKey(): string {
  const key = process.env.AI_GATEWAY_API_KEY?.trim() || process.env.VERCEL_OIDC_TOKEN?.trim();
  if (!key) {
    throw new Error("Sandbox extraction needs AI_GATEWAY_API_KEY so Claude Code and Codex can call the gateway.");
  }
  return key;
}

function sandboxCredentials() {
  const token = process.env.VERCEL_TOKEN?.trim();
  const teamId = process.env.VERCEL_TEAM_ID?.trim();
  const projectId = process.env.VERCEL_PROJECT_ID?.trim();
  if (token && teamId && projectId) return { token, teamId, projectId };
  return {};
}

function parseJson(text: string): unknown {
  const trimmed = text.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  return JSON.parse(fence ? fence[1]!.trim() : trimmed);
}

function parseStdout(stdout: string): unknown {
  const parsed = parseJson(stdout);
  if (parsed && typeof parsed === "object" && "type" in parsed && (parsed as { type: string }).type === "result") {
    const envelope = parsed as { subtype?: string; result?: unknown };
    if (envelope.subtype != null && envelope.subtype !== "success") {
      throw new Error(String(envelope.result ?? "Coding agent failed"));
    }
    return typeof envelope.result === "string" ? parseJson(envelope.result) : envelope.result;
  }
  return parsed;
}

function agentId(model: string): "claude-code" | "codex" {
  return model === "codex" || model.startsWith("codex/") ? "codex" : "claude-code";
}

function nestedModel(model: string): string | undefined {
  if (model.startsWith("claude-code/")) return model.slice("claude-code/".length);
  if (model.startsWith("codex/")) return model.slice("codex/".length);
  return undefined;
}

export async function extractWithCodingAgent<T>(options: {
  model: string;
  prompt: string;
  system: string;
  text: string;
  files: Array<{ mediaType: string; data: Buffer }>;
  schema: z.ZodType<T>;
  coding?: { maxTurns?: number; reasoningEffort?: "low" | "medium" | "high" };
}): Promise<T> {
  const model = isCodingAgentId(options.model) ? options.model : "claude-code";
  const agent = agentId(model);
  const nested = nestedModel(model);
  const maxTurns = options.coding?.maxTurns ?? 25;
  const reasoningEffort = options.coding?.reasoningEffort;
  const key = gatewayKey();
  const schema = options.schema;
  const snapshotId = process.env.OPENEXTRACT_SANDBOX_SNAPSHOT_ID?.trim();
  const shared = {
    ...sandboxCredentials(),
    persistent: false as const,
    timeout: 300_000,
    env: {
      AI_GATEWAY_API_KEY: key,
      ANTHROPIC_AUTH_TOKEN: key,
      ANTHROPIC_API_KEY: "",
      ANTHROPIC_BASE_URL: "https://ai-gateway.vercel.sh/claude-code",
      CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY: "1",
    },
  };
  const sandbox = snapshotId
    ? await Sandbox.create({ ...shared, source: { type: "snapshot" as const, snapshotId } })
    : await Sandbox.create(shared);
  try {
    const writes: { path: string; content: string | Uint8Array }[] = [
      { path: "schema.json", content: JSON.stringify(toJSONSchema(schema), null, 2) },
    ];
    if (options.text.trim()) writes.push({ path: "document.txt", content: options.text });
    options.files.forEach((file, index) => {
      const subtype = file.mediaType.split("/").pop()?.replace(/[^a-z0-9]+/gi, "") || "bin";
      writes.push({ path: `file-${index}.${subtype}`, content: file.data });
    });
    if (agent === "codex") {
      const modelLine = nested ? `model = ${JSON.stringify(nested)}\n` : "";
      const effortLine = reasoningEffort ? `model_reasoning_effort = ${JSON.stringify(reasoningEffort)}\n` : "";
      writes.push({
        path: "codex-config.toml",
        content:
          `model_provider = "vercel"\n${modelLine}${effortLine}\n[model_providers.vercel]\n` +
          'name = "Vercel AI Gateway"\nbase_url = "https://ai-gateway.vercel.sh/codex/v1"\n' +
          'env_key = "AI_GATEWAY_API_KEY"\nwire_api = "responses"\n',
      });
    }
    await sandbox.writeFiles(writes);
    const prompt = [
      options.system,
      options.prompt,
      "Inspect document.txt and any file-* attachments.",
      "Match schema.json. Write the JSON object to result.json.",
    ].join("\n\n");
    const cmd = agent === "codex" ? "codex" : "claude";
    const pkg = agent === "codex" ? "@openai/codex" : "@anthropic-ai/claude-code";
    const agentArgs =
      agent === "codex"
        ? [
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
            ...(nested ? ["-c", `model=${JSON.stringify(nested)}`] : []),
            ...(reasoningEffort ? ["-c", `model_reasoning_effort=${JSON.stringify(reasoningEffort)}`] : []),
            prompt,
          ]
        : [
            "-p",
            "--output-format",
            "json",
            "--dangerously-skip-permissions",
            "--max-turns",
            String(maxTurns),
            ...(nested ? ["--model", nested] : []),
            prompt,
          ];
    if (agent === "codex") {
      await sandbox.runCommand("sh", ["-c", "mkdir -p ~/.codex && cp codex-config.toml ~/.codex/config.toml"]);
    }
    const result = await sandbox.runCommand(
      "sh",
      [
        "-c",
        `if command -v ${cmd} >/dev/null 2>&1; then exec ${cmd} "$@"; else exec npx -y ${pkg} "$@"; fi`,
        cmd,
        ...agentArgs,
      ],
      { timeoutMs: 280_000 },
    );
    const stdout = await result.stdout();
    if (result.exitCode !== 0) {
      throw new Error(`${agent} exited ${result.exitCode}: ${(await result.stderr() || stdout).slice(0, 2000)}`);
    }
    const file = await sandbox.readFileToBuffer({ path: "result.json" });
    const raw = file?.length ? parseJson(file.toString("utf8")) : parseStdout(stdout);
    return schema.parse(raw);
  } finally {
    await sandbox.stop();
  }
}

export async function extractSandbox(prepared: PreparedExtract) {
  "use step";
  console.log("extractSandbox", prepared.model);
  return extractWithCodingAgent({
    model: prepared.model,
    prompt: prepared.prompt,
    system: prepared.system,
    text: prepared.text,
    files: prepared.files.map((file) => ({
      mediaType: file.mediaType,
      data: Buffer.from(file.data, "base64"),
    })),
    schema: extractOutputSchema(prepared.columns),
    coding: prepared.coding,
  });
}
