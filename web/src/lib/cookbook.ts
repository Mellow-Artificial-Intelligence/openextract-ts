import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { generateText, Output, gateway } from "ai";
import { z } from "zod";
import {
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
  return allowed.has(name) && !name.includes("/") && !name.includes("\\") && !name.includes("..");
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

function reduceInvoices(invoices: Invoice[], mode: CookbookReduce): Invoice {
  const first = invoices[0];
  if (!first) throw new Error("Swarm produced no results.");
  if (invoices.length === 1 || mode === "first") return first;
  const field = <K extends keyof Invoice>(key: K): Invoice[K] => {
    const values = invoices.map((invoice) => invoice[key]);
    if (key === "lineItems" && mode === "merge") {
      const seen = new Set<string>();
      const items: Invoice["lineItems"] = [];
      for (const list of values as Invoice["lineItems"][]) {
        for (const item of list) {
          const id = `${item.description}:${item.amount}`;
          if (seen.has(id)) continue;
          seen.add(id);
          items.push(item);
        }
      }
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
  const seen = new Set<string>();
  const findings: Audit["findings"] = [];
  for (const audit of audits) {
    for (const finding of audit.findings) {
      const id = `${finding.perspective}:${finding.note}`;
      if (seen.has(id)) continue;
      seen.add(id);
      findings.push(finding);
    }
  }
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
  const audit = recipe.schema === "audit";
  for (const [index, source] of docs.entries()) {
    if (options.signal?.aborted) return;
    options.emit({ type: "doc", source, index, total: docs.length });
    const text = await readFile(join(DOCS_DIR, source), "utf8");
    const outputs: Array<CookbookOutput | undefined> = Array.from({ length: size });
    await Promise.all(
      Array.from({ length: size }, async (_, agentIndex) => {
        if (options.signal?.aborted) return;
        const role = roles[agentIndex] ?? `Agent ${agentIndex + 1}`;
        options.emit({ type: "agent-start", source, agentIndex, agentTotal: size, role });
        const started = Date.now();
        try {
          const output = audit
            ? await extractObject(
                options.model,
                text,
                instructionsFor(recipe, agentIndex, size),
                AuditSchema,
                "Audit",
                "Completeness, policy, and math findings with a verdict.",
                options.signal,
              )
            : await extractObject(
                options.model,
                text,
                instructionsFor(recipe, agentIndex, size),
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
            agentTotal: size,
            role,
            output,
            duration: Date.now() - started,
          });
        } catch (error) {
          if (options.signal?.aborted) return;
          options.emit({
            type: "agent",
            source,
            agentIndex,
            agentTotal: size,
            role,
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
      : reduceInvoices(ok as Invoice[], recipe.reduce);
    options.emit({ type: "result", source, output, reduce: recipe.reduce });
  }
  options.emit({ type: "done" });
}
