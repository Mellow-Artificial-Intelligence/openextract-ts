import { existsSync, readFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { z } from "zod";
import {
  extractSwarmWithResults,
  type ExtractionResult,
  type ExtractOptions,
  type LanguageModel,
  type SwarmMember,
  type SwarmReduce,
  type SwarmResult,
} from "../../../src/index.js";

export const COOKBOOK_MODEL = "xai/grok-4.6";

export const Invoice = z.object({
  vendor: z.string(),
  invoiceNumber: z.string(),
  total: z.number(),
  currency: z.string(),
  lineItems: z.array(
    z.object({
      description: z.string(),
      amount: z.number(),
    }),
  ),
});

export type Invoice = z.infer<typeof Invoice>;

export const DOCS_DIR = join(dirname(fileURLToPath(import.meta.url)), "docs");

const INSTRUCTIONS =
  "Extract one payable record from this vendor invoice: vendor, invoice number, currency, line items, and the labeled total. Do not invent fields.";

export const AUDIT_ROLES = ["Completeness", "Policy", "Math"] as const;
export const STYLE_ROLES = ["Search", "Code"] as const;

export const Audit = z.object({
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

export type Audit = z.infer<typeof Audit>;
export type CookbookValue = Invoice | Audit;

export function isAudit(value: CookbookValue): value is Audit {
  return "verdict" in value && "findings" in value;
}

export function numberedRoles(size: number): string[] {
  return Array.from({ length: size }, (_, index) => `Agent ${index + 1}`);
}

export function auditMembers(model: LanguageModel): SwarmMember[] {
  return [
    {
      model,
      style: "search",
      instructions:
        "You are the completeness auditor. Flag missing dates, POs, signatures, receipts, blank sections, and unsigned approvals. Verdict fail if a required signature is missing, review if supporting documents are incomplete, pass if the packet is complete. Still fill subject, amount, and currency when present.",
    },
    {
      model,
      style: "search",
      instructions:
        "You are the policy auditor. Flag spend limits, gift rules, rush fees, liability caps, data residency, and stated policy breaches. Verdict fail on a hard policy break, review on a judgment call, pass if policy holds. Still fill subject, amount, and currency when present.",
    },
    {
      model,
      style: "search",
      instructions:
        "You are the math auditor. Sum line items, compare to the labeled total, and flag tax or duplicate amounts. Verdict fail if the labeled total is wrong, review if figures are ambiguous, pass if the math holds. Still fill subject and findings.",
    },
  ];
}

export function styleMembers(model: LanguageModel): SwarmMember[] {
  return [
    {
      model,
      style: "search",
      instructions: `${INSTRUCTIONS} Search the text for labeled fields.`,
    },
    {
      model,
      style: "code",
      instructions: `${INSTRUCTIONS} Use JavaScript over the document string to parse amounts and line items.`,
    },
  ];
}

export type CookbookAgentEvent = {
  source: string;
  docIndex: number;
  docTotal: number;
  agentIndex: number;
  agentTotal: number;
  role: string;
};

export async function listCookbookDocs(dir = DOCS_DIR): Promise<string[]> {
  const names = await readdir(dir);
  return names
    .filter((name) => name.endsWith(".txt"))
    .sort()
    .map((name) => join(dir, name));
}

export async function swarmExtractSchema<T>(
  schema: z.ZodType<T>,
  model: LanguageModel,
  docs: readonly string[],
  options: {
    size?: number;
    members?: readonly SwarmMember[];
    reduce?: SwarmReduce;
    style?: ExtractOptions["style"];
    instructions?: string;
    maxConcurrency?: number;
    roles?: readonly string[];
    onDoc?: (source: string, index: number, total: number) => void;
    onAgentStart?: (event: CookbookAgentEvent) => void;
    onAgent?: (event: CookbookAgentEvent & { result: ExtractionResult<T> | Error }) => void;
    onResult?: (results: Array<{ source: string } & SwarmResult<T>>) => void;
  } = {},
): Promise<Array<{ source: string } & SwarmResult<T>>> {
  const members = options.members ? [...options.members] : undefined;
  const size = members?.length ?? options.size ?? 2;
  const roles = options.roles ?? numberedRoles(size);
  const results: Array<{ source: string } & SwarmResult<T>> = [];
  for (const [index, source] of docs.entries()) {
    options.onDoc?.(source, index, docs.length);
    const swarm = await extractSwarmWithResults(schema, members ?? model, source, {
      ...(members ? {} : { size }),
      reduce: options.reduce ?? "merge",
      style: options.style ?? "search",
      maxConcurrency: options.maxConcurrency ?? size,
      instructions: options.instructions ?? INSTRUCTIONS,
      onAgentStart: ({ index: agentIndex, total }) => {
        options.onAgentStart?.({
          source,
          docIndex: index,
          docTotal: docs.length,
          agentIndex,
          agentTotal: total,
          role: roles[agentIndex] ?? `Agent ${agentIndex + 1}`,
        });
      },
      onAgent: ({ index: agentIndex, total, result }) => {
        options.onAgent?.({
          source,
          docIndex: index,
          docTotal: docs.length,
          agentIndex,
          agentTotal: total,
          role: roles[agentIndex] ?? `Agent ${agentIndex + 1}`,
          result: result as ExtractionResult<T> | Error,
        });
      },
    });
    results.push({ source, ...swarm });
    options.onResult?.(results);
  }
  return results;
}

export async function swarmExtractDocs(
  model: LanguageModel,
  docs: readonly string[],
  options: Parameters<typeof swarmExtractSchema<Invoice>>[3] = {},
): Promise<Array<{ source: string } & SwarmResult<Invoice>>> {
  return swarmExtractSchema(Invoice, model, docs, options);
}

function formatAgentSlot(item: ExtractionResult<CookbookValue> | Error | undefined) {
  if (item == null) return null;
  if (item instanceof Error) return { error: item.message };
  return item.output;
}

export function formatSwarmDocs(results: Array<{ source: string } & SwarmResult<CookbookValue>>) {
  return results.map(({ source, output, usage, agents, reduce }) => ({
    source: basename(source),
    output,
    usage,
    reduce,
    agents: agents.length,
    failed: agents.filter((item) => item instanceof Error).length,
  }));
}

export function formatLiveDocs(
  done: Array<{ source: string } & SwarmResult<CookbookValue>>,
  pending?: {
    source: string;
    agents: Array<ExtractionResult<CookbookValue> | Error | undefined>;
  },
) {
  const rows: unknown[] = [...formatSwarmDocs(done)];
  if (!pending) return rows;
  rows.push({
    source: basename(pending.source),
    status: "running",
    agents: pending.agents.map(formatAgentSlot),
  });
  return rows;
}

export function applyEnvText(text: string, env: NodeJS.ProcessEnv = process.env): void {
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    if (!key || env[key] != null) continue;
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
}

export function loadRepoEnv(): void {
  const envPath = join(dirname(fileURLToPath(import.meta.url)), "../../../.env");
  if (existsSync(envPath)) applyEnvText(readFileSync(envPath, "utf8"));
}

async function main() {
  loadRepoEnv();
  if (!process.env.AI_GATEWAY_API_KEY) {
    console.error(
      "Missing AI_GATEWAY_API_KEY. Create a key, then put it in .env:\n" +
        "  vercel ai-gateway api-keys create --name openextract-local --scope mellow-ai\n" +
        "  echo 'AI_GATEWAY_API_KEY=…' > .env",
    );
    process.exit(1);
  }
  const size = Number(process.env.OPENEXTRACT_SWARM_SIZE ?? 2);
  const model = process.env.OPENEXTRACT_MODEL ?? COOKBOOK_MODEL;
  const docs = await listCookbookDocs();
  if (docs.length === 0) {
    console.error(`No .txt invoices in ${DOCS_DIR}`);
    process.exit(1);
  }
  const results = await swarmExtractDocs(model, docs, { size });
  console.log(JSON.stringify(formatSwarmDocs(results), null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await main();
}
