import { Output as WorkflowOutput, WorkflowAgent, type ModelCallStreamPart } from "@ai-sdk/workflow";
import { generateText, isStepCount, Output } from "ai";
import { getWritable } from "workflow";
import { filesToParts } from "@/lib/source-files";
import { extractUserPrompt, extractionSystemPrompt } from "@/lib/system-prompt";
import { extractOutputSchema, type TableColumn } from "@/lib/table-schema";
import type { StyleName } from "@/lib/presets";
import { agentToolsContext, codeTools, searchTools } from "./extract-tools";

export interface ExtractTableInput {
  query: string;
  source: string;
  files: unknown;
  columns: TableColumn[];
  model: string;
  style: StyleName;
  instructions?: string;
}

interface PreparedExtract {
  model: string;
  system: string;
  prompt: string;
  style: StyleName;
  text: string;
  files: Array<{ mediaType: string; data: string }>;
  columns: TableColumn[];
}

async function prepareExtract(input: ExtractTableInput): Promise<PreparedExtract> {
  "use step";
  console.log("prepareExtract", input.model, input.style);
  const parts = filesToParts(input.files);
  const text =
    input.source.trim() ||
    parts
      .filter((part) => part.mediaType.startsWith("text/") || part.mediaType.includes("json"))
      .map((part) => new TextDecoder().decode(part.data))
      .join("\n");
  return {
    model: input.model,
    system: extractionSystemPrompt({
      columns: input.columns,
      style: input.style,
      instructions: input.instructions,
    }),
    prompt: extractUserPrompt(input.query, input.source),
    style: input.style,
    text,
    files: parts.map((part) => ({
      mediaType: part.mediaType,
      data: Buffer.from(part.data).toString("base64"),
    })),
    columns: input.columns,
  };
}

async function extractDirect(prepared: PreparedExtract) {
  "use step";
  console.log("extractDirect", prepared.model);
  const fileParts = prepared.files.map((file) => ({
    type: "file" as const,
    data: Buffer.from(file.data, "base64"),
    mediaType: file.mediaType,
  }));
  const result = await generateText({
    model: prepared.model,
    output: Output.object({
      name: "ExtractedRows",
      description: "Rows that fill the table columns.",
      schema: extractOutputSchema(prepared.columns),
    }),
    system: prepared.system,
    messages: [
      {
        role: "user",
        content: [{ type: "text" as const, text: prepared.prompt }, ...fileParts],
      },
    ],
  });
  return result.output;
}

async function extractWithAgent(prepared: PreparedExtract) {
  const style = prepared.style === "code" ? "code" : "search";
  const agent = new WorkflowAgent({
    model: prepared.model,
    instructions: prepared.system,
    tools: style === "code" ? codeTools() : searchTools(),
    toolsContext: agentToolsContext(style, prepared.text),
  });
  const result = await agent.stream({
    messages: [{ role: "user", content: prepared.prompt }],
    writable: getWritable<ModelCallStreamPart>(),
    output: WorkflowOutput.object({ schema: extractOutputSchema(prepared.columns) }),
    stopWhen: isStepCount(20),
  });
  return result.output;
}

export async function extractTableWorkflow(input: ExtractTableInput) {
  "use workflow";
  console.log("extractTableWorkflow", input.model, input.style);
  const prepared = await prepareExtract(input);
  if (prepared.style === "direct") return extractDirect(prepared);
  return extractWithAgent(prepared);
}
