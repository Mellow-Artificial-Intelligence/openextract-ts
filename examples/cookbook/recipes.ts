import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gateway } from "ai";
import {
  COOKBOOK_MODEL,
  STYLE_ROLES,
  AUDIT_ROLES,
  formatLiveDocs,
  formatSwarmDocs,
  listCookbookDocs,
  numberedRoles,
  auditMembers,
  styleMembers,
  swarmExtractDocs,
  swarmExtractSchema,
  Audit,
  isAudit,
  type CookbookAgentEvent,
  type CookbookValue,
} from "./01-document-swarm/extract.js";
import type { ExtractionResult, LanguageModel, SwarmResult } from "../../src/index.js";

export { COOKBOOK_MODEL };

export const MAX_COOKBOOK_SWARM_SIZE = 16;

export type CookbookDocResult = { source: string } & SwarmResult<CookbookValue>;

export type AgentPhase = "queued" | "running" | "done" | "error";

export interface AgentSlot {
  phase: AgentPhase;
  result?: ExtractionResult<CookbookValue> | Error;
  startedAt?: number;
  finishedAt?: number;
}

export interface CookbookAgentView {
  index: number;
  role: string;
  phase: AgentPhase;
  summary: string;
  elapsed: string;
}

export interface CookbookCard {
  source: string;
  state: "running" | "done";
  heading: string;
  subheading: string;
  total: string;
  meta: string;
  lines: Array<{ left: string; right: string }>;
  agents: CookbookAgentView[];
}

export function agentMark(phase: AgentPhase): string {
  if (phase === "running") return "◐";
  if (phase === "done") return "●";
  if (phase === "error") return "×";
  return "○";
}

export function formatElapsed(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function money(total: number, currency: string): string {
  return `${total.toFixed(2)} ${currency}`;
}

function outputFromSlots(slots: readonly AgentSlot[]): CookbookValue | undefined {
  for (let i = slots.length - 1; i >= 0; i--) {
    const result = slots[i]?.result;
    if (result && !(result instanceof Error)) return result.output;
  }
  return undefined;
}

function summarizeValue(value: CookbookValue): string {
  if (isAudit(value)) {
    const first = value.findings[0]?.note;
    return first ? `${value.verdict}  ${first}` : value.verdict;
  }
  return `${value.vendor}  ${value.invoiceNumber}  ${money(value.total, value.currency)}`;
}

function summarizeAgent(slot: AgentSlot): string {
  if (slot.phase === "queued") return "queued";
  if (slot.phase === "running") return "running";
  if (slot.result instanceof Error) return slot.result.message;
  if (slot.result && !(slot.result instanceof Error)) return summarizeValue(slot.result.output);
  return "—";
}

function elapsedFor(slot: AgentSlot, now: number): string {
  if (slot.result && !(slot.result instanceof Error) && slot.result.duration > 0) {
    return formatElapsed(slot.result.duration * 1000);
  }
  const start = slot.startedAt;
  if (start == null) return "";
  return formatElapsed((slot.finishedAt ?? now) - start);
}

export function slotsFromAgents(
  agents: ReadonlyArray<ExtractionResult<CookbookValue> | Error | undefined>,
  running: ReadonlySet<number> = new Set(),
): AgentSlot[] {
  return agents.map((result, index) => {
    if (result instanceof Error) return { phase: "error", result };
    if (result) return { phase: "done", result };
    if (running.has(index)) return { phase: "running" };
    return { phase: "queued" };
  });
}

function agentViews(slots: readonly AgentSlot[], roles: readonly string[], now: number): CookbookAgentView[] {
  return slots.map((slot, index) => ({
    index,
    role: roles[index] ?? `Agent ${index + 1}`,
    phase: slot.phase,
    summary: summarizeAgent(slot),
    elapsed: elapsedFor(slot, now),
  }));
}

function cardFromOutput(
  source: string,
  value: CookbookValue | undefined,
  meta: string,
  state: "running" | "done",
  agents: CookbookAgentView[],
): CookbookCard {
  if (value && isAudit(value)) {
    return {
      source: basename(source),
      state,
      heading: value.subject,
      subheading: value.verdict,
      total: money(value.amount, value.currency),
      meta,
      lines: value.findings.map((item) => ({ left: item.note, right: item.severity })),
      agents,
    };
  }
  const invoice = value && !isAudit(value) ? value : undefined;
  return {
    source: basename(source),
    state,
    heading: invoice?.vendor ?? (state === "running" ? "Extracting" : "—"),
    subheading: invoice?.invoiceNumber ?? "",
    total: invoice ? money(invoice.total, invoice.currency) : "",
    meta,
    lines: (invoice?.lineItems ?? []).map((item) => ({
      left: item.description,
      right: item.amount.toFixed(2),
    })),
    agents,
  };
}

export function cookbookCards(
  done: readonly CookbookDocResult[],
  pending?: { source: string; slots: readonly AgentSlot[] },
  options: { roles?: readonly string[]; now?: number } = {},
): CookbookCard[] {
  const now = options.now ?? Date.now();
  const cards = done.map((result) => {
    const slots = slotsFromAgents(result.agents);
    const roles = options.roles ?? numberedRoles(slots.length);
    const views = agentViews(slots, roles, now);
    const ok = views.filter((item) => item.phase === "done").length;
    return cardFromOutput(
      result.source,
      result.output,
      `${views.map((item) => agentMark(item.phase)).join(" ")}  ${result.reduce}  ${ok}/${views.length}`,
      "done",
      views,
    );
  });
  if (!pending) return cards;
  const roles = options.roles ?? numberedRoles(pending.slots.length);
  const views = agentViews(pending.slots, roles, now);
  const finished = views.filter((item) => item.phase === "done" || item.phase === "error").length;
  cards.push(
    cardFromOutput(
      pending.source,
      outputFromSlots(pending.slots),
      `${views.map((item) => agentMark(item.phase)).join(" ")}  ${finished}/${views.length}`,
      "running",
      views,
    ),
  );
  return cards;
}

export function alignPair(left: string, right: string, width: number): string {
  const w = Math.max(16, width);
  if (!right) return left.slice(0, w);
  const maxLeft = Math.max(1, w - right.length - 2);
  const clipped = left.length > maxLeft ? `${left.slice(0, Math.max(1, maxLeft - 1))}…` : left;
  return `${clipped}${" ".repeat(Math.max(2, w - clipped.length - right.length))}${right}`;
}

export function formatCookbookCard(card: CookbookCard, width = 52): string {
  const rows = [alignPair(card.heading, card.subheading, width), alignPair(card.total, card.meta, width)];
  if (card.lines.length > 0) {
    rows.push("");
    for (const line of card.lines) rows.push(alignPair(line.left, line.right, width));
  }
  if (card.agents.length > 0) {
    rows.push("");
    for (const agent of card.agents) {
      rows.push(
        alignPair(
          `  ${agent.index + 1}  ${agent.role}  ${agentMark(agent.phase)}  ${agent.summary}`,
          agent.elapsed,
          width,
        ),
      );
    }
  }
  return rows.join("\n");
}

export function nextStreamChunk(shown: string, target: string): string | null {
  if (shown === target) return null;
  if (!target.startsWith(shown)) return target;
  const rest = target.slice(shown.length);
  return rest.match(/^\s*\S+/)?.[0] ?? rest[0] ?? null;
}

export interface CookbookRunOptions {
  size: number;
  onDoc?: (source: string, index: number, total: number) => void;
  onAgentStart?: (event: CookbookAgentEvent) => void;
  onAgent?: (event: CookbookAgentEvent & { result: ExtractionResult<CookbookValue> | Error }) => void;
  onResult?: (results: CookbookDocResult[]) => void;
}

export interface CookbookRecipe {
  id: string;
  title: string;
  blurb: string;
  defaultSize: number;
  lockSize?: boolean;
  roles: (size: number) => string[];
  listDocs: () => Promise<string[]>;
  run: (model: LanguageModel, docs: readonly string[], options: CookbookRunOptions) => Promise<CookbookDocResult[]>;
  format: (results: CookbookDocResult[]) => unknown;
  formatLive: typeof formatLiveDocs;
}

const VOTE_DOCS_DIR = join(dirname(fileURLToPath(import.meta.url)), "03-vote/docs");
const AUDIT_DOCS_DIR = join(dirname(fileURLToPath(import.meta.url)), "04-audit/docs");

export const RECIPES: CookbookRecipe[] = [
  {
    id: "ap-inbox",
    title: "AP inbox",
    blurb: "A folder of vendor invoices — one payable record each",
    defaultSize: 1,
    lockSize: true,
    roles: () => ["Extract"],
    listDocs: listCookbookDocs,
    run: (model, docs, options) =>
      swarmExtractDocs(model, docs, {
        ...options,
        size: 1,
        reduce: "first",
        style: "search",
        roles: ["Extract"],
      }),
    format: formatSwarmDocs,
    formatLive: formatLiveDocs,
  },
  {
    id: "audit",
    title: "File audit",
    blurb: "Completeness, policy, and math review each file, then merge a verdict",
    defaultSize: AUDIT_ROLES.length,
    lockSize: true,
    roles: () => [...AUDIT_ROLES],
    listDocs: () => listCookbookDocs(AUDIT_DOCS_DIR),
    run: (model, docs, options) =>
      swarmExtractSchema(Audit, model, docs, {
        ...options,
        members: auditMembers(model),
        roles: AUDIT_ROLES,
        reduce: "merge",
      }),
    format: formatSwarmDocs,
    formatLive: formatLiveDocs,
  },
  {
    id: "vote",
    title: "Disputed payable",
    blurb: "Printed total vs rush scribble — agents vote",
    defaultSize: 3,
    roles: numberedRoles,
    listDocs: () => listCookbookDocs(VOTE_DOCS_DIR),
    run: (model, docs, options) =>
      swarmExtractDocs(model, docs, { ...options, reduce: "vote", style: "search", roles: numberedRoles(options.size) }),
    format: formatSwarmDocs,
    formatLive: formatLiveDocs,
  },
  {
    id: "recon",
    title: "Invoice math",
    blurb: "Search labeled totals, sum the lines, merge if they disagree",
    defaultSize: STYLE_ROLES.length,
    lockSize: true,
    roles: () => [...STYLE_ROLES],
    listDocs: listCookbookDocs,
    run: (model, docs, options) =>
      swarmExtractDocs(model, docs, {
        ...options,
        members: styleMembers(model),
        roles: STYLE_ROLES,
        reduce: "merge",
      }),
    format: formatSwarmDocs,
    formatLive: formatLiveDocs,
  },
];

export function cookbookModel(): string {
  return process.env.OPENEXTRACT_MODEL?.trim() || COOKBOOK_MODEL;
}

export function clampSwarmSize(value: number): number {
  if (!Number.isInteger(value)) return 2;
  return Math.min(MAX_COOKBOOK_SWARM_SIZE, Math.max(1, value));
}

export function togglePath(selected: readonly string[], path: string): string[] {
  return selected.includes(path) ? selected.filter((item) => item !== path) : [...selected, path];
}

export function docOptionLabel(path: string, selected: readonly string[]): string {
  return `${selected.includes(path) ? "●" : "○"} ${basename(path)}`;
}

export function hasGatewayKey(): boolean {
  return Boolean(process.env.AI_GATEWAY_API_KEY?.trim() || process.env.VERCEL_OIDC_TOKEN?.trim());
}

export interface CookbookModel {
  id: string;
  name: string;
  pricing?: { input: string; output: string };
}

const SKIP_MODEL_TYPES = new Set(["embedding", "image", "reranking", "speech", "transcription", "video"]);

export function languageModels(
  entries: ReadonlyArray<{
    id: string;
    name: string;
    modelType?: string | null;
    pricing?: { input: string; output: string } | null;
  }>,
): CookbookModel[] {
  return entries
    .filter((entry) => entry.modelType == null || !SKIP_MODEL_TYPES.has(entry.modelType))
    .map((entry) => ({
      id: entry.id,
      name: entry.name,
      ...(entry.pricing ? { pricing: { input: entry.pricing.input, output: entry.pricing.output } } : {}),
    }));
}

export function formatModelPricing(pricing: { input: string; output: string }): string {
  const input = Number(pricing.input) * 1e6;
  const output = Number(pricing.output) * 1e6;
  if (!Number.isFinite(input) || !Number.isFinite(output)) return "";
  const fmt = (n: number) => (n >= 1 ? n.toFixed(n % 1 === 0 ? 0 : 2) : n.toPrecision(2));
  return `$${fmt(input)} / $${fmt(output)} per 1M`;
}

export function modelSelectOption(model: CookbookModel): {
  name: string;
  description: string;
  value: string;
} {
  const price = model.pricing ? formatModelPricing(model.pricing) : "";
  return {
    name: model.name,
    description: price ? `${model.id}  ·  ${price}` : model.id,
    value: model.id,
  };
}

export function sortCookbookModels(models: readonly CookbookModel[]): CookbookModel[] {
  return [...models].sort((a, b) => {
    if (a.id === COOKBOOK_MODEL) return -1;
    if (b.id === COOKBOOK_MODEL) return 1;
    return a.id.localeCompare(b.id);
  });
}

export function pickCookbookModel(
  models: readonly CookbookModel[],
  preferred = cookbookModel(),
): string {
  if (models.some((model) => model.id === preferred)) return preferred;
  const fallback = models.find((model) => model.id === COOKBOOK_MODEL);
  return fallback?.id ?? models[0]?.id ?? COOKBOOK_MODEL;
}

export async function loadCookbookModels(): Promise<CookbookModel[]> {
  const fallback: CookbookModel[] = [{ id: cookbookModel(), name: cookbookModel() }];
  if (!hasGatewayKey()) return fallback;
  try {
    const { models } = await gateway.getAvailableModels();
    const list = sortCookbookModels(languageModels(models));
    return list.length > 0 ? list : fallback;
  } catch {
    return fallback;
  }
}
