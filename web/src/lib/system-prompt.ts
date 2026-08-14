import { STYLE_DETAILS, type StyleName } from "./presets";

export function extractionSystemPrompt(options: {
  schemaSpec: string;
  style: StyleName;
  instructions?: string;
}): string {
  const extra = options.instructions?.trim();
  return [
    "You extract structured data for openextract in a single turn.",
    "Return a single JSON object that matches this schema, then a one-line summary:",
    options.schemaSpec.trim(),
    `Extraction style: ${options.style}. ${STYLE_DETAILS[options.style].description}`,
    extra ? `User instructions: ${extra}` : "",
    "Put the JSON in a fenced json code block. Extract from the provided source only. Do not ask follow-up questions.",
  ]
    .filter(Boolean)
    .join("\n\n");
}
