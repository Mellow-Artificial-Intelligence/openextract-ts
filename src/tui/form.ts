import { toError } from "../errors.js";
import { extractWithUsage, type ExtractOptions } from "../extract.js";
import { resolveSchemaSpec } from "../schema-spec.js";
import type { ExtractionInputLike, Usage } from "../types.js";
import type { z } from "zod";

export const SOURCE_KINDS = ["path", "paste"] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];

export const STYLES = ["direct", "search", "code", "sandbox"] as const;
export type StyleName = (typeof STYLES)[number];

export const PRESETS = {
  document: {
    label: "Document",
    spec: "title: string\nsummary: string\nlanguage: string",
  },
  invoice: {
    label: "Invoice",
    spec: "vendor: string\ntotal: number\nlineItems: [{ description: string, amount: number }]",
  },
  contact: {
    label: "Contact",
    spec: "name: string\nemail: string\nrole: string\ncompany: string",
  },
  facts: {
    label: "Facts",
    spec: "facts: [{ name: string, value: string }]",
  },
  custom: {
    label: "Custom",
    spec: "field: string",
  },
} as const;

export type PresetId = keyof typeof PRESETS;

export const PRESET_IDS = Object.keys(PRESETS) as PresetId[];

export const DEFAULT_MODEL = "openai/gpt-5.5";

export interface TuiForm {
  sourceKind: SourceKind;
  source: string;
  mediaType?: string;
  schemaSpec: string;
  model: string;
  instructions: string;
  style: StyleName;
  maxRetries: number;
}

export interface TuiLaunchOptions {
  source?: string;
  mediaType?: string;
  schema?: string;
  model?: string;
  instructions?: string;
  style?: string;
}

export interface TuiExtractResult {
  output: unknown;
  usage: Usage;
  durationMs: number;
}

export function defaultForm(options: TuiLaunchOptions = {}): TuiForm {
  const source = options.source?.trim() ?? "";
  const schema = options.schema?.trim();
  const style = STYLES.includes(options.style as StyleName)
    ? (options.style as StyleName)
    : "direct";
  return {
    sourceKind: source ? "path" : "paste",
    source,
    mediaType: options.mediaType,
    schemaSpec: schema || PRESETS.document.spec,
    model: options.model?.trim() || process.env.OPENEXTRACT_MODEL?.trim() || DEFAULT_MODEL,
    instructions: options.instructions?.trim() ?? "",
    style,
    maxRetries: 2,
  };
}

export function presetIdForSpec(spec: string): PresetId {
  const normalized = spec.trim();
  for (const id of PRESET_IDS) {
    if (id !== "custom" && PRESETS[id].spec === normalized) return id;
  }
  return "custom";
}

export function resolveTuiInput(form: TuiForm): ExtractionInputLike {
  const source = form.source.trim();
  if (!source) {
    throw new Error(
      form.sourceKind === "paste"
        ? "Paste some text, or switch to Path and enter a file or URL."
        : "Enter a local path or http(s) URL.",
    );
  }
  if (form.sourceKind === "paste") return Buffer.from(form.source, "utf8");
  return source;
}

export function resolveTuiMediaType(form: TuiForm): string | undefined {
  const explicit = form.mediaType?.trim();
  if (explicit) return explicit;
  return form.sourceKind === "paste" ? "text/plain" : undefined;
}

export function validateForm(form: TuiForm): string | null {
  try {
    resolveTuiInput(form);
  } catch (error) {
    return toError(error).message;
  }
  if (!form.model.trim()) return "Enter an AI Gateway model id, or claude-code / codex.";
  if (!form.schemaSpec.trim()) return "Describe the output shape, or pick a preset.";
  return null;
}

export async function runTuiExtract(
  form: TuiForm,
  deps: {
    extractWithUsage?: typeof extractWithUsage;
    resolveSchema?: typeof resolveSchemaSpec;
  } = {},
): Promise<TuiExtractResult> {
  const problem = validateForm(form);
  if (problem) throw new Error(problem);
  const resolveSchema = deps.resolveSchema ?? resolveSchemaSpec;
  const extract = deps.extractWithUsage ?? extractWithUsage;
  const schema = (await resolveSchema(form.schemaSpec)) as z.ZodType<unknown>;
  const options: ExtractOptions = {
    instructions: form.instructions.trim() || undefined,
    style: form.style,
    mediaType: resolveTuiMediaType(form),
    maxRetries: form.maxRetries,
  };
  const started = Date.now();
  const { output, usage } = await extract(schema, form.model.trim(), resolveTuiInput(form), options);
  return { output, usage, durationMs: Date.now() - started };
}

export function formatResultJson(output: unknown): string {
  return JSON.stringify(output, null, 2);
}

export function formatUsage(usage: Usage, durationMs: number): string {
  const seconds = (durationMs / 1000).toFixed(1);
  return `${usage.totalTokens} tokens · ${seconds}s`;
}

export function resultFilename(now = new Date()): string {
  const stamp = now.toISOString().replaceAll(":", "-").replace(/\.\d+Z$/, "Z");
  return `openextract-${stamp}.json`;
}
