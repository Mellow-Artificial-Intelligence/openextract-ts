import { parsePartialJson } from "./partial-json";

export function rowsFromExtractText(text: string): Array<Record<string, unknown>> | undefined {
  const parsed = parsePartialJson(text);
  if (!parsed || typeof parsed !== "object" || !("rows" in parsed)) return undefined;
  const rows = (parsed as { rows: unknown }).rows;
  if (!Array.isArray(rows)) return undefined;
  return rows.filter(
    (row): row is Record<string, unknown> => Boolean(row) && typeof row === "object" && !Array.isArray(row),
  );
}

export async function fetchExtractRows(
  body: unknown,
  signal?: AbortSignal,
): Promise<Array<Record<string, unknown>>> {
  const response = await fetch("/api/extract", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  const data = (await response.json()) as { rows?: unknown; error?: string };
  if (!response.ok) throw new Error(data.error ?? `Extract failed (${response.status})`);
  return rowsFromExtractText(JSON.stringify({ rows: data.rows })) ?? [];
}

export async function streamExtractRows(
  body: unknown,
  options: {
    signal?: AbortSignal;
    onRows?: (rows: Array<Record<string, unknown>>) => void;
  } = {},
): Promise<Array<Record<string, unknown>>> {
  const response = await fetch("/api/extract", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: options.signal,
  });
  if (!response.ok) {
    let message = `Extract failed (${response.status})`;
    try {
      const payload = (await response.json()) as { error?: string };
      if (payload.error) message = payload.error;
    } catch {
      // keep the status message
    }
    throw new Error(message);
  }
  if (!response.body) throw new Error("Extract stream was empty.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  let rows: Array<Record<string, unknown>> = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
    const next = rowsFromExtractText(text);
    if (next) {
      rows = next;
      options.onRows?.(rows);
    }
  }
  text += decoder.decode();
  const next = rowsFromExtractText(text);
  if (next) {
    rows = next;
    options.onRows?.(rows);
  }
  return rows;
}
