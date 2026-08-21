import { generateText, Output } from "ai";
import { extractOutputSchema } from "@/lib/table-schema";
import type { PreparedExtract } from "./extract-types";

export async function extractDirect(prepared: PreparedExtract) {
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
