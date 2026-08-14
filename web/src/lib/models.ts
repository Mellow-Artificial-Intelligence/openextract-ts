export const DEFAULT_MODEL = "openai/gpt-5.6-luna";

export const MODELS = [
  { id: "openai/gpt-5.6-luna", name: "GPT-5.6 Luna", provider: "openai" },
  { id: "xai/grok-4.6", name: "Grok 4.6", provider: "xai" },
  { id: "anthropic/claude-sonnet-5", name: "Claude Sonnet 5", provider: "anthropic" },
  { id: "google/gemini-3.7-flash", name: "Gemini 3.7 Flash", provider: "google" },
] as const;

export type ModelId = (typeof MODELS)[number]["id"];

const MODEL_IDS = new Set<string>(MODELS.map((model) => model.id));

export function isModelId(value: string): value is ModelId {
  return MODEL_IDS.has(value);
}
