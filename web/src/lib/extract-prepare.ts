import { filesToParts } from "@/lib/source-files";
import { extractUserPrompt, extractionSystemPrompt } from "@/lib/system-prompt";
import type { ExtractTableInput, PreparedExtract } from "@/workflows/extract-types";

export function prepareExtractInput(input: ExtractTableInput): PreparedExtract {
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
    coding: input.coding,
  };
}
