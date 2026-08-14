import { createTextStreamResponse, Output, streamText, toTextStream } from "ai";
import { hasGatewayAuth } from "@/lib/gateway";
import { DEFAULT_MODEL, isModelId } from "@/lib/models";
import { schemaSystemPrompt, schemaUserPrompt } from "@/lib/system-prompt";
import { tableSchemaObject } from "@/lib/table-schema";

export const maxDuration = 30;

const MAX_QUERY_CHARS = 4_000;

export async function POST(req: Request) {
  if (!hasGatewayAuth()) {
    return Response.json(
      { error: "Set AI_GATEWAY_API_KEY in web/.env.local to run locally." },
      { status: 401 },
    );
  }

  const body = (await req.json()) as { query?: unknown; source?: unknown; model?: unknown };
  const query = typeof body.query === "string" ? body.query.trim().slice(0, MAX_QUERY_CHARS) : "";
  if (!query) {
    return Response.json({ error: "A table description is required" }, { status: 400 });
  }

  const source = typeof body.source === "string" ? body.source : undefined;
  const model = typeof body.model === "string" && isModelId(body.model) ? body.model : DEFAULT_MODEL;

  const result = streamText({
    model,
    output: Output.object({
      name: "TableSchema",
      description: "Flat table columns for structured extraction.",
      schema: tableSchemaObject,
    }),
    system: schemaSystemPrompt(),
    prompt: schemaUserPrompt(query, source),
  });

  return createTextStreamResponse({
    stream: toTextStream({ stream: result.stream }),
  });
}
