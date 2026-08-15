export const DEFAULT_MODEL = "openai/gpt-5.6-luna";

export const MODELS = [
  { id: "openai/gpt-5.6-luna", name: "GPT-5.6 Luna", provider: "openai" },
  { id: "xai/grok-4.6", name: "Grok 4.6", provider: "xai" },
  { id: "google/gemini-3.7-flash", name: "Gemini 3.7 Flash", provider: "google" },
] as const;

export type ModelId = (typeof MODELS)[number]["id"];

const MODEL_IDS = new Set<string>(MODELS.map((model) => model.id));

export function isModelId(value: string): value is ModelId {
  return MODEL_IDS.has(value);
}

export const SWARM_SIZES = [1, 2, 3, 4, 6, 8] as const;
export type SwarmSize = (typeof SWARM_SIZES)[number];
export const MAX_SWARM_AGENTS = 8;

export function resizeAgentModels(
  current: readonly ModelId[],
  count: number,
  fallback: ModelId,
): ModelId[] {
  const n = Math.min(MAX_SWARM_AGENTS, Math.max(1, Math.trunc(count) || 1));
  if (current.length >= n) return current.slice(0, n);
  const used = new Set(current);
  const next = current.slice();
  for (let i = current.length; i < n; i++) {
    const unused = MODELS.find((item) => !used.has(item.id));
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
  return MODELS.find((model) => model.id === id)?.name ?? id;
}
