import { describe, expect, it } from "vitest";
import {
  decodeTextDocument,
  documentFilename,
  ExtractionStyle,
  isBinaryMediaType,
  isTextMediaType,
  normalizeStyle,
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
});
