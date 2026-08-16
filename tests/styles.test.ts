import { describe, expect, it } from "vitest";
import {
  decodeTextDocument,
  documentFilename,
  ExtractionStyle,
  isBinaryMediaType,
  isTextMediaType,
  materializeTextDocument,
  normalizeStyle,
  stylePrompt,
  withStyleWorkspace,
} from "../src/styles.js";

describe("styles", () => {
  it("normalizes enum values and rejects unknown ones", () => {
    expect(normalizeStyle("search")).toBe(ExtractionStyle.SEARCH);
    expect(normalizeStyle(ExtractionStyle.CODE)).toBe(ExtractionStyle.CODE);
    expect(() => normalizeStyle("rag")).toThrow(/style must be one of/);
  });

  it("classifies media types", () => {
    expect(isTextMediaType("text/plain")).toBe(true);
    expect(isTextMediaType("application/json")).toBe(true);
    expect(isTextMediaType("application/vnd.api+json")).toBe(true);
    expect(isBinaryMediaType("image/png")).toBe(true);
    expect(isBinaryMediaType("application/pdf")).toBe(true);
    expect(isBinaryMediaType("text/plain")).toBe(false);
  });

  it("picks workspace filenames", () => {
    expect(documentFilename("text/plain")).toBe("document.txt");
    expect(documentFilename("application/json; charset=utf-8")).toBe("document.json");
    expect(documentFilename("text/markdown")).toBe("document.md");
    expect(documentFilename("text/unknown")).toBe("document.txt");
    expect(documentFilename("plain")).toBe("document.txt");
    expect(documentFilename("")).toBe("document.txt");
  });

  it("rejects binary and non-utf8 input for search/code", () => {
    expect(() =>
      decodeTextDocument(new Uint8Array([0x25, 0x50, 0x44, 0x46]), "application/pdf", "search"),
    ).toThrow(/requires a text document/);
    expect(() => decodeTextDocument(new Uint8Array([0, 1]), "text/plain", "code")).toThrow(
      /NUL bytes/,
    );
    expect(() => decodeTextDocument(new Uint8Array([0xff, 0xfe]), "text/plain", "search")).toThrow(
      /UTF-8/,
    );
  });

  it("writes a search workspace and runs file tools", async () => {
    const text = "alpha\nbeta\nalpha\n".repeat(30);
    await withStyleWorkspace("search", Buffer.from(text), "text/plain", async (prepared) => {
      expect(prepared.prompt).toContain("searchFiles");
      const tools = prepared.tools as {
        listDirectory: { execute: (args: { path?: string }) => Promise<string[]> };
        readFile: { execute: (args: { path: string; offset?: number; limit?: number }) => Promise<string> };
        searchFiles: { execute: (args: { pattern: string; path?: string }) => Promise<string[]> };
        fileInfo: { execute: (args: { path: string }) => Promise<{ path: string; size: number }> };
      };
      expect(await tools.listDirectory.execute({})).toContain("document.txt");
      expect(await tools.readFile.execute({ path: "document.txt", offset: 0, limit: 1 })).toBe("alpha");
      expect(await tools.readFile.execute({ path: "document.txt" })).toContain("beta");
      const matches = await tools.searchFiles.execute({ pattern: "alpha" });
      expect(matches).toHaveLength(50);
      const info = await tools.fileInfo.execute({ path: "document.txt" });
      expect(info.size).toBeGreaterThan(0);
    });
  });

  it("runs sandboxed code against the document", async () => {
    await withStyleWorkspace("code", Buffer.from("hello world"), "text/plain", async (prepared) => {
      expect(prepared.prompt).toContain("runCode");
      const tools = prepared.tools as {
        runCode: { execute: (args: { code: string }) => Promise<{ result: unknown; logs: string[] }> };
      };
      const result = await tools.runCode.execute({
        code: "console.log(document); document.split(' ').length",
      });
      expect(result.result).toBe(2);
      expect(result.logs[0]).toContain("hello");
    });
  });

  it("materializes text and builds style prompts", async () => {
    const { mkdtemp } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const dir = await mkdtemp(join(tmpdir(), "openextract-style-"));
    const written = await materializeTextDocument(dir, Buffer.from("hi"), "text/csv", "search");
    expect(written.filename).toBe("document.csv");
    expect(stylePrompt("search", "document.txt")).toContain("searchFiles");
    expect(stylePrompt("code", "document.txt")).toContain("runCode");
  });
});
