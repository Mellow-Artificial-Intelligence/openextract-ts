import { writeFile } from "node:fs/promises";
import {
  BoxRenderable,
  InputRenderable,
  InputRenderableEvents,
  TabSelectRenderable,
  TabSelectRenderableEvents,
  TextareaRenderable,
  TextRenderable,
  createCliRenderer,
  type CliRenderer,
} from "@opentui/core";
import { toError } from "../errors.js";
import {
  PRESETS,
  PRESET_IDS,
  SOURCE_KINDS,
  STYLES,
  defaultForm,
  formatResultJson,
  formatUsage,
  presetIdForSpec,
  resultFilename,
  runTuiExtract,
  type PresetId,
  type SourceKind,
  type StyleName,
  type TuiForm,
  type TuiLaunchOptions,
} from "./form.js";

const theme = {
  bg: "#0f1419",
  panel: "#151b23",
  border: "#2d3a4a",
  borderFocus: "#2dd4bf",
  title: "#e6edf3",
  muted: "#8b9bab",
  accent: "#5eead4",
  inputBg: "#1c2430",
  inputFocus: "#243044",
  text: "#e6edf3",
  ok: "#4ade80",
  warn: "#fbbf24",
  error: "#f87171",
  cursor: "#5eead4",
};

type FocusId =
  | "sourceKind"
  | "source"
  | "instructions"
  | "model"
  | "style"
  | "preset"
  | "schema"
  | "result";

const FOCUS_ORDER: FocusId[] = [
  "sourceKind",
  "source",
  "instructions",
  "model",
  "style",
  "preset",
  "schema",
  "result",
];

function setEditorText(editor: TextareaRenderable, value: string): void {
  if (editor.plainText !== value) editor.setText(value);
}

function hasGatewayKey(): boolean {
  return Boolean(process.env.AI_GATEWAY_API_KEY?.trim() || process.env.VERCEL_OIDC_TOKEN?.trim());
}

export async function runApp(
  options: TuiLaunchOptions = {},
  existingRenderer?: CliRenderer,
): Promise<CliRenderer> {
  const form: TuiForm = defaultForm(options);
  let focus: FocusId = form.source ? "schema" : "source";
  let busy = false;
  let lastJson = "";
  let status = hasGatewayKey()
    ? "Paste or point at a source, then Ctrl+E to extract."
    : "Set AI_GATEWAY_API_KEY (or Vercel OIDC) before extracting.";
  let statusTone: "muted" | "ok" | "warn" | "error" = hasGatewayKey() ? "muted" : "warn";

  const renderer =
    existingRenderer ??
    (await createCliRenderer({
      exitOnCtrlC: true,
      useMouse: true,
      autoFocus: true,
      backgroundColor: theme.bg,
    }));

  const headerTitle = new TextRenderable(renderer, {
    content: "openextract",
    fg: theme.accent,
  });
  const headerSub = new TextRenderable(renderer, {
    content: "  structured data from any file, URL, or pasted text",
    fg: theme.muted,
  });
  const header = new BoxRenderable(renderer, {
    height: 1,
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 0,
    backgroundColor: theme.bg,
  });
  header.add(headerTitle);
  header.add(headerSub);

  const sourceKindSelect = new TabSelectRenderable(renderer, {
    height: 2,
    showDescription: false,
    showUnderline: true,
    wrapSelection: true,
    tabWidth: 14,
    backgroundColor: theme.panel,
    focusedBackgroundColor: theme.inputFocus,
    selectedBackgroundColor: theme.inputFocus,
    selectedTextColor: theme.accent,
    textColor: theme.muted,
    options: [
      { name: "path / url", description: "", value: "path" },
      { name: "paste text", description: "", value: "paste" },
    ],
  });
  sourceKindSelect.setSelectedIndex(form.sourceKind === "paste" ? 1 : 0);

  const pathInput = new InputRenderable(renderer, {
    placeholder: " ./report.pdf  or  https://example.com/doc",
    value: form.sourceKind === "path" ? form.source : "",
    backgroundColor: theme.inputBg,
    focusedBackgroundColor: theme.inputFocus,
    textColor: theme.text,
    cursorColor: theme.cursor,
    maxLength: 4000,
  });

  const pasteEditor = new TextareaRenderable(renderer, {
    flexGrow: 1,
    initialValue: form.sourceKind === "paste" ? form.source : "",
    placeholder: "Paste an email, article, receipt, transcript, or any other text…",
    backgroundColor: theme.inputBg,
    focusedBackgroundColor: theme.inputFocus,
    textColor: theme.text,
    cursorColor: theme.cursor,
    wrapMode: "word",
    keyBindings: [{ name: "return", ctrl: true, action: "submit" }],
  });

  const sourceSlot = new BoxRenderable(renderer, {
    flexGrow: 1,
    minHeight: 1,
    flexDirection: "column",
  });

  const instructionsEditor = new TextareaRenderable(renderer, {
    height: 2,
    initialValue: form.instructions,
    placeholder: "Instructions — what to pull, what to ignore…",
    backgroundColor: theme.inputBg,
    focusedBackgroundColor: theme.inputFocus,
    textColor: theme.text,
    cursorColor: theme.cursor,
    wrapMode: "word",
    keyBindings: [{ name: "return", ctrl: true, action: "submit" }],
  });

  const modelInput = new InputRenderable(renderer, {
    placeholder: "model  openai/gpt-5.5",
    value: form.model,
    backgroundColor: theme.inputBg,
    focusedBackgroundColor: theme.inputFocus,
    textColor: theme.text,
    cursorColor: theme.cursor,
  });

  const styleSelect = new TabSelectRenderable(renderer, {
    height: 2,
    showDescription: false,
    showUnderline: true,
    wrapSelection: true,
    tabWidth: 9,
    backgroundColor: theme.panel,
    focusedBackgroundColor: theme.inputFocus,
    selectedBackgroundColor: theme.inputFocus,
    selectedTextColor: theme.accent,
    textColor: theme.muted,
    options: STYLES.map((name) => ({
      name,
      description: "",
      value: name,
    })),
  });
  styleSelect.setSelectedIndex(Math.max(0, STYLES.indexOf(form.style)));

  const sourcePanel = new BoxRenderable(renderer, {
    flexGrow: 1,
    flexBasis: 0,
    flexDirection: "column",
    border: true,
    borderStyle: "rounded",
    borderColor: theme.border,
    title: " Source ",
    titleColor: theme.muted,
    backgroundColor: theme.panel,
    padding: 1,
    gap: 1,
  });
  const settingsRow = new BoxRenderable(renderer, {
    height: 2,
    flexShrink: 0,
    flexDirection: "row",
    gap: 1,
    alignItems: "flex-start",
  });
  modelInput.flexGrow = 1;
  styleSelect.width = 36;
  settingsRow.add(modelInput);
  settingsRow.add(styleSelect);

  sourcePanel.add(sourceKindSelect);
  sourcePanel.add(sourceSlot);
  sourcePanel.add(instructionsEditor);
  sourcePanel.add(settingsRow);

  const presetSelect = new TabSelectRenderable(renderer, {
    height: 2,
    showDescription: false,
    showUnderline: true,
    wrapSelection: true,
    tabWidth: 10,
    backgroundColor: theme.panel,
    focusedBackgroundColor: theme.inputFocus,
    selectedBackgroundColor: theme.inputFocus,
    selectedTextColor: theme.accent,
    textColor: theme.muted,
    options: PRESET_IDS.map((id) => ({
      name: PRESETS[id].label,
      description: "",
      value: id,
    })),
  });
  presetSelect.setSelectedIndex(Math.max(0, PRESET_IDS.indexOf(presetIdForSpec(form.schemaSpec))));

  const schemaEditor = new TextareaRenderable(renderer, {
    flexGrow: 1,
    initialValue: form.schemaSpec,
    placeholder: "title: string\ncount: number\nitems: [{ name: string }]",
    backgroundColor: theme.inputBg,
    focusedBackgroundColor: theme.inputFocus,
    textColor: theme.text,
    cursorColor: theme.cursor,
    wrapMode: "none",
    keyBindings: [{ name: "return", ctrl: true, action: "submit" }],
  });

  const schemaHelp = new TextRenderable(renderer, {
    content: "Field list, JSON example, JSON Schema, or ./file.ts:Export",
    fg: theme.muted,
    height: 1,
    flexShrink: 0,
  });

  const schemaPanel = new BoxRenderable(renderer, {
    flexGrow: 1,
    flexBasis: 0,
    flexDirection: "column",
    border: true,
    borderStyle: "rounded",
    borderColor: theme.border,
    title: " Schema ",
    titleColor: theme.muted,
    backgroundColor: theme.panel,
    padding: 1,
    gap: 1,
  });
  schemaPanel.add(presetSelect);
  schemaPanel.add(schemaEditor);
  schemaPanel.add(schemaHelp);

  const resultEditor = new TextareaRenderable(renderer, {
    flexGrow: 1,
    initialValue: "",
    placeholder: "Extracted JSON will land here.",
    backgroundColor: theme.inputBg,
    focusedBackgroundColor: theme.inputFocus,
    textColor: theme.text,
    cursorColor: theme.cursor,
    wrapMode: "none",
    keyBindings: [{ name: "return", ctrl: true, action: "submit" }],
  });

  const resultMeta = new TextRenderable(renderer, { content: "", fg: theme.muted });
  const resultPanel = new BoxRenderable(renderer, {
    flexGrow: 1,
    flexBasis: 0,
    flexDirection: "column",
    border: true,
    borderStyle: "rounded",
    borderColor: theme.border,
    title: " Result ",
    titleColor: theme.muted,
    backgroundColor: theme.panel,
    padding: 1,
    gap: 1,
  });
  resultPanel.add(resultEditor);
  resultPanel.add(resultMeta);

  const footerHint = new TextRenderable(renderer, {
    content: "tab fields   ^e extract   ^s save   ^c quit",
    fg: theme.muted,
  });
  const footerStatus = new TextRenderable(renderer, { content: status, fg: theme.muted });
  const footer = new BoxRenderable(renderer, {
    height: 2,
    flexShrink: 0,
    flexDirection: "column",
    backgroundColor: theme.bg,
  });
  footer.add(footerHint);
  footer.add(footerStatus);

  const columns = new BoxRenderable(renderer, {
    flexGrow: 2,
    flexBasis: 0,
    flexDirection: "row",
    gap: 1,
  });
  columns.add(sourcePanel);
  columns.add(schemaPanel);

  const root = new BoxRenderable(renderer, {
    width: "100%",
    height: "100%",
    flexDirection: "column",
    backgroundColor: theme.bg,
    padding: 1,
    gap: 1,
  });
  root.add(header);
  root.add(columns);
  root.add(resultPanel);
  root.add(footer);
  renderer.root.add(root);

  const panels: Record<FocusId, BoxRenderable> = {
    sourceKind: sourcePanel,
    source: sourcePanel,
    instructions: sourcePanel,
    model: sourcePanel,
    style: sourcePanel,
    preset: schemaPanel,
    schema: schemaPanel,
    result: resultPanel,
  };

  function syncSourceSlot(): void {
    if (sourceSlot.getChildren().includes(pathInput)) sourceSlot.remove(pathInput);
    if (sourceSlot.getChildren().includes(pasteEditor)) sourceSlot.remove(pasteEditor);
    sourceSlot.add(form.sourceKind === "path" ? pathInput : pasteEditor);
  }

  function readForm(): TuiForm {
    const source =
      form.sourceKind === "path" ? pathInput.value : pasteEditor.plainText;
    return {
      ...form,
      source,
      schemaSpec: schemaEditor.plainText,
      model: modelInput.value,
      instructions: instructionsEditor.plainText,
      style: (styleSelect.getSelectedOption()?.value as StyleName) ?? form.style,
    };
  }

  function paintStatus(): void {
    const color =
      statusTone === "ok"
        ? theme.ok
        : statusTone === "warn"
          ? theme.warn
          : statusTone === "error"
            ? theme.error
            : theme.muted;
    footerStatus.content = status;
    footerStatus.fg = color;
  }

  function paintFocus(): void {
    for (const panel of [sourcePanel, schemaPanel, resultPanel]) {
      panel.borderColor = theme.border;
      panel.titleColor = theme.muted;
    }
    const active = panels[focus];
    active.borderColor = theme.borderFocus;
    active.titleColor = theme.accent;
    const widget = widgetFor(focus);
    widget?.focus();
  }

  function widgetFor(id: FocusId): { focus(): void } | null {
    switch (id) {
      case "sourceKind":
        return sourceKindSelect;
      case "source":
        return form.sourceKind === "path" ? pathInput : pasteEditor;
      case "instructions":
        return instructionsEditor;
      case "model":
        return modelInput;
      case "style":
        return styleSelect;
      case "preset":
        return presetSelect;
      case "schema":
        return schemaEditor;
      case "result":
        return resultEditor;
    }
  }

  function moveFocus(delta: number): void {
    const index = FOCUS_ORDER.indexOf(focus);
    focus = FOCUS_ORDER[(index + delta + FOCUS_ORDER.length) % FOCUS_ORDER.length]!;
    paintFocus();
  }

  async function extractNow(): Promise<void> {
    if (busy) return;
    const next = readForm();
    Object.assign(form, next);
    busy = true;
    status = "Extracting…";
    statusTone = "muted";
    paintStatus();
    try {
      const result = await runTuiExtract(next);
      lastJson = formatResultJson(result.output);
      setEditorText(resultEditor, lastJson);
      resultMeta.content = formatUsage(result.usage, result.durationMs);
      status = "Done. Ctrl+S saves the JSON.";
      statusTone = "ok";
      focus = "result";
      paintFocus();
    } catch (error) {
      status = toError(error).message;
      statusTone = "error";
    } finally {
      busy = false;
      paintStatus();
    }
  }

  async function saveNow(): Promise<void> {
    const json = resultEditor.plainText.trim() || lastJson;
    if (!json) {
      status = "Nothing to save yet. Extract first.";
      statusTone = "warn";
      paintStatus();
      return;
    }
    const filename = resultFilename();
    await writeFile(filename, json.replace(/\n?$/, "\n"), "utf8");
    status = `Saved ${filename}`;
    statusTone = "ok";
    paintStatus();
  }

  sourceKindSelect.on(TabSelectRenderableEvents.SELECTION_CHANGED, (_index, option) => {
    const kind = (option?.value ?? option?.name) as SourceKind;
    if (!SOURCE_KINDS.includes(kind) || kind === form.sourceKind) return;
    const current = readForm();
    form.sourceKind = kind;
    form.source = current.source;
    pathInput.value = current.source.split("\n", 1)[0]!;
    setEditorText(pasteEditor, current.source);
    syncSourceSlot();
    paintFocus();
  });

  presetSelect.on(TabSelectRenderableEvents.SELECTION_CHANGED, (_index, option) => {
    const id = (option?.value ?? "custom") as PresetId;
    if (!PRESET_IDS.includes(id) || id === "custom") return;
    setEditorText(schemaEditor, PRESETS[id].spec);
  });

  for (const input of [pathInput, modelInput]) {
    input.on(InputRenderableEvents.ENTER, () => {
      void extractNow();
    });
  }
  for (const editor of [pasteEditor, instructionsEditor, schemaEditor, resultEditor]) {
    editor.onSubmit = () => {
      void extractNow();
    };
  }

  renderer.keyInput.on("keypress", (key) => {
    if (key.name === "tab") {
      key.preventDefault();
      moveFocus(key.shift ? -1 : 1);
      return;
    }
    if (key.ctrl && key.name === "e") {
      key.preventDefault();
      void extractNow();
      return;
    }
    if (key.ctrl && key.name === "s") {
      key.preventDefault();
      void saveNow();
    }
  });

  for (const editor of [pasteEditor, instructionsEditor, schemaEditor, resultEditor, pathInput, modelInput]) {
    editor.traits = { capture: ["submit"] };
  }
  for (const compact of [sourceKindSelect, styleSelect, presetSelect, modelInput, instructionsEditor]) {
    compact.flexShrink = 0;
  }

  syncSourceSlot();
  paintStatus();
  paintFocus();

  if (!existingRenderer) {
    await new Promise<void>((resolve) => {
      renderer.on("destroy", () => resolve());
    });
  }
  return renderer;
}
