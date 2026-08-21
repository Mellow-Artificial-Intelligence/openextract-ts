import type { StyleName } from "@/lib/presets";

export const DEFAULT_MODEL = "openai/gpt-5.6-luna";

/** Suggested models, in the order they are offered and auto-assigned. */
export const MODELS = [
  { id: "openai/gpt-5.6-luna", name: "GPT-5.6 Luna", provider: "openai" },
  { id: "openai/gpt-5.6-sol", name: "GPT-5.6 Sol", provider: "openai" },
  { id: "openai/gpt-5.6-terra", name: "GPT-5.6 Terra", provider: "openai" },
  { id: "google/gemini-3.7-flash", name: "Gemini 3.7 Flash", provider: "google" },
  { id: "google/gemini-3.6-flash", name: "Gemini 3.6 Flash", provider: "google" },
  { id: "anthropic/claude-haiku-4.5", name: "Claude Haiku 4.5", provider: "anthropic" },
  { id: "anthropic/claude-sonnet-5", name: "Claude Sonnet 5", provider: "anthropic" },
  { id: "anthropic/claude-opus-5", name: "Claude Opus 5", provider: "anthropic" },
  { id: "claude-code", name: "Claude Code", provider: "anthropic" },
  { id: "codex", name: "Codex", provider: "openai" },
] as const;

export type ModelId = (typeof MODELS)[number]["id"];

const MODEL_IDS = new Set<string>(MODELS.map((model) => model.id));

export function isModelId(value: string): value is ModelId {
  return MODEL_IDS.has(value);
}

export function isCodingAgentId(value: string): boolean {
  return (
    value === "claude-code" ||
    value === "codex" ||
    value.startsWith("claude-code/") ||
    value.startsWith("claude-code:") ||
    value.startsWith("codex/") ||
    value.startsWith("codex:")
  );
}

export function isExtractModel(value: string): boolean {
  return MODEL_IDS.has(value) || isCodingAgentId(value);
}

export const GATEWAY_MODELS = MODELS.filter((model) => !isCodingAgentId(model.id));

export function usesSandbox(model: string, style: string): boolean {
  return isCodingAgentId(model) || style === "sandbox";
}

export function resolveMemberStyle(model: string, style: StyleName, sandbox: boolean): StyleName {
  if (isCodingAgentId(model)) {
    if (!sandbox) throw new Error("Turn on Sandboxes to use Claude Code or Codex on the team.");
    return "sandbox";
  }
  return style === "sandbox" ? "direct" : style;
}

export const SWARM_SIZES = [1, 2, 3, 4, 6, 8] as const;
export type SwarmSize = (typeof SWARM_SIZES)[number];
export const MAX_SWARM_AGENTS = 8;

export function resizeAgentModels(
  current: readonly ModelId[],
  count: number,
  fallback: ModelId,
  pool: readonly { id: ModelId }[] = MODELS,
): ModelId[] {
  const n = Math.min(MAX_SWARM_AGENTS, Math.max(1, Math.trunc(count) || 1));
  if (current.length >= n) return current.slice(0, n);
  const used = new Set(current);
  const next = current.slice();
  for (let i = current.length; i < n; i++) {
    const unused = pool.find((item) => !used.has(item.id));
    const id = unused?.id ?? fallback;
    next.push(id);
    used.add(id);
  }
  return next;
}

export function setAgentModelAt(
  current: readonly ModelId[],
  index: number,
  model: ModelId,
): ModelId[] {
  return current.map((id, i) => (i === index ? model : id));
}

export function modelLabel(id: string): string {
  const exact = MODELS.find((model) => model.id === id);
  if (exact) return exact.name;
  if (id.startsWith("codex/") || id.startsWith("codex:")) return `Codex · ${id.slice(6)}`;
  if (id.startsWith("claude-code/") || id.startsWith("claude-code:")) {
    return `Claude Code · ${id.slice(12)}`;
  }
  return id;
}
