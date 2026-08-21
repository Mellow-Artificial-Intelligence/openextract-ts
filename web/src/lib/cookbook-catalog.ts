import { DEFAULT_MODEL, GATEWAY_MODELS, MODELS } from "./models";

export interface Invoice {
  vendor: string;
  invoiceNumber: string;
  total: number;
  currency: string;
  lineItems: Array<{ description: string; amount: number }>;
}

export interface AuditFinding {
  perspective: string;
  severity: "ok" | "warn" | "block";
  note: string;
}

export interface Audit {
  subject: string;
  verdict: "pass" | "review" | "fail";
  amount: number;
  currency: string;
  findings: AuditFinding[];
}

export type CookbookOutput = Invoice | Audit;

export function isAudit(value: CookbookOutput): value is Audit {
  return "verdict" in value && "findings" in value;
}

export type CookbookReduce = "merge" | "vote" | "first";

export type CookbookRecipeKind = "swarm";

export type CookbookSchema = "invoice" | "audit";

export interface CookbookRecipeMeta {
  id: string;
  kind: CookbookRecipeKind;
  title: string;
  blurb: string;
  defaultSize: number;
  lockSize: boolean;
  roles: string[];
  docs: string[];
  reduce: CookbookReduce;
  schema: CookbookSchema;
}

const INVOICE_DOCS = ["acme-invoice.txt", "globex-invoice.txt", "initech-invoice.txt"] as const;
const AUDIT_DOCS = ["acme-invoice.txt", "northwind-expense.txt", "umbrella-msa.txt"] as const;

export const COOKBOOK_DOCS = [...new Set([...INVOICE_DOCS, ...AUDIT_DOCS, "contoso-invoice.txt"])];

export const COOKBOOK_RECIPES: CookbookRecipeMeta[] = [
  {
    id: "ap-inbox",
    kind: "swarm",
    title: "AP inbox",
    blurb: "A folder of vendor invoices — one payable record each",
    defaultSize: 1,
    lockSize: true,
    roles: ["Extract"],
    docs: [...INVOICE_DOCS],
    reduce: "first",
    schema: "invoice",
  },
  {
    id: "audit",
    kind: "swarm",
    title: "File audit",
    blurb: "Completeness, policy, and math review each file, then merge a verdict",
    defaultSize: 3,
    lockSize: true,
    roles: ["Completeness", "Policy", "Math"],
    docs: [...AUDIT_DOCS],
    reduce: "merge",
    schema: "audit",
  },
  {
    id: "vote",
    kind: "swarm",
    title: "Disputed payable",
    blurb: "Printed total vs rush scribble — agents vote",
    defaultSize: 3,
    lockSize: false,
    roles: [],
    docs: ["contoso-invoice.txt"],
    reduce: "vote",
    schema: "invoice",
  },
  {
    id: "recon",
    kind: "swarm",
    title: "Invoice math",
    blurb: "Search labeled totals, sum the lines, merge if they disagree",
    defaultSize: 2,
    lockSize: true,
    roles: ["Search", "Code"],
    docs: [...INVOICE_DOCS],
    reduce: "merge",
    schema: "invoice",
  },
];

export interface CookbookModel {
  id: string;
  name: string;
  provider: string;
}

export const FALLBACK_COOKBOOK_MODELS: CookbookModel[] = MODELS.map((model) => ({
  id: model.id,
  name: model.name,
  provider: model.provider,
}));

export function cookbookRoles(recipe: CookbookRecipeMeta, size: number): string[] {
  if (recipe.roles.length > 0) return recipe.roles;
  return Array.from({ length: size }, (_, index) => `Agent ${index + 1}`);
}

export function clampCookbookSize(recipe: CookbookRecipeMeta, value: number): number {
  if (recipe.lockSize) return recipe.defaultSize;
  if (!Number.isInteger(value)) return recipe.defaultSize;
  return Math.min(8, Math.max(1, value));
}

export function pickCookbookModel(models: readonly CookbookModel[], preferred?: string): string {
  if (preferred && models.some((model) => model.id === preferred)) return preferred;
  const served = new Set(models.map((model) => model.id));
  return GATEWAY_MODELS.find((model) => served.has(model.id))?.id ?? DEFAULT_MODEL;
}

export function formatCookbookElapsed(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function displayReduce(reduce: CookbookReduce): string {
  return reduce === "first" ? "each" : reduce;
}

export function outputHeading(output: CookbookOutput): string {
  return isAudit(output) ? output.subject : output.vendor;
}

export function outputSubheading(output: CookbookOutput): string {
  return isAudit(output) ? output.verdict : output.invoiceNumber;
}

export function outputAmount(output: CookbookOutput): string {
  const amount = isAudit(output) ? output.amount : output.total;
  const currency = output.currency;
  return `${amount.toFixed(2)} ${currency}`;
}

export const formatInvoiceMoney = outputAmount;

export function outputLines(output: CookbookOutput): Array<{ left: string; right: string }> {
  if (isAudit(output)) {
    return output.findings.map((item) => ({ left: item.note, right: item.severity }));
  }
  return output.lineItems.map((item) => ({ left: item.description, right: item.amount.toFixed(2) }));
}

export function summarizeOutput(output: CookbookOutput): string {
  if (isAudit(output)) {
    const first = output.findings[0]?.note;
    return first ? `${output.verdict}  ${first}` : output.verdict;
  }
  return `${output.vendor}  ${output.invoiceNumber}  ${outputAmount(output)}`;
}

export const summarizeInvoice = summarizeOutput;

export type CookbookEvent =
  | { type: "doc"; source: string; index: number; total: number }
  | { type: "agent-start"; source: string; agentIndex: number; agentTotal: number; role: string }
  | {
      type: "agent";
      source: string;
      agentIndex: number;
      agentTotal: number;
      role: string;
      output?: CookbookOutput;
      error?: string;
      duration: number;
    }
  | { type: "result"; source: string; output: CookbookOutput; reduce: CookbookReduce }
  | { type: "error"; message: string }
  | { type: "done" };
