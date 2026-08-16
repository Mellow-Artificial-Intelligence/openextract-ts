import { Output as WorkflowOutput, WorkflowAgent, type ModelCallStreamPart } from "@ai-sdk/workflow";
import { getWritable } from "workflow";
import { prepareExtractInput } from "@/lib/extract-prepare";
import { usesSandbox } from "@/lib/models";
import { extractOutputSchema } from "@/lib/table-schema";
import { agentToolsContext, codeTools, searchTools } from "./extract-tools";
import { extractDirect } from "./extract-direct";
import { extractSandbox } from "./extract-sandbox";
import type { ExtractTableInput, PreparedExtract } from "./extract-types";

export type { ExtractTableInput, PreparedExtract };

async function prepareExtract(input: ExtractTableInput): Promise<PreparedExtract> {
  "use step";
  console.log("prepareExtract", input.model, input.style);
  return prepareExtractInput(input);
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
    stopWhen: ({ steps }) => steps.length >= 20,
  });
  return result.output;
}

export async function extractTableWorkflow(input: ExtractTableInput) {
  "use workflow";
  console.log("extractTableWorkflow", input.model, input.style);
  const prepared = await prepareExtract(input);
  if (usesSandbox(prepared.model, prepared.style)) return extractSandbox(prepared);
  if (prepared.style === "direct") return extractDirect(prepared);
  return extractWithAgent(prepared);
}
