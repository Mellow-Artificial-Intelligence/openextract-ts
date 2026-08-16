import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createContext, runInContext } from "node:vm";
import { tool } from "ai";
import { z } from "zod";

export const ExtractionStyle = {
  DIRECT: "direct",
  SEARCH: "search",
  CODE: "code",
  SANDBOX: "sandbox",
} as const;

export type ExtractionStyle = (typeof ExtractionStyle)[keyof typeof ExtractionStyle];

const BINARY_PREFIXES = [
  "image/",
  "audio/",
  "video/",
  "application/vnd.openxmlformats-officedocument.",
  "application/vnd.oasis.opendocument.",
];
const BINARY_TYPES = new Set([
  "application/pdf",
  "application/zip",
  "application/gzip",
  "application/x-gzip",
  "application/x-tar",
  "application/msword",
  "application/vnd.ms-excel",
  "application/vnd.ms-powerpoint",
]);
const TEXT_APPLICATION_TYPES = new Set([
  "application/csv",
  "application/graphql",
  "application/javascript",
  "application/json",
  "application/ld+json",
  "application/sql",
  "application/toml",
  "application/xml",
  "application/x-ndjson",
  "application/x-sh",
  "application/x-yaml",
  "application/yaml",
]);
const DOCUMENT_FILENAMES: Record<string, string> = {
  csv: "document.csv",
  html: "document.html",
  javascript: "document.js",
  json: "document.json",
  "ld+json": "document.json",
  markdown: "document.md",
  plain: "document.txt",
  "tab-separated-values": "document.tsv",
  toml: "document.toml",
  "x-markdown": "document.md",
  "x-ndjson": "document.ndjson",
  "x-sh": "document.sh",
  "x-yaml": "document.yaml",
  xml: "document.xml",
  yaml: "document.yaml",
};
const BINARY_FILENAMES: Record<string, string> = {
  gif: "document.gif",
  jpeg: "document.jpg",
  jpg: "document.jpg",
  mp3: "document.mp3",
  mp4: "document.mp4",
  mpeg: "document.mp3",
  pdf: "document.pdf",
  png: "document.png",
  wav: "document.wav",
  webm: "document.webm",
  webp: "document.webp",
  zip: "document.zip",
};

export function normalizeStyle(style: ExtractionStyle | string): ExtractionStyle {
  const values = Object.values(ExtractionStyle);
  if (values.includes(style as ExtractionStyle)) return style as ExtractionStyle;
  throw new Error(`style must be one of ${values.map((v) => `'${v}'`).join(", ")}; got '${style}'.`);
}

function bareMediaType(mediaType: string): string {
  return mediaType.split(";", 1)[0]!.trim().toLowerCase();
}

export function isTextMediaType(mediaType: string): boolean {
  const bare = bareMediaType(mediaType);
  return (
    bare.startsWith("text/") ||
    TEXT_APPLICATION_TYPES.has(bare) ||
    bare.endsWith("+json") ||
    bare.endsWith("+xml") ||
    bare.endsWith("+yaml")
  );
}

export function isBinaryMediaType(mediaType: string): boolean {
  const bare = bareMediaType(mediaType);
  return BINARY_PREFIXES.some((prefix) => bare.startsWith(prefix)) || BINARY_TYPES.has(bare);
}

export function documentFilename(mediaType: string): string {
  const subtype = bareMediaType(mediaType).split("/").pop() || "plain";
  return DOCUMENT_FILENAMES[subtype] ?? "document.txt";
}

export function workspaceFilename(mediaType: string): string {
  const subtype = bareMediaType(mediaType).split("/").pop() || "plain";
  return (
    DOCUMENT_FILENAMES[subtype] ??
    BINARY_FILENAMES[subtype] ??
    (isBinaryMediaType(mediaType) ? `document.${subtype.replace(/[^a-z0-9]+/gi, "") || "bin"}` : "document.txt")
  );
}

export function decodeTextDocument(
  data: Uint8Array,
  mediaType: string,
  style: ExtractionStyle,
): string {
  if (isBinaryMediaType(mediaType) && !isTextMediaType(mediaType)) {
    throw new Error(
      `style '${style}' requires a text document; got mediaType='${mediaType}'. ` +
        "Use style='direct' for PDFs, images, audio, and video.",
    );
  }
  if (data.includes(0)) {
    throw new Error(
      `style '${style}' requires a text document; the input contains NUL bytes. ` +
        "Use style='direct' instead.",
    );
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(data);
  } catch {
    throw new Error(
      `style '${style}' requires UTF-8 text; the input is not valid UTF-8. ` +
        "Use style='direct' instead.",
    );
  }
}

export async function materializeTextDocument(
  workspace: string,
  data: Uint8Array,
  mediaType: string,
  style: ExtractionStyle,
): Promise<{ filename: string; text: string }> {
  const filename = documentFilename(mediaType);
  const text = decodeTextDocument(data, mediaType, style);
  await writeFile(join(workspace, filename), text, "utf8");
  return { filename, text };
}

function searchTools(workspace: string) {
  return {
    listDirectory: tool({
      description: "List files in the workspace.",
      inputSchema: z.object({ path: z.string().optional() }),
      execute: async ({ path }) => {
        const { readdir } = await import("node:fs/promises");
        return readdir(join(workspace, path ?? "."));
      },
    }),
    readFile: tool({
      description: "Read a UTF-8 file from the workspace.",
      inputSchema: z.object({
        path: z.string(),
        offset: z.number().int().nonnegative().optional(),
        limit: z.number().int().positive().optional(),
      }),
      execute: async ({ path, offset = 0, limit }) => {
        const text = await readFile(join(workspace, path), "utf8");
        const lines = text.split("\n").slice(offset, limit == null ? undefined : offset + limit);
        return lines.join("\n");
      },
    }),
    searchFiles: tool({
      description: "Search workspace files with a regular expression.",
      inputSchema: z.object({
        pattern: z.string(),
        path: z.string().optional(),
      }),
      execute: async ({ pattern, path }) => {
        const text = await readFile(join(workspace, path ?? documentFilename("text/plain")), "utf8");
        const regex = new RegExp(pattern, "gm");
        const matches: string[] = [];
        for (const match of text.matchAll(regex)) {
          matches.push(match[0]);
          if (matches.length >= 50) break;
        }
        return matches;
      },
    }),
    fileInfo: tool({
      description: "Return size and name for a workspace file.",
      inputSchema: z.object({ path: z.string() }),
      execute: async ({ path }) => {
        const info = await stat(join(workspace, path));
        return { path, size: info.size };
      },
    }),
  };
}

function codeTools(document: string) {
  return {
    runCode: tool({
      description:
        "Run JavaScript against the document. The document text is available as `document`. " +
        "Return a value; no filesystem or network access is provided.",
      inputSchema: z.object({ code: z.string() }),
      execute: async ({ code }) => {
        const logs: string[] = [];
        const context = createContext({
          document,
          console: { log: (...args: unknown[]) => logs.push(args.map(String).join(" ")) },
          JSON,
          Math,
          String,
          Number,
          Boolean,
          Array,
          Object,
          Map,
          Set,
          Date,
          RegExp,
          parseInt,
          parseFloat,
          isNaN,
          isFinite,
        });
        const result = runInContext(code, context, { timeout: 5000 });
        return { result, logs };
      },
    }),
  };
}

export function stylePrompt(style: ExtractionStyle, filename: string): string {
  if (style === ExtractionStyle.SEARCH) {
    return (
      `Extract the requested information from the document '${filename}' in the workspace. ` +
      "Use searchFiles, readFile, listDirectory, and fileInfo to inspect it. " +
      "Search before reading large files; do not assume unseen contents."
    );
  }
  return (
    `Extract the requested information by writing JavaScript against '${filename}'. ` +
    "The file contents are available as `document` in runCode. Parse, filter, and compute the structured result."
  );
}

export async function withStyleWorkspace<T>(
  style: ExtractionStyle,
  data: Uint8Array,
  mediaType: string,
  fn: (prepared: {
    prompt: string;
    tools?: ReturnType<typeof searchTools> | ReturnType<typeof codeTools>;
    file?: { data: Uint8Array; mediaType: string };
  }) => Promise<T>,
): Promise<T> {
  if (style === ExtractionStyle.DIRECT) {
    return fn({
      prompt: "Extract the requested information from this document.",
      file: { data, mediaType },
    });
  }
  const workspace = await mkdtemp(join(tmpdir(), "openextract-"));
  try {
    const { filename, text } = await materializeTextDocument(workspace, data, mediaType, style);
    return await fn({
      prompt: stylePrompt(style, filename),
      tools: style === ExtractionStyle.SEARCH ? searchTools(workspace) : codeTools(text),
    });
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}
