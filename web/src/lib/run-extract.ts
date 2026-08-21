import { generateText, Output, tool } from "ai";
import { z } from "zod";
import { usesSandbox } from "@/lib/models";
import { extractOutputSchema } from "@/lib/table-schema";
import { extractWithCodingAgent } from "@/workflows/extract-sandbox";
import type { ExtractTableInput, PreparedExtract } from "@/workflows/extract-types";
import { prepareExtractInput } from "./extract-prepare";

const FILENAME = "document.txt";

async function runExtractDirect(prepared: PreparedExtract) {
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

function searchTools(text: string) {
  return {
    listDirectory: tool({
      description: "List files in the workspace.",
      inputSchema: z.object({ path: z.string().optional() }),
      execute: async () => [FILENAME],
    }),
    readFile: tool({
      description: "Read a UTF-8 file from the workspace.",
      inputSchema: z.object({
        path: z.string(),
        offset: z.number().int().nonnegative().optional(),
        limit: z.number().int().positive().optional(),
      }),
      execute: async ({ offset = 0, limit }: { offset?: number; limit?: number }) => {
        const lines = text.split("\n").slice(offset, limit == null ? undefined : offset + limit);
        return lines.join("\n");
      },
    }),
    searchFiles: tool({
      description: "Search workspace files with a regular expression.",
      inputSchema: z.object({ pattern: z.string(), path: z.string().optional() }),
      execute: async ({ pattern }: { pattern: string }) => {
        const matches: string[] = [];
        for (const match of text.matchAll(new RegExp(pattern, "gm"))) {
          matches.push(match[0]);
          if (matches.length >= 50) break;
        }
        return matches;
      },
    }),
    fileInfo: tool({
      description: "Return size and name for a workspace file.",
      inputSchema: z.object({ path: z.string() }),
      execute: async () => ({ path: FILENAME, size: text.length }),
    }),
  };
}

function codeTools(text: string) {
  return {
    runCode: tool({
      description:
        "Run JavaScript against the document. The document text is available as `document`. " +
        "Return a value; no filesystem or network access is provided.",
      inputSchema: z.object({ code: z.string() }),
      execute: async ({ code }: { code: string }) => {
        const { createContext, runInContext } = await import("node:vm");
        const logs: string[] = [];
        const sandbox = createContext({
          document: text,
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
      },
    }),
  };
}

async function runExtractWithTools(prepared: PreparedExtract) {
  const style = prepared.style === "code" ? "code" : "search";
  const result = await generateText({
    model: prepared.model,
    tools: style === "code" ? codeTools(prepared.text) : searchTools(prepared.text),
    output: Output.object({
      name: "ExtractedRows",
      description: "Rows that fill the table columns.",
      schema: extractOutputSchema(prepared.columns),
    }),
    system: prepared.system,
    prompt: prepared.prompt,
    stopWhen: ({ steps }) => steps.length >= 20,
  });
  return result.output;
}

export async function runExtractTable(input: ExtractTableInput) {
  const prepared = prepareExtractInput(input);
  if (usesSandbox(prepared.model, prepared.style)) {
    return extractWithCodingAgent({
      model: prepared.model,
      prompt: prepared.prompt,
      system: prepared.system,
      text: prepared.text,
      files: prepared.files.map((file) => ({
        mediaType: file.mediaType,
        data: Buffer.from(file.data, "base64"),
      })),
      schema: extractOutputSchema(prepared.columns),
      coding: prepared.coding,
    });
  }
  if (prepared.style === "direct") return runExtractDirect(prepared);
  return runExtractWithTools(prepared);
}
