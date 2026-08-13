import {
  generateText,
  Output,
  stepCountIs,
  ToolLoopAgent,
  type LanguageModel,
} from "ai";
import type { z } from "zod";
import type { Usage } from "./types.js";

export type { LanguageModel };

const PREFIX_ALIASES: Record<string, string> = {
  "openai-chat": "openai",
  "openai-responses": "openai",
  "google-gla": "google",
  "google-vertex": "google",
};

export function routeModel(model: LanguageModel): LanguageModel {
  if (typeof model !== "string") return model;
  if (model.includes("/")) return model;
  const sep = model.indexOf(":");
  if (sep === -1) return model;
  const prefix = model.slice(0, sep);
  const id = model.slice(sep + 1);
  return `${PREFIX_ALIASES[prefix] ?? prefix}/${id}`;
}

export function modelIdentifier(model: LanguageModel): string | null {
  if (typeof model === "string") return routeModel(model) as string;
  return "modelId" in model && typeof model.modelId === "string" ? model.modelId : null;
}

export function usageFromResult(usage: {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}): Usage {
  return {
    inputTokens: usage.inputTokens ?? 0,
    outputTokens: usage.outputTokens ?? 0,
    totalTokens: usage.totalTokens ?? 0,
  };
}

export async function runExtraction<T>(options: {
  schema: z.ZodType<T>;
  model: LanguageModel;
  instructions?: string;
  prompt: string;
  file?: { data: Uint8Array; mediaType: string };
  tools?: Parameters<typeof generateText>[0]["tools"];
  timeoutMs?: number;
  instrument?: boolean;
}): Promise<{ output: T; usage: Usage }> {
  const model = routeModel(options.model);
  const output = Output.object({ schema: options.schema });
  const telemetry = options.instrument ? { isEnabled: true } : undefined;
  const messages = options.file
    ? [
        {
          role: "user" as const,
          content: [
            { type: "text" as const, text: options.prompt },
            {
              type: "file" as const,
              data: options.file.data,
              mediaType: options.file.mediaType,
            },
          ],
        },
      ]
    : undefined;

  if (options.tools) {
    const agent = new ToolLoopAgent({
      model,
      instructions: options.instructions,
      tools: options.tools,
      output,
      stopWhen: stepCountIs(20),
      timeout: options.timeoutMs,
      experimental_telemetry: telemetry,
    });
    const result = await agent.generate({
      prompt: options.prompt,
    });
    return { output: result.output, usage: usageFromResult(result.totalUsage) };
  }

  const shared = {
    model,
    output,
    system: options.instructions,
    timeout: options.timeoutMs,
    experimental_telemetry: telemetry,
  };
  const result = messages
    ? await generateText({ ...shared, messages })
    : await generateText({ ...shared, prompt: options.prompt });
  return { output: result.output, usage: usageFromResult(result.totalUsage) };
}
