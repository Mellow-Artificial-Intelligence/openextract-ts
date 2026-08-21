import { hasGatewayAuth } from "@/lib/gateway";
import { parseCodingOptions } from "@/lib/harness";
import { DEFAULT_MODEL, isExtractModel, resolveMemberStyle } from "@/lib/models";
import { runExtractTable } from "@/lib/run-extract";
import { STYLES, type StyleName } from "@/lib/presets";
import { normalizeColumns } from "@/lib/table-schema";
import { start } from "workflow/api";
import { extractTableWorkflow } from "@/workflows/extract";

export const maxDuration = 300;

const STYLES_SET = new Set<string>(STYLES);
const MAX_QUERY_CHARS = 4_000;
const MAX_SOURCE_CHARS = 80_000;
const MAX_INSTRUCTIONS_CHARS = 4_000;

function asStyle(value: unknown): StyleName {
  return typeof value === "string" && STYLES_SET.has(value) ? (value as StyleName) : "direct";
}

function asFlag(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

export async function POST(req: Request) {
  if (!hasGatewayAuth()) {
    return Response.json(
      { error: "Set AI_GATEWAY_API_KEY in web/.env.local to run locally." },
      { status: 401 },
    );
  }

  const body = (await req.json()) as {
    query?: unknown;
    source?: unknown;
    files?: unknown;
    columns?: unknown;
    model?: unknown;
    style?: unknown;
    instructions?: unknown;
    workflow?: unknown;
    sandbox?: unknown;
    coding?: unknown;
  };

  const columns = normalizeColumns(body.columns);
  if (columns.length === 0) {
    return Response.json({ error: "A table schema is required" }, { status: 400 });
  }

  const query = typeof body.query === "string" ? body.query.trim().slice(0, MAX_QUERY_CHARS) : "";
  const source = typeof body.source === "string" ? body.source.slice(0, MAX_SOURCE_CHARS) : "";
  const files = Array.isArray(body.files) ? body.files : [];
  if (!query && !source.trim() && files.length === 0) {
    return Response.json({ error: "A source is required" }, { status: 400 });
  }

  const model = typeof body.model === "string" && isExtractModel(body.model) ? body.model : DEFAULT_MODEL;
  const instructions =
    typeof body.instructions === "string" ? body.instructions.slice(0, MAX_INSTRUCTIONS_CHARS) : undefined;
  const sandbox = asFlag(body.sandbox, true);
  const workflow = asFlag(body.workflow, true);
  const coding = parseCodingOptions(body.coding);
  let style: StyleName;
  try {
    style = resolveMemberStyle(model, asStyle(body.style), sandbox);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Invalid extract team." },
      { status: 400 },
    );
  }

  const input = { query, source, files, columns, model, style, instructions, coding };

  if (!workflow) {
    try {
      const output = await runExtractTable(input);
      return Response.json(output);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Extraction failed";
      return Response.json({ error: message }, { status: 500 });
    }
  }

  const run = await start(extractTableWorkflow, [input]);
  try {
    const output = await run.returnValue;
    return Response.json(output, {
      headers: { "x-workflow-run-id": run.runId },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Extraction failed";
    return Response.json({ error: message, runId: run.runId }, { status: 500 });
  }
}
