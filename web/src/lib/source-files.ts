import type { FileUIPart } from "ai";

export interface FilePart {
  type: "file";
  data: Uint8Array;
  mediaType: string;
}

/** Turns attachment data URLs into model file parts. */
export function filesToParts(files: unknown): FilePart[] {
  if (!Array.isArray(files)) return [];
  const parts: FilePart[] = [];
  for (const file of files) {
    if (!file || typeof file !== "object") continue;
    const rec = file as Partial<FileUIPart>;
    if (typeof rec.url !== "string") continue;
    const parsed = parseDataUrl(rec.url);
    if (!parsed) continue;
    parts.push({ type: "file", data: parsed.data, mediaType: parsed.mediaType });
  }
  return parts;
}

export function parseDataUrl(url: string): { mediaType: string; data: Uint8Array } | null {
  if (!url.startsWith("data:")) return null;
  const comma = url.indexOf(",");
  if (comma < 5) return null;
  const header = url.slice(5, comma);
  const payload = url.slice(comma + 1);
  const mediaType = header.split(";")[0] || "application/octet-stream";
  const data = header.includes("base64")
    ? Buffer.from(payload, "base64")
    : Buffer.from(decodeURIComponent(payload));
  return { mediaType, data: new Uint8Array(data) };
}
