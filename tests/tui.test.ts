import { describe, expect, it, vi } from "vitest";
import { TUI_RUNTIME_HELP, launchTui, tuiArgv, wantsTui } from "../src/tui.js";
import {
  DEFAULT_MODEL,
  PRESETS,
  defaultForm,
  formatResultJson,
  formatUsage,
  presetIdForSpec,
  resolveTuiInput,
  resolveTuiMediaType,
  resultFilename,
  runTuiExtract,
  validateForm,
} from "../src/tui/form.js";
import { Person } from "./helpers.js";

describe("wantsTui", () => {
  it("launches with no args, tui, or --tui", () => {
    expect(wantsTui([])).toBe(true);
    expect(wantsTui(["tui"])).toBe(true);
    expect(wantsTui(["--tui", "./doc.pdf"])).toBe(true);
    expect(wantsTui(["./doc.pdf", "--schema", "a:b", "--model", "openai/gpt-5.5"])).toBe(false);
  });

  it("strips the TUI invocation tokens", () => {
    expect(tuiArgv(["tui", "./doc.pdf", "--tui"])).toEqual(["./doc.pdf"]);
    expect(tuiArgv(["--tui", "./doc.pdf"])).toEqual(["./doc.pdf"]);
  });
});

describe("TUI form", () => {
  it("prefills a path source and document schema", () => {
    const form = defaultForm({
      source: "./q4.pdf",
      model: "xai/grok-4.6",
      instructions: "Be brief",
      schema: "title: string",
    });
    expect(form.sourceKind).toBe("path");
    expect(form.source).toBe("./q4.pdf");
    expect(form.model).toBe("xai/grok-4.6");
    expect(form.schemaSpec).toBe("title: string");
    expect(presetIdForSpec(form.schemaSpec)).toBe("custom");
  });

  it("defaults the model and paste mode", () => {
    const previous = process.env.OPENEXTRACT_MODEL;
    delete process.env.OPENEXTRACT_MODEL;
    expect(defaultForm().sourceKind).toBe("paste");
    expect(defaultForm().model).toBe(DEFAULT_MODEL);
    if (previous === undefined) delete process.env.OPENEXTRACT_MODEL;
    else process.env.OPENEXTRACT_MODEL = previous;
    process.env.OPENEXTRACT_MODEL = "xai/grok-4.6";
    expect(defaultForm().model).toBe("xai/grok-4.6");
    if (previous === undefined) delete process.env.OPENEXTRACT_MODEL;
    else process.env.OPENEXTRACT_MODEL = previous;
    const pathForm = defaultForm({ source: "./a.txt" });
    expect(resolveTuiMediaType(pathForm)).toBeUndefined();
  });

  it("resolves paste input as UTF-8 bytes", () => {
    const form = defaultForm();
    form.source = "Invoice from Acme";
    const input = resolveTuiInput(form);
    expect(Buffer.isBuffer(input)).toBe(true);
    expect(Buffer.from(input as Buffer).toString("utf8")).toBe("Invoice from Acme");
    expect(resolveTuiMediaType(form)).toBe("text/plain");
  });

  it("validates empty sources", () => {
    expect(validateForm(defaultForm())).toMatch(/Paste some text/);
    const pathForm = defaultForm({ source: "  " });
    pathForm.sourceKind = "path";
    pathForm.source = "";
    expect(validateForm(pathForm)).toMatch(/local path/);
    const pathOk = defaultForm({ source: "./a.txt", style: "nope" });
    expect(pathOk.style).toBe("direct");
    expect(resolveTuiInput(pathOk)).toBe("./a.txt");
    expect(presetIdForSpec("custom: string")).toBe("custom");
    pathOk.mediaType = "text/csv";
    expect(resolveTuiMediaType(pathOk)).toBe("text/csv");
    pathOk.model = "";
    expect(validateForm(pathOk)).toMatch(/model id/);
    pathOk.model = "openai/gpt-5.5";
    pathOk.schemaSpec = "  ";
    expect(validateForm(pathOk)).toMatch(/output shape/);
  });

  it("extracts with the form schema and reports usage", async () => {
    const form = defaultForm();
    form.source = "Ada is 36";
    form.schemaSpec = "name: string\nage: number";
    const result = await runTuiExtract(form, {
      resolveSchema: async () => Person,
      extractWithUsage: async () => ({
        output: { name: "Ada", age: 36 },
        usage: { inputTokens: 4, outputTokens: 6, totalTokens: 10 },
      }),
    });
    expect(result.output).toEqual({ name: "Ada", age: 36 });
    expect(formatResultJson(result.output)).toContain('"name": "Ada"');
    expect(formatUsage(result.usage, 1500)).toBe("10 tokens · 1.5s");
  });

  it("uses the default schema resolver", async () => {
    const extract = await import("../src/extract.js");
    const spy = vi.spyOn(extract, "extractWithUsage").mockResolvedValue({
      output: { label: "ok" },
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
    });
    const form = defaultForm();
    form.source = "Ada is 36";
    form.schemaSpec = "label: string";
    await expect(runTuiExtract(form)).resolves.toMatchObject({ output: { label: "ok" } });
    spy.mockRestore();
    await expect(runTuiExtract(defaultForm())).rejects.toThrow(/Paste some text/);
  });

  it("names saved results with a stable timestamp", () => {
    expect(resultFilename(new Date("2026-08-13T23:55:01.123Z"))).toBe(
      "openextract-2026-08-13T23-55-01Z.json",
    );
  });
});

describe("launchTui", () => {
  it("explains the runtime requirement when OpenTUI cannot start", async () => {
    if (process.versions.bun) return;
    const errors: string[] = [];
    const spy = (message?: unknown) => {
      errors.push(String(message ?? ""));
    };
    const originalError = console.error;
    console.error = spy;
    try {
      await expect(launchTui()).resolves.toBe(1);
    } finally {
      console.error = originalError;
    }
    expect(errors.join("\n")).toContain(TUI_RUNTIME_HELP.slice(0, 40));
  });

});
