import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  streamText,
  toUIMessageStream,
  type UIMessage,
} from "ai";
import { isModelId } from "@/lib/models";
import { STYLES, type StyleName } from "@/lib/presets";
import { extractionSystemPrompt } from "@/lib/system-prompt";

export const maxDuration = 120;

const STYLES_SET = new Set<string>(STYLES);
const MAX_SCHEMA_CHARS = 8_000;
const MAX_INSTRUCTIONS_CHARS = 4_000;

function asStyle(value: unknown): StyleName {
  return typeof value === "string" && STYLES_SET.has(value) ? (value as StyleName) : "direct";
}

function hasGatewayAuth() {
  // VERCEL_OIDC_TOKEN is injected at runtime and is not available at Next.js
  // build time, so do not read it from process.env here.
  return Boolean(process.env.AI_GATEWAY_API_KEY) || Boolean(process.env.VERCEL);
}

export async function POST(req: Request) {
  if (!hasGatewayAuth()) {
    return Response.json(
      { error: "Set AI_GATEWAY_API_KEY in web/.env.local to run locally." },
      { status: 401 },
    );
  }

  const body = (await req.json()) as {
    messages?: UIMessage[];
    model?: string;
    schemaSpec?: string;
    style?: string;
    instructions?: string;
  };

  const messages = body.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    return Response.json({ error: "messages is required" }, { status: 400 });
  }

  const model = typeof body.model === "string" && isModelId(body.model) ? body.model : "openai/gpt-5.5";
  const schemaSpec =
    typeof body.schemaSpec === "string" && body.schemaSpec.trim()
      ? body.schemaSpec.slice(0, MAX_SCHEMA_CHARS)
      : "title: string\nsummary: string";
  const instructions =
    typeof body.instructions === "string" ? body.instructions.slice(0, MAX_INSTRUCTIONS_CHARS) : undefined;

  const result = streamText({
    model,
    system: extractionSystemPrompt({
      schemaSpec,
      style: asStyle(body.style),
      instructions,
    }),
    messages: await convertToModelMessages(messages),
  });

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({ stream: result.stream, sendReasoning: true }),
  });
}
