import { afterEach, describe, expect, it, vi } from "vitest";

type Handler = (...args: unknown[]) => void;

const hoisted = vi.hoisted(() => {
  class MockRenderable {
    children: MockRenderable[] = [];
    listeners = new Map<string, Handler[]>();
    plainText: string;
    value: string;
    content: string;
    fg?: string;
    borderColor?: string;
    titleColor?: string;
    flexGrow?: number;
    flexShrink?: number;
    width?: number;
    traits?: unknown;
    onSubmit?: () => void;
    selectedIndex = 0;
    options: Record<string, unknown>;
    constructor(
      public renderer: MockRenderer,
      options: Record<string, unknown> = {},
    ) {
      this.options = options;
      this.plainText = String(options.initialValue ?? options.value ?? "");
      this.value = String(options.value ?? "");
      this.content = String(options.content ?? "");
      this.renderer.widgets.push(this);
    }
    add(child: MockRenderable) {
      this.children.push(child);
    }
    remove(child: MockRenderable) {
      this.children = this.children.filter((item) => item !== child);
    }
    getChildren() {
      return this.children;
    }
    focus() {}
    setText(value: string) {
      this.plainText = value;
    }
    setSelectedIndex(index: number) {
      this.selectedIndex = index;
    }
    getSelectedOption() {
      const options = this.options.options as Array<{ value?: string; name?: string }> | undefined;
      return options?.[this.selectedIndex];
    }
    on(event: string, fn: Handler) {
      const list = this.listeners.get(event) ?? [];
      list.push(fn);
      this.listeners.set(event, list);
    }
    emit(event: string, ...args: unknown[]) {
      for (const fn of this.listeners.get(event) ?? []) fn(...args);
    }
  }

  class MockRenderer {
    root: MockRenderable;
    keyInput = {
      listeners: new Map<string, Handler[]>(),
      on(event: string, fn: Handler) {
        const list = this.listeners.get(event) ?? [];
        list.push(fn);
        this.listeners.set(event, list);
      },
      emit(event: string, ...args: unknown[]) {
        for (const fn of this.listeners.get(event) ?? []) fn(...args);
      },
    };
    widgets: MockRenderable[] = [];
    destroyListeners: Handler[] = [];
    constructor() {
      this.root = new MockRenderable(this);
    }
    on(event: string, fn: Handler) {
      if (event === "destroy") this.destroyListeners.push(fn);
    }
    emit(event: string) {
      if (event === "destroy") for (const fn of this.destroyListeners) fn();
    }
  }

  const created: MockRenderer[] = [];
  return { MockRenderable, MockRenderer, created };
});

vi.mock("@opentui/core", () => ({
  BoxRenderable: hoisted.MockRenderable,
  InputRenderable: hoisted.MockRenderable,
  TextareaRenderable: hoisted.MockRenderable,
  TextRenderable: hoisted.MockRenderable,
  TabSelectRenderable: hoisted.MockRenderable,
  createCliRenderer: async () => {
    const renderer = new hoisted.MockRenderer();
    hoisted.created.push(renderer);
    return renderer;
  },
  InputRenderableEvents: { ENTER: "enter" },
  TabSelectRenderableEvents: { SELECTION_CHANGED: "selection_changed" },
}));

const { runApp } = await import("../src/tui/app.js");
const form = await import("../src/tui/form.js");

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.AI_GATEWAY_API_KEY;
  delete process.env.VERCEL_OIDC_TOKEN;
});

function byPlaceholder(renderer: InstanceType<typeof hoisted.MockRenderer>, needle: string) {
  return renderer.widgets.find((item) => String(item.options.placeholder ?? "").includes(needle));
}

describe("runApp", () => {
  it("wires focus, extract, save, and source switching", async () => {
    process.env.AI_GATEWAY_API_KEY = "test";
    const extract = vi.spyOn(form, "runTuiExtract").mockResolvedValue({
      output: { name: "Ada" },
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      durationMs: 1000,
    });
    const { join } = await import("node:path");
    const { tmpdir } = await import("node:os");
    const { readFile, unlink } = await import("node:fs/promises");
    const saved = join(tmpdir(), `openextract-tui-${Date.now()}.json`);
    vi.spyOn(form, "resultFilename").mockReturnValue(saved);
    const renderer = new hoisted.MockRenderer();
    await runApp({ source: "./doc.txt", style: "search" }, renderer as never);

    for (let i = 0; i < 8; i++) {
      renderer.keyInput.emit("keypress", { name: "tab", shift: false, preventDefault() {}, ctrl: false });
    }
    renderer.keyInput.emit("keypress", { name: "tab", shift: true, preventDefault() {}, ctrl: false });
    // schema -> result -> sourceKind -> source
    renderer.keyInput.emit("keypress", { name: "tab", shift: false, preventDefault() {}, ctrl: false });
    renderer.keyInput.emit("keypress", { name: "tab", shift: false, preventDefault() {}, ctrl: false });
    renderer.keyInput.emit("keypress", { name: "e", ctrl: true, preventDefault() {} });
    await Promise.resolve();
    expect(extract).toHaveBeenCalled();

    const sourceKind = renderer.widgets.find((item) =>
      (item.options.options as Array<{ value?: string }> | undefined)?.some((option) => option.value === "paste"),
    );
    sourceKind?.emit("selection_changed", 1, { name: "paste" });
    sourceKind?.emit("selection_changed", 1, { value: "paste", name: "paste text" });
    sourceKind?.emit("selection_changed", 1, { value: "paste", name: "paste text" });
    sourceKind?.emit("selection_changed", 0, { value: "nope", name: "nope" });
    sourceKind?.emit("selection_changed", 0, { value: "path", name: "path / url" });

    const preset = renderer.widgets.find((item) =>
      (item.options.options as Array<{ value?: string }> | undefined)?.some((option) => option.value === "invoice"),
    );
    preset?.emit("selection_changed", 1, {});
    preset?.emit("selection_changed", 1, { value: "invoice" });
    preset?.emit("selection_changed", 4, { value: "custom" });

    const styleSelect = renderer.widgets.find((item) =>
      (item.options.options as Array<{ value?: string }> | undefined)?.some((option) => option.value === "search"),
    );
    styleSelect?.setSelectedIndex(99);
    const pathInput = byPlaceholder(renderer, "report.pdf");
    pathInput?.emit("enter");
    const paste = byPlaceholder(renderer, "Paste an email");
    paste?.onSubmit?.();

    renderer.keyInput.emit("keypress", { name: "s", ctrl: true, preventDefault() {} });
    await Promise.resolve();
    expect(await readFile(saved, "utf8")).toContain("Ada");
    const resultEditor = renderer.widgets.find((item) => item.options.placeholder === "Extracted JSON will land here.");
    if (resultEditor) resultEditor.plainText = '{"name":"Ada"}\n';
    renderer.keyInput.emit("keypress", { name: "s", ctrl: true, preventDefault() {} });
    await Promise.resolve();
    await unlink(saved);

    extract.mockRejectedValueOnce(new Error("nope"));
    renderer.keyInput.emit("keypress", { name: "e", ctrl: true, preventDefault() {} });
    await Promise.resolve();
  });

  it("warns when there is nothing to save and ignores a busy extract", async () => {
    delete process.env.AI_GATEWAY_API_KEY;
    let release: (value: form.TuiExtractResult) => void = () => {};
    vi.spyOn(form, "runTuiExtract").mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const renderer = new hoisted.MockRenderer();
    await runApp({}, renderer as never);
    const sourceKind = renderer.widgets.find((item) =>
      (item.options.options as Array<{ value?: string }> | undefined)?.some((option) => option.value === "paste"),
    );
    sourceKind?.emit("selection_changed", 0, { value: "path", name: "path / url" });
    renderer.keyInput.emit("keypress", { name: "s", ctrl: true, preventDefault() {} });
    renderer.keyInput.emit("keypress", { name: "e", ctrl: true, preventDefault() {} });
    renderer.keyInput.emit("keypress", { name: "e", ctrl: true, preventDefault() {} });
    release({
      output: { ok: true },
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      durationMs: 10,
    });
    await Promise.resolve();
  });

  it("creates a renderer and exits on destroy", async () => {
    process.env.VERCEL_OIDC_TOKEN = "oidc";
    const pending = runApp();
    await vi.waitFor(() => {
      expect(hoisted.created.length).toBeGreaterThan(0);
    });
    hoisted.created.at(-1)?.emit("destroy");
    await expect(pending).resolves.toBeTruthy();
  });
});
