import { STYLE_DETAILS, type StyleName } from "./presets";
import type { TableColumn } from "./table-schema";

export function schemaSystemPrompt(): string {
  return [
    "You design a flat table schema for structured extraction.",
    "Return short camelCase keys, human labels, and primitive types only: string, number, integer, boolean.",
    "Prefer 2–8 columns. Flatten repeating items into rows — no nested objects or arrays.",
    "Do not extract values. Only design the columns.",
  ].join(" ");
}

export function extractionSystemPrompt(options: {
  columns: TableColumn[];
  style: StyleName;
  instructions?: string;
}): string {
  const extra = options.instructions?.trim();
  const fields = options.columns
    .map((column) => `${column.key} (${column.type}): ${column.label}`)
    .join("\n");
  return [
    "You extract structured rows for a table. Each row is one record.",
    "Fill every column. Use null when a value is unknown.",
    "Extract from the provided source only. Do not ask follow-up questions.",
    `Extraction style: ${options.style}. ${STYLE_DETAILS[options.style].description}`,
    extra ? `User instructions: ${extra}` : "",
    "Columns:",
    fields,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function schemaUserPrompt(query: string, source?: string): string {
  const excerpt = source?.trim();
  return excerpt
    ? `Table request:\n${query}\n\nSource excerpt:\n${excerpt.slice(0, 6_000)}`
    : `Table request:\n${query}`;
}

export function swarmAgentInstructions(instructions: string, index: number, total: number): string {
  const role =
    `You are extraction agent ${index + 1} of ${total}. ` +
    "Work independently. Prefer recall: extract every matching row you can justify from the source.";
  const extra = instructions.trim();
  return extra ? `${extra}\n\n${role}` : role;
}

export function extractUserPrompt(query: string, source?: string): string {
  const text = source?.trim();
  if (text && query.trim()) return `${query.trim()}\n\n${text}`;
  if (text) return text;
  return query.trim() || "Extract structured rows from the attached file.";
}
