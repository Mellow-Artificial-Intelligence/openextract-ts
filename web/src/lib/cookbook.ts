import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { generateText, Output, gateway } from "ai";
import { z } from "zod";
import { type RunnableAgent, type RunnableSystem } from "@/lib/agent-system";
import {
  COOKBOOK_DOCS,
  COOKBOOK_RECIPES,
  FALLBACK_COOKBOOK_MODELS,
  clampCookbookSize,
  cookbookRoles,
  type Audit,
  type CookbookEvent,
  type CookbookModel,
  type CookbookOutput,
  type CookbookRecipeMeta,
  type CookbookReduce,
  type Invoice,
} from "@/lib/cookbook-catalog";
import { isCodingAgentId } from "@/lib/models";
import { STYLE_DETAILS } from "@/lib/presets";
import { extractWithCodingAgent } from "@/workflows/extract-sandbox";

export {
  COOKBOOK_RECIPES,
  clampCookbookSize,
  cookbookRoles,
  pickCookbookModel,
  type CookbookEvent,
  type CookbookModel,
  type CookbookRecipeMeta,
} from "@/lib/cookbook-catalog";

const InvoiceSchema = z.object({
  vendor: z.string(),
  invoiceNumber: z.string(),
  total: z.number(),
  currency: z.string(),
  lineItems: z.array(z.object({ description: z.string(), amount: z.number() })),
});

const AuditSchema = z.object({
  subject: z.string(),
  verdict: z.enum(["pass", "review", "fail"]),
  amount: z.number(),
  currency: z.string(),
  findings: z.array(
    z.object({
      perspective: z.string(),
      severity: z.enum(["ok", "warn", "block"]),
      note: z.string(),
    }),
  ),
});

const DOCS_DIR = join(process.cwd(), "src/cookbook/docs");
const COOKBOOK_DOC_NAMES = new Set(COOKBOOK_DOCS);
const PAYABLE =
  "Extract one payable record from this vendor invoice: vendor, invoice number, currency, line items, and the labeled total. Do not invent fields.";
const AUDIT =
  "Audit this file for a finance or legal reviewer. Fill subject, amount, currency, verdict, and findings. Do not invent missing approvals.";

const AUDIT_INSTRUCTIONS = [
  `${AUDIT} You are the completeness auditor. Flag missing dates, POs, signatures, receipts, and blank sections.`,
  `${AUDIT} You are the policy auditor. Flag spend limits, gifts, rush fees, liability, data residency, and stated policy breaks.`,
  `${AUDIT} You are the math auditor. Sum line items and compare to the labeled total. Flag tax or duplicate amounts.`,
];

const RECON_INSTRUCTIONS = [
  `${PAYABLE} Search the text for labeled fields and the printed total.`,
  `${PAYABLE} Parse amounts as if summing JavaScript over the document string. Prefer the arithmetic total if it disagrees with a label.`,
];

export async function listCookbookModels(): Promise<CookbookModel[]> {
  try {
    const { models } = await gateway.getAvailableModels();
    const list = models
      .filter((model) => model.modelType == null || model.modelType === "language")
      .map((model) => ({
        id: model.id,
        name: model.name,
        provider: model.id.split("/")[0] ?? "unknown",
      }));
    return list.length > 0 ? list : FALLBACK_COOKBOOK_MODELS;
  } catch {
    return FALLBACK_COOKBOOK_MODELS;
  }
}

function instructionsFor(recipe: CookbookRecipeMeta, index: number, size: number): string {
  if (recipe.id === "audit") return AUDIT_INSTRUCTIONS[index] ?? AUDIT;
  if (recipe.id === "recon") return RECON_INSTRUCTIONS[index] ?? PAYABLE;
  if (recipe.id === "ap-inbox") return PAYABLE;
  return `${PAYABLE}\n\nYou are extraction agent ${index + 1} of ${size}. Work independently. Prefer the labeled payable total if figures conflict.`;
}

function isFixture(name: string, allowed: ReadonlySet<string>): boolean {
  return allowed.has(name) && isCookbookDoc(name);
}

export function isCookbookDoc(name: string): boolean {
  return COOKBOOK_DOC_NAMES.has(name) && !name.includes("/") && !name.includes("\\") && !name.includes("..");
}

export async function readCookbookDoc(name: string): Promise<string | null> {
  if (!isCookbookDoc(name)) return null;
  try {
    return await readFile(join(DOCS_DIR, name), "utf8");
  } catch {
    return null;
  }
}

function majority<T>(values: T[]): T {
  const counts = new Map<string, { n: number; value: T }>();
  for (const value of values) {
    if (value == null || value === "") continue;
    const id = JSON.stringify(value);
    const entry = counts.get(id) ?? { n: 0, value };
    entry.n += 1;
    counts.set(id, entry);
  }
  let best: { n: number; value: T } | undefined;
  for (const entry of counts.values()) {
    if (!best || entry.n > best.n) best = entry;
  }
  return (best?.value ?? values[0]) as T;
}

/** Flattens lists and keeps the first item for each key. */
function dedupeBy<T>(lists: readonly T[][], keyOf: (item: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const list of lists) {
    for (const item of list) {
      const key = keyOf(item);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(item);
    }
  }
  return out;
}

function reduceInvoices(invoices: Invoice[], mode: CookbookReduce): Invoice {
  const first = invoices[0];
  if (!first) throw new Error("Swarm produced no results.");
  if (invoices.length === 1 || mode === "first") return first;
  const field = <K extends keyof Invoice>(key: K): Invoice[K] => {
    const values = invoices.map((invoice) => invoice[key]);
    if (key === "lineItems" && mode === "merge") {
      const items = dedupeBy(
        values as Invoice["lineItems"][],
        (item) => `${item.description}:${item.amount}`,
      );
      return items as Invoice[K];
    }
    return majority(values);
  };
  return {
    vendor: field("vendor"),
    invoiceNumber: field("invoiceNumber"),
    total: field("total"),
    currency: field("currency"),
    lineItems: field("lineItems"),
  };
}

function reduceAudits(audits: Audit[]): Audit {
  const first = audits[0];
  if (!first) throw new Error("Swarm produced no results.");
  if (audits.length === 1) return first;
  const rank = { pass: 0, review: 1, fail: 2 } as const;
  let verdict: Audit["verdict"] = "pass";
  for (const audit of audits) {
    if (rank[audit.verdict] > rank[verdict]) verdict = audit.verdict;
  }
  const findings = dedupeBy(
    audits.map((audit) => audit.findings),
    (finding) => `${finding.note.trim().toLowerCase()}:${finding.severity}`,
  );
  return {
    subject: majority(audits.map((item) => item.subject)),
    verdict,
    amount: majority(audits.map((item) => item.amount)),
    currency: majority(audits.map((item) => item.currency)),
    findings,
  };
}

async function extractObject<T>(
  model: string,
  text: string,
  system: string,
  schema: z.ZodType<T>,
  name: string,
  description: string,
  abortSignal?: AbortSignal,
): Promise<T> {
  const result = await generateText({
    model,
    abortSignal,
    output: Output.object({ name, description, schema }),
    system,
    prompt: `Read this document and return the structured result:\n\n${text}`,
  });
  if (!result.output) throw new Error("Empty extract");
  return result.output;
}

function agentSystemPrompt(agent: RunnableAgent): string {
  return [
    agent.instructions,
    `Extraction style: ${agent.style}. ${STYLE_DETAILS[agent.style].description}`,
  ].join("\n\n");
}

async function extractAgent<T>(
  agent: RunnableAgent,
  text: string,
  schema: z.ZodType<T>,
  name: string,
  description: string,
  signal?: AbortSignal,
): Promise<T> {
  const system = agentSystemPrompt(agent);
  if (isCodingAgentId(agent.model)) {
    return extractWithCodingAgent({
      model: agent.model,
      prompt: text,
      system,
      text,
      files: [],
      schema,
      coding: agent.coding,
    });
  }
  return extractObject(agent.model, text, system, schema, name, description, signal);
}

export async function runExtractionSystem(options: {
  system: RunnableSystem;
  emit: (event: CookbookEvent) => void;
  signal?: AbortSignal;
}): Promise<void> {
  const docs = options.system.docs.filter((name) => isCookbookDoc(name));
  if (docs.length === 0) throw new Error("Select at least one document.");
  const agents = options.system.agents;
  if (agents.length === 0) throw new Error("Add at least one agent.");
  const audit = options.system.schema === "audit";
  for (const [index, source] of docs.entries()) {
    if (options.signal?.aborted) return;
    options.emit({ type: "doc", source, index, total: docs.length });
    const text = await readFile(join(DOCS_DIR, source), "utf8");
    const outputs: Array<CookbookOutput | undefined> = Array.from({ length: agents.length });
    await Promise.all(
      agents.map(async (agent, agentIndex) => {
        if (options.signal?.aborted) return;
        options.emit({
          type: "agent-start",
          source,
          agentIndex,
          agentTotal: agents.length,
          role: agent.role,
        });
        const started = Date.now();
        try {
          const output = audit
            ? await extractAgent(
                agent,
                text,
                AuditSchema,
                "Audit",
                "Completeness, policy, and math findings with a verdict.",
                options.signal,
              )
            : await extractAgent(
                agent,
                text,
                InvoiceSchema,
                "Invoice",
                "Vendor, invoice number, currency, line items, and labeled total.",
                options.signal,
              );
          outputs[agentIndex] = output;
          options.emit({
            type: "agent",
            source,
            agentIndex,
            agentTotal: agents.length,
            role: agent.role,
            output,
            duration: Date.now() - started,
          });
        } catch (error) {
          if (options.signal?.aborted) return;
          options.emit({
            type: "agent",
            source,
            agentIndex,
            agentTotal: agents.length,
            role: agent.role,
            error: error instanceof Error ? error.message : "Agent failed",
            duration: Date.now() - started,
          });
        }
      }),
    );
    if (options.signal?.aborted) return;
    const ok = outputs.filter((item): item is CookbookOutput => item != null);
    if (ok.length === 0) throw new Error(`Every agent failed on ${source}.`);
    const output = audit
      ? reduceAudits(ok as Audit[])
      : reduceInvoices(ok as Invoice[], options.system.reduce);
    options.emit({ type: "result", source, output, reduce: options.system.reduce });
  }
  options.emit({ type: "done" });
}

export async function runCookbook(options: {
  recipeId: string;
  model: string;
  docs: readonly string[];
  size: number;
  emit: (event: CookbookEvent) => void;
  signal?: AbortSignal;
}): Promise<void> {
  const recipe = COOKBOOK_RECIPES.find((item) => item.id === options.recipeId);
  if (!recipe || recipe.kind !== "swarm") throw new Error("Unknown recipe.");
  const allowed = new Set(recipe.docs);
  const docs = options.docs.filter((name) => isFixture(name, allowed));
  if (docs.length === 0) throw new Error("Select at least one document.");
  const size = clampCookbookSize(recipe, options.size);
  const roles = cookbookRoles(recipe, size);
  const agents: RunnableAgent[] = Array.from({ length: size }, (_, agentIndex) => ({
    role: roles[agentIndex] ?? `Agent ${agentIndex + 1}`,
    model: options.model,
    style: "direct",
    instructions: instructionsFor(recipe, agentIndex, size),
  }));
  await runExtractionSystem({
    system: { schema: recipe.schema, reduce: recipe.reduce, sandbox: false, docs, agents },
    emit: options.emit,
    signal: options.signal,
  });
}
