import { z } from "zod";

export const COLUMN_TYPES = ["string", "number", "integer", "boolean"] as const;
export type ColumnType = (typeof COLUMN_TYPES)[number];

export interface TableColumn {
  key: string;
  label: string;
  type: ColumnType;
}

export interface TableRow {
  id: string;
  values: Record<string, unknown>;
}

const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;
const MAX_COLUMNS = 24;

export const tableSchemaObject = z.object({
  title: z.string().describe("Short name for the table"),
  columns: z
    .array(
      z.object({
        key: z.string().describe("camelCase identifier used as the JSON key"),
        label: z.string().describe("Human-readable column header"),
        type: z.enum(COLUMN_TYPES).describe("Primitive cell type"),
      }),
    )
    .min(1)
    .max(MAX_COLUMNS),
});

export const extractRowsClientSchema = z.object({
  rows: z.array(z.record(z.string(), z.unknown())),
});

export function isColumnType(value: unknown): value is ColumnType {
  return typeof value === "string" && (COLUMN_TYPES as readonly string[]).includes(value);
}

export function toColumnKey(label: string): string {
  const trimmed = label.trim();
  if (IDENT.test(trimmed)) return `${trimmed.charAt(0).toLowerCase()}${trimmed.slice(1)}`;
  const parts = trimmed.split(/[^A-Za-z0-9]+/).filter(Boolean);
  if (parts.length === 0) return "column";
  const camel = parts
    .map((part, index) => {
      const lower = part.toLowerCase();
      return index === 0 ? lower : `${lower.charAt(0).toUpperCase()}${lower.slice(1)}`;
    })
    .join("")
    .replace(/[^A-Za-z0-9_]/g, "");
  if (!camel) return "column";
  return IDENT.test(camel) ? camel : `col_${camel}`;
}

export function uniqueKey(base: string, used: Iterable<string>): string {
  const taken = used instanceof Set ? used : new Set(used);
  if (!taken.has(base)) return base;
  for (let n = 2; n < 1000; n++) {
    const next = `${base}_${n}`;
    if (!taken.has(next)) return next;
  }
  return `${base}_${Date.now()}`;
}

export function normalizeColumns(input: unknown): TableColumn[] {
  if (!Array.isArray(input)) return [];
  const used = new Set<string>();
  const columns: TableColumn[] = [];
  for (const item of input) {
    if (columns.length >= MAX_COLUMNS) break;
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const label =
      typeof rec.label === "string" && rec.label.trim()
        ? rec.label.trim()
        : typeof rec.key === "string"
          ? rec.key
          : "";
    const rawKey = typeof rec.key === "string" ? rec.key.trim() : "";
    if (!label && !rawKey) continue;
    const key = uniqueKey(IDENT.test(rawKey) ? rawKey : toColumnKey(label || "column"), used);
    used.add(key);
    columns.push({
      key,
      label: label || key,
      type: isColumnType(rec.type) ? rec.type : "string",
    });
  }
  return columns;
}

export function nextColumn(existing: TableColumn[]): TableColumn {
  const label = `Column ${existing.length + 1}`;
  return {
    key: uniqueKey(toColumnKey(label), existing.map((column) => column.key)),
    label,
    type: "string",
  };
}

export function emptyRow(columns: TableColumn[], id: string): TableRow {
  const values: Record<string, unknown> = {};
  for (const column of columns) values[column.key] = "";
  return { id, values };
}

export function rowFingerprint(values: Record<string, unknown>): string {
  return JSON.stringify(
    Object.keys(values)
      .sort()
      .map((key) => [key, values[key] ?? null]),
  );
}

export function unionRows(
  groups: Iterable<Iterable<Record<string, unknown>>>,
): Array<Record<string, unknown>> {
  const seen = new Set<string>();
  const rows: Array<Record<string, unknown>> = [];
  for (const group of groups) {
    for (const row of group) {
      const key = rowFingerprint(row);
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push(row);
    }
  }
  return rows;
}

export function mergeStreamedRows(
  prev: TableRow[],
  streamed: unknown,
  createId: (index: number) => string,
): TableRow[] {
  if (!Array.isArray(streamed)) return prev;
  const rows: TableRow[] = [];
  for (let i = 0; i < streamed.length; i++) {
    const values = streamed[i];
    if (!values || typeof values !== "object") continue;
    rows.push({ id: prev[i]?.id ?? createId(i), values: values as Record<string, unknown> });
  }
  return rows;
}

export function cellText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function compareCell(a: unknown, b: unknown, type: ColumnType): number {
  if (a == null || a === "") return b == null || b === "" ? 0 : 1;
  if (b == null || b === "") return -1;
  if (type === "number" || type === "integer") {
    return Number(a) - Number(b);
  }
  if (type === "boolean") {
    return Number(Boolean(a)) - Number(Boolean(b));
  }
  return cellText(a).localeCompare(cellText(b), undefined, { numeric: true, sensitivity: "base" });
}

function zodForType(type: ColumnType): z.ZodType<unknown> {
  const inner =
    type === "number"
      ? z.number()
      : type === "integer"
        ? z.number().int()
        : type === "boolean"
          ? z.boolean()
          : z.string();
  return inner.nullable();
}

export function extractOutputSchema(columns: TableColumn[]): z.ZodType<{ rows: Array<Record<string, unknown>> }> {
  const shape: Record<string, z.ZodType<unknown>> = {};
  for (const column of columns) {
    if (!IDENT.test(column.key)) continue;
    shape[column.key] = zodForType(column.type);
  }
  if (Object.keys(shape).length === 0) {
    shape.value = z.string().nullable();
  }
  return z.object({ rows: z.array(z.object(shape)) });
}

export function rowsToJson(columns: TableColumn[], rows: TableRow[]): Array<Record<string, unknown>> {
  return rows.map((row) => {
    const out: Record<string, unknown> = {};
    for (const column of columns) {
      const value = row.values[column.key];
      out[column.key] = value === "" ? null : (value ?? null);
    }
    return out;
  });
}

export function renameColumnKey(columns: TableColumn[], rows: TableRow[], from: string, to: string): {
  columns: TableColumn[];
  rows: TableRow[];
} {
  if (from === to) return { columns, rows };
  const key = uniqueKey(to, columns.filter((column) => column.key !== from).map((column) => column.key));
  return {
    columns: columns.map((column) => (column.key === from ? { ...column, key } : column)),
    rows: rows.map((row) => {
      const values = { ...row.values };
      values[key] = values[from];
      delete values[from];
      return { ...row, values };
    }),
  };
}
