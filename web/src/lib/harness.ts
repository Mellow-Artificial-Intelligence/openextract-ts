import {
  MAX_SWARM_AGENTS,
  MODELS,
  isCodingAgentId,
} from "./models";

/** Claude Code `createClaudeCode({ model })` ids. Users can type any Anthropic / gateway id. */
export const CLAUDE_CODE_MODELS = [
  "claude-sonnet-4-6",
  "claude-opus-4-6",
  "claude-sonnet-5",
  "claude-opus-5",
  "claude-haiku-4.5",
] as const;

/** Codex `createCodex({ model })` ids. Users can type any OpenAI / gateway id. */
export const CODEX_MODELS = ["gpt-5.5", "gpt-5.6", "gpt-5.4", "gpt-5.3-codex"] as const;

export const REASONING_EFFORTS = ["low", "medium", "high"] as const;
export type ReasoningEffort = (typeof REASONING_EFFORTS)[number];

export type CodingKind = "claude-code" | "codex";

export interface CodingSettings {
  model: string;
  maxTurns: number;
  reasoningEffort: ReasoningEffort;
}

export interface CodingOptions {
  maxTurns?: number;
  reasoningEffort?: ReasoningEffort;
}

export interface AgentSpec {
  id: string;
  coding?: CodingSettings;
}

export function codingKind(id: string): CodingKind | null {
  if (id === "codex" || id.startsWith("codex/") || id.startsWith("codex:")) return "codex";
  if (id === "claude-code" || id.startsWith("claude-code/") || id.startsWith("claude-code:")) {
    return "claude-code";
  }
  return null;
}

export function defaultCodingSettings(kind: CodingKind): CodingSettings {
  return kind === "codex"
    ? { model: "gpt-5.5", maxTurns: 25, reasoningEffort: "medium" }
    : { model: "claude-sonnet-4-6", maxTurns: 25, reasoningEffort: "medium" };
}

export function specForModel(id: string, prev?: AgentSpec): AgentSpec {
  const kind = codingKind(id);
  if (!kind) return { id };
  const keep = prev && codingKind(prev.id) === kind ? prev.coding : undefined;
  return { id, coding: keep ?? defaultCodingSettings(kind) };
}

export function resizeAgentSpecs(
  current: readonly AgentSpec[],
  count: number,
  fallback: AgentSpec,
  pool: readonly { id: string }[] = MODELS,
): AgentSpec[] {
  const n = Math.min(MAX_SWARM_AGENTS, Math.max(1, Math.trunc(count) || 1));
  if (current.length >= n) return current.slice(0, n);
  const used = new Set(current.map((spec) => spec.id));
  const next = current.slice();
  for (let i = current.length; i < n; i++) {
    const unused = pool.find((item) => !used.has(item.id));
    const id = unused?.id ?? fallback.id;
    next.push(specForModel(id, id === fallback.id ? fallback : undefined));
    used.add(id);
  }
  return next;
}

export function sanitizeCodingModel(kind: CodingKind, value: string): string {
  const trimmed = value.trim().slice(0, 120);
  if (trimmed.startsWith(`${kind}/`) || trimmed.startsWith(`${kind}:`)) {
    return trimmed.slice(kind.length + 1).trim();
  }
  return trimmed;
}

export function composeExtractModel(spec: AgentSpec): string {
  const kind = codingKind(spec.id);
  if (!kind) return spec.id;
  const nested = spec.coding?.model.trim();
  return nested ? `${kind}/${nested}` : kind;
}

export function extractCodingOptions(spec: AgentSpec): CodingOptions | undefined {
  if (!spec.coding || !isCodingAgentId(spec.id)) return undefined;
  return codingKind(spec.id) === "codex"
    ? { reasoningEffort: spec.coding.reasoningEffort }
    : { maxTurns: spec.coding.maxTurns };
}

export function parseCodingOptions(value: unknown): CodingOptions | undefined {
  if (!value || typeof value !== "object") return undefined;
  const rec = value as Record<string, unknown>;
  const maxTurns =
    typeof rec.maxTurns === "number" && Number.isFinite(rec.maxTurns)
      ? Math.min(80, Math.max(1, Math.trunc(rec.maxTurns)))
      : undefined;
  const reasoningEffort = REASONING_EFFORTS.find((item) => item === rec.reasoningEffort);
  if (maxTurns == null && reasoningEffort == null) return undefined;
  return { maxTurns, reasoningEffort };
}
