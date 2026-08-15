import { tool } from "ai";
import { createContext, runInContext } from "node:vm";
import { z } from "zod";

const FILENAME = "document.txt";

async function listDirectoryStep() {
  "use step";
  console.log("listDirectory");
  return [FILENAME];
}

async function readFileStep(
  { offset = 0, limit }: { offset?: number; limit?: number },
  { context }: { context: { text: string } },
) {
  "use step";
  console.log("readFile", offset, limit);
  const lines = context.text.split("\n").slice(offset, limit == null ? undefined : offset + limit);
  return lines.join("\n");
}

async function searchFilesStep(
  { pattern }: { pattern: string },
  { context }: { context: { text: string } },
) {
  "use step";
  console.log("searchFiles", pattern);
  const matches: string[] = [];
  for (const match of context.text.matchAll(new RegExp(pattern, "gm"))) {
    matches.push(match[0]);
    if (matches.length >= 50) break;
  }
  return matches;
}

async function fileInfoStep(_input: { path: string }, { context }: { context: { text: string } }) {
  "use step";
  console.log("fileInfo");
  return { path: FILENAME, size: context.text.length };
}

async function runCodeStep({ code }: { code: string }, { context }: { context: { document: string } }) {
  "use step";
  console.log("runCode");
  const logs: string[] = [];
  const sandbox = createContext({
    document: context.document,
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
  const result = runInContext(code, sandbox, { timeout: 5000 });
  return { result, logs };
}

const textContext = z.object({ text: z.string() });

export function searchTools() {
  return {
    listDirectory: tool({
      description: "List files in the workspace.",
      inputSchema: z.object({ path: z.string().optional() }),
      execute: listDirectoryStep,
    }),
    readFile: tool({
      description: "Read a UTF-8 file from the workspace.",
      inputSchema: z.object({
        path: z.string(),
        offset: z.number().int().nonnegative().optional(),
        limit: z.number().int().positive().optional(),
      }),
      contextSchema: textContext,
      execute: readFileStep,
    }),
    searchFiles: tool({
      description: "Search workspace files with a regular expression.",
      inputSchema: z.object({
        pattern: z.string(),
        path: z.string().optional(),
      }),
      contextSchema: textContext,
      execute: searchFilesStep,
    }),
    fileInfo: tool({
      description: "Return size and name for a workspace file.",
      inputSchema: z.object({ path: z.string() }),
      contextSchema: textContext,
      execute: fileInfoStep,
    }),
  };
}

export function codeTools() {
  return {
    runCode: tool({
      description:
        "Run JavaScript against the document. The document text is available as `document`. " +
        "Return a value; no filesystem or network access is provided.",
      inputSchema: z.object({ code: z.string() }),
      contextSchema: z.object({ document: z.string() }),
      execute: runCodeStep,
    }),
  };
}

export function agentToolsContext(style: "search" | "code", text: string) {
  if (style === "code") return { runCode: { document: text } };
  return {
    readFile: { text },
    searchFiles: { text },
    fileInfo: { text },
  };
}
