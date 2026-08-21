import { describe, expect, it } from "vitest";
import { parseDataUrl } from "../web/src/lib/source-files.ts";
import {
  cellText,
  compareCell,
  extractOutputSchema,
  mergeStreamedRows,
  nextColumn,
  normalizeColumns,
  renameColumnKey,
  rowsToJson,
  toColumnKey,
  unionRows,
  uniqueKey,
} from "../web/src/lib/table-schema.ts";
import { resizeAgentModels, setAgentModelAt } from "../web/src/lib/models.ts";
import { parsePartialJson } from "../web/src/lib/partial-json.ts";
import { rowsFromExtractText } from "../web/src/lib/extract-stream.ts";

describe("toColumnKey", () => {
  it("keeps ident keys", () => {
    expect(toColumnKey("unitPrice")).toBe("unitPrice");
  });

  it("lowercases PascalCase labels", () => {
    expect(toColumnKey("Amount")).toBe("amount");
  });

  it("camelCases labels", () => {
    expect(toColumnKey("Unit Price")).toBe("unitPrice");
    expect(toColumnKey("due-date")).toBe("dueDate");
  });

  it("prefixes numeric keys", () => {
    expect(toColumnKey("2024 total")).toBe("col_2024Total");
  });
});

describe("normalizeColumns", () => {
  it("drops empty entries and uniquifies keys", () => {
    expect(
      normalizeColumns([
        { key: "name", label: "Name", type: "string" },
        { key: "name", label: "Name 2", type: "string" },
        { label: "Amount", type: "number" },
        { type: "string" },
        { key: "ok", type: "nope" },
      ]),
    ).toEqual([
      { key: "name", label: "Name", type: "string" },
      { key: "name_2", label: "Name 2", type: "string" },
      { key: "amount", label: "Amount", type: "number" },
      { key: "ok", label: "ok", type: "string" },
    ]);
  });

  it("accepts partial streamed columns", () => {
    expect(normalizeColumns([{ key: "vendor" }])).toEqual([
      { key: "vendor", label: "vendor", type: "string" },
    ]);
  });
});

describe("table helpers", () => {
  it("allocates unique next columns", () => {
    const first = nextColumn([]);
    const second = nextColumn([first]);
    expect(first.key).not.toBe(second.key);
  });

  it("merges streamed rows in place", () => {
    const prev = [{ id: "a", values: { name: "Ada" } }];
    const merged = mergeStreamedRows(prev, [{ name: "Ada" }, { name: "Sam" }], () => "b");
    expect(merged).toEqual([
      { id: "a", values: { name: "Ada" } },
      { id: "b", values: { name: "Sam" } },
    ]);
  });

  it("renames a column key across rows", () => {
    const renamed = renameColumnKey(
      [{ key: "n", label: "Name", type: "string" }],
      [{ id: "1", values: { n: "Ada" } }],
      "n",
      "name",
    );
    expect(renamed.columns[0]?.key).toBe("name");
    expect(renamed.rows[0]?.values).toEqual({ name: "Ada" });
  });

  it("sorts mixed empty and numeric cells", () => {
    expect(compareCell(2, 10, "number")).toBeLessThan(0);
    expect(compareCell("", 1, "number")).toBeGreaterThan(0);
    expect(compareCell("b", "a", "string")).toBeGreaterThan(0);
  });

  it("serializes rows and validates extract output", () => {
    const columns = [
      { key: "name", label: "Name", type: "string" as const },
      { key: "age", label: "Age", type: "integer" as const },
    ];
    const rows = [{ id: "1", values: { name: "Ada", age: 36 } }];
    expect(rowsToJson(columns, rows)).toEqual([{ name: "Ada", age: 36 }]);
    expect(extractOutputSchema(columns).parse({ rows: [{ name: "Ada", age: 36 }] })).toEqual({
      rows: [{ name: "Ada", age: 36 }],
    });
  });

  it("uniqueKey skips taken values", () => {
    expect(uniqueKey("name", ["name", "name_2"])).toBe("name_3");
  });

  it("cellText stringifies objects", () => {
    expect(cellText({ a: 1 })).toBe('{"a":1}');
    expect(cellText(null)).toBe("");
  });
});

describe("parseDataUrl", () => {
  it("decodes base64 payloads", () => {
    const parsed = parseDataUrl("data:text/plain;base64,aGk=");
    expect(parsed?.mediaType).toBe("text/plain");
    expect(Buffer.from(parsed!.data).toString("utf8")).toBe("hi");
  });

  it("rejects non-data URLs", () => {
    expect(parseDataUrl("https://example.com")).toBeNull();
  });
});

describe("unionRows", () => {
  it("dedupes fingerprints across agents", () => {
    expect(
      unionRows([
        [{ name: "Ada", age: 36 }, { name: "Sam", age: 1 }],
        [{ name: "Ada", age: 36 }, { name: "Grace", age: 2 }],
      ]),
    ).toEqual([
      { name: "Ada", age: 36 },
      { name: "Sam", age: 1 },
      { name: "Grace", age: 2 },
    ]);
  });
});

describe("resizeAgentModels", () => {
  it("keeps existing assignments and fills unused models", () => {
    expect(resizeAgentModels(["google/gemini-3.7-flash"], 3, "google/gemini-3.7-flash")).toEqual([
      "google/gemini-3.7-flash",
      "openai/gpt-5.6-luna",
      "openai/gpt-5.6-sol",
    ]);
  });

  it("trims and replaces one slot", () => {
    const three: Array<"openai/gpt-5.6-luna" | "openai/gpt-5.6-sol" | "google/gemini-3.7-flash"> = [
      "openai/gpt-5.6-luna",
      "openai/gpt-5.6-sol",
      "google/gemini-3.7-flash",
    ];
    expect(resizeAgentModels(three, 2, "openai/gpt-5.6-sol")).toEqual([
      "openai/gpt-5.6-luna",
      "openai/gpt-5.6-sol",
    ]);
    expect(setAgentModelAt(three, 1, "openai/gpt-5.6-luna")).toEqual([
      "openai/gpt-5.6-luna",
      "openai/gpt-5.6-luna",
      "google/gemini-3.7-flash",
    ]);
  });
});

describe("parsePartialJson", () => {
  it("closes an open rows array", () => {
    expect(parsePartialJson('{"rows":[{"name":"Ada"}')).toEqual({ rows: [{ name: "Ada" }] });
    expect(rowsFromExtractText('{"rows":[{"name":"Ada"}')).toEqual([{ name: "Ada" }]);
  });
});
