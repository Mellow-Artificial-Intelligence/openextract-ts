import type { StyleName } from "./presets";

const STYLE_HINT: Record<StyleName, string> = {
  direct: "Read the full source and extract in one pass.",
  search: "Scan for the most relevant passages before extracting.",
  code: "Reason over the text as data (counts, totals, lists) before extracting.",
};

export function extractionSystemPrompt(options: {
  schemaSpec: string;
  style: StyleName;
  instructions?: string;
}): string {
  const extra = options.instructions?.trim();
  return [
    "You extract structured data for openextract.",
    "Return a single JSON object that matches this schema, then a one-line summary:",
    options.schemaSpec.trim(),
    `Extraction style: ${options.style}. ${STYLE_HINT[options.style]}`,
    extra ? `User instructions: ${extra}` : "",
    "Put the JSON in a fenced json code block. If the user is not providing a source yet, ask for pasted text, a URL, or a file.",
  ]
    .filter(Boolean)
    .join("\n\n");
}
