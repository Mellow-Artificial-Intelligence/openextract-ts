import {
  COOKBOOK_DOCS,
  COOKBOOK_RECIPES,
  type CookbookModel,
  type CookbookReduce,
  type CookbookSchema,
} from "./cookbook-catalog";
import {
  composeExtractModel,
  extractCodingOptions,
  parseCodingOptions,
  specForModel,
  type AgentSpec,
  type CodingOptions,
} from "./harness";
import { DEFAULT_MODEL, MAX_SWARM_AGENTS, MODELS, isCodingAgentId, isExtractModel } from "./models";
import { GATEWAY_STYLES, type GatewayStyle } from "./presets";

const PAYABLE =
  "Extract one payable record from this vendor invoice: vendor, invoice number, currency, line items, and the labeled total. Do not invent fields.";
const AUDIT =
  "Audit this file for a finance or legal reviewer. Fill subject, amount, currency, verdict, and findings. Do not invent missing approvals.";

export interface SystemAgent extends AgentSpec {
  role: string;
  style: GatewayStyle;
  instructions: string;
}

export interface ExtractionSystem {
  starterId: string;
  name: string;
  schema: CookbookSchema;
  reduce: CookbookReduce;
  sandbox: boolean;
  docs: string[];
  agents: SystemAgent[];
}

export interface SystemStarter {
  id: string;
  name: string;
  blurb: string;
}

const STYLES = new Set<string>(GATEWAY_STYLES);
const REDUCES = new Set<CookbookReduce>(["merge", "vote", "first"]);

function agent(role: string, instructions: string, style: GatewayStyle = "direct", model: string = DEFAULT_MODEL): SystemAgent {
  return { ...specForModel(model), role, style, instructions };
}

function fromRecipe(
  id: string,
  agents: SystemAgent[],
): ExtractionSystem {
  const recipe = COOKBOOK_RECIPES.find((item) => item.id === id);
  if (!recipe) throw new Error(`Unknown system '${id}'.`);
  return {
    starterId: recipe.id,
    name: recipe.title,
    schema: recipe.schema,
    reduce: recipe.reduce,
    sandbox: true,
    docs: [...recipe.docs],
    agents,
  };
}

export const SYSTEM_STARTERS: SystemStarter[] = [
  { id: "ap-inbox", name: "AP inbox", blurb: "One payable specialist per invoice" },
  { id: "audit", name: "File audit", blurb: "Completeness, policy, and math on each file" },
  { id: "vote", name: "Disputed payable", blurb: "Several extractors vote on a messy invoice" },
  { id: "recon", name: "Invoice math", blurb: "Search labeled totals, then sum in code" },
  { id: "custom", name: "Blank", blurb: "Compose gateway models and coding agents" },
];

export function systemFromStarter(id: string): ExtractionSystem {
  if (id === "audit") {
    return fromRecipe("audit", [
      agent("Completeness", `${AUDIT} You are the completeness auditor. Flag missing dates, POs, signatures, receipts, and blank sections.`),
      agent("Policy", `${AUDIT} You are the policy auditor. Flag spend limits, gifts, rush fees, liability, data residency, and stated policy breaks.`),
      agent("Math", `${AUDIT} You are the math auditor. Sum line items and compare to the labeled total. Flag tax or duplicate amounts.`, "code"),
    ]);
  }
  if (id === "vote") {
    return fromRecipe("vote", [
      agent("Extractor 1", `${PAYABLE}\n\nYou are extraction agent 1 of 3. Work independently. Prefer the labeled payable total if figures conflict.`),
      agent("Extractor 2", `${PAYABLE}\n\nYou are extraction agent 2 of 3. Work independently. Prefer the labeled payable total if figures conflict.`),
      agent("Extractor 3", `${PAYABLE}\n\nYou are extraction agent 3 of 3. Work independently. Prefer the labeled payable total if figures conflict.`),
    ]);
  }
  if (id === "recon") {
    return fromRecipe("recon", [
      agent("Search", `${PAYABLE} Search the text for labeled fields and the printed total.`, "search"),
      agent("Code", `${PAYABLE} Parse amounts as if summing JavaScript over the document string. Prefer the arithmetic total if it disagrees with a label.`, "code"),
    ]);
  }
  if (id === "custom") {
    return {
      starterId: "custom",
      name: "Custom system",
      schema: "invoice",
      reduce: "merge",
      sandbox: true,
      docs: [...(COOKBOOK_RECIPES[0]?.docs ?? COOKBOOK_DOCS)],
      agents: [agent("Extract", PAYABLE)],
    };
  }
  return fromRecipe("ap-inbox", [agent("Extract", PAYABLE)]);
}

export function setAgentModel(current: SystemAgent, id: string): SystemAgent {
  const next = specForModel(id, current);
  return { ...current, ...next, style: next.coding ? current.style : current.style };
}

export function addSystemAgent(system: ExtractionSystem, pool: readonly { id: string }[] = MODELS): ExtractionSystem {
  if (system.agents.length >= MAX_SWARM_AGENTS) return system;
  const used = new Set(system.agents.map((item) => item.id));
  const unused = pool.find((item) => !used.has(item.id));
  const id = unused?.id ?? DEFAULT_MODEL;
  return {
    ...system,
    starterId: "custom",
    agents: [...system.agents, agent(`Specialist ${system.agents.length + 1}`, PAYABLE, "direct", id)],
  };
}

export function removeSystemAgent(system: ExtractionSystem, index: number): ExtractionSystem {
  if (system.agents.length <= 1) return system;
  return {
    ...system,
    starterId: "custom",
    agents: system.agents.filter((_, i) => i !== index),
  };
}

export function replaceSystemAgent(system: ExtractionSystem, index: number, next: SystemAgent): ExtractionSystem {
  return {
    ...system,
    starterId: "custom",
    agents: system.agents.map((item, i) => (i === index ? next : item)),
  };
}

export function dropCodingAgents(system: ExtractionSystem): ExtractionSystem {
  return {
    ...system,
    sandbox: false,
    agents: system.agents.map((item) => (isCodingAgentId(item.id) ? agent(item.role, item.instructions, item.style) : item)),
  };
}

export function agentModelPool(gateway: readonly CookbookModel[], sandbox: boolean): CookbookModel[] {
  const harness = MODELS.filter((model) => isCodingAgentId(model.id)).map((model) => ({
    id: model.id,
    name: model.name,
    provider: model.provider,
  }));
  const rest = gateway.filter((model) => !isCodingAgentId(model.id));
  const seen = new Set<string>();
  const out: CookbookModel[] = [];
  for (const model of sandbox ? [...rest, ...harness] : rest) {
    if (seen.has(model.id)) continue;
    seen.add(model.id);
    out.push(model);
  }
  return out.length ? out : FALLBACK_POOL(sandbox);
}

function FALLBACK_POOL(sandbox: boolean): CookbookModel[] {
  return MODELS.filter((model) => sandbox || !isCodingAgentId(model.id)).map((model) => ({
    id: model.id,
    name: model.name,
    provider: model.provider,
  }));
}

export interface RunnableAgent {
  role: string;
  model: string;
  style: GatewayStyle;
  instructions: string;
  coding?: CodingOptions;
}

export interface RunnableSystem {
  schema: CookbookSchema;
  reduce: CookbookReduce;
  sandbox: boolean;
  docs: string[];
  agents: RunnableAgent[];
}

export function toRunnable(system: ExtractionSystem): RunnableSystem {
  return {
    schema: system.schema,
    reduce: system.reduce,
    sandbox: system.sandbox,
    docs: system.docs,
    agents: system.agents.map((item) => ({
      role: item.role.trim() || "Specialist",
      model: composeExtractModel(item),
      style: item.style,
      instructions: item.instructions,
      coding: extractCodingOptions(item),
    })),
  };
}

function asStyle(value: unknown): GatewayStyle {
  return typeof value === "string" && STYLES.has(value) ? (value as GatewayStyle) : "direct";
}

function asReduce(value: unknown): CookbookReduce {
  return typeof value === "string" && REDUCES.has(value as CookbookReduce) ? (value as CookbookReduce) : "merge";
}

function asSchema(value: unknown): CookbookSchema {
  return value === "audit" ? "audit" : "invoice";
}

export function parseRunnableSystem(value: unknown): RunnableSystem | string {
  if (!value || typeof value !== "object") return "A system is required.";
  const rec = value as Record<string, unknown>;
  const sandbox = rec.sandbox !== false;
  const docs = Array.isArray(rec.docs)
    ? rec.docs.filter((item): item is string => typeof item === "string" && COOKBOOK_DOCS.includes(item))
    : [];
  if (docs.length === 0) return "Select at least one document.";
  const rawAgents = Array.isArray(rec.agents) ? rec.agents : [];
  const agents: RunnableAgent[] = [];
  for (const item of rawAgents.slice(0, MAX_SWARM_AGENTS)) {
    if (!item || typeof item !== "object") continue;
    const agentRec = item as Record<string, unknown>;
    const model = typeof agentRec.model === "string" ? agentRec.model.trim() : "";
    if (!model || model.length > 200) continue;
    if (!isExtractModel(model) && !/^[\w.-]+\/[\w./-]+$/.test(model)) continue;
    if (isCodingAgentId(model) && !sandbox) return "Turn on Sandboxes to use Claude Code or Codex.";
    const role = typeof agentRec.role === "string" ? agentRec.role.trim().slice(0, 40) : "Specialist";
    const instructions = typeof agentRec.instructions === "string" ? agentRec.instructions.slice(0, 4_000) : PAYABLE;
    agents.push({
      role: role || "Specialist",
      model,
      style: asStyle(agentRec.style),
      instructions,
      coding: parseCodingOptions(agentRec.coding),
    });
  }
  if (agents.length === 0) return "Add at least one agent.";
  return { schema: asSchema(rec.schema), reduce: asReduce(rec.reduce), sandbox, docs, agents };
}
