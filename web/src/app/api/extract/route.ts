import { createTextStreamResponse, Output, streamText, toTextStream } from "ai";
import { hasGatewayAuth } from "@/lib/gateway";
import { DEFAULT_MODEL, isModelId } from "@/lib/models";
import { STYLES, type StyleName } from "@/lib/presets";
import { filesToParts } from "@/lib/source-files";
import { extractUserPrompt, extractionSystemPrompt } from "@/lib/system-prompt";
import { extractOutputSchema, normalizeColumns } from "@/lib/table-schema";

export const maxDuration = 120;

const STYLES_SET = new Set<string>(STYLES);
const MAX_QUERY_CHARS = 4_000;
const MAX_SOURCE_CHARS = 80_000;
const MAX_INSTRUCTIONS_CHARS = 4_000;

function asStyle(value: unknown): StyleName {
  return typeof value === "string" && STYLES_SET.has(value) ? (value as StyleName) : "direct";
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
  };

  const columns = normalizeColumns(body.columns);
  if (columns.length === 0) {
    return Response.json({ error: "A table schema is required" }, { status: 400 });
  }

  const query = typeof body.query === "string" ? body.query.trim().slice(0, MAX_QUERY_CHARS) : "";
  const source = typeof body.source === "string" ? body.source.slice(0, MAX_SOURCE_CHARS) : "";
  const fileParts = filesToParts(body.files);
  if (!query && !source.trim() && fileParts.length === 0) {
    return Response.json({ error: "A source is required" }, { status: 400 });
  }

  const model = typeof body.model === "string" && isModelId(body.model) ? body.model : DEFAULT_MODEL;
  const instructions =
    typeof body.instructions === "string" ? body.instructions.slice(0, MAX_INSTRUCTIONS_CHARS) : undefined;

  const result = streamText({
    model,
    output: Output.object({
      name: "ExtractedRows",
      description: "Rows that fill the table columns.",
      schema: extractOutputSchema(columns),
    }),
    system: extractionSystemPrompt({
      columns,
      style: asStyle(body.style),
      instructions,
    }),
    messages: [
      {
        role: "user",
        content: [{ type: "text" as const, text: extractUserPrompt(query, source) }, ...fileParts],
      },
    ],
  });

  return createTextStreamResponse({
    stream: toTextStream({ stream: result.stream }),
  });
}
