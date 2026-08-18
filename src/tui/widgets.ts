import {
  BoxRenderable,
  InputRenderable,
  TabSelectRenderable,
  TextRenderable,
  TextareaRenderable,
  type CliRenderer,
} from "@opentui/core";

export const theme = {
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

export type TabOption = { name: string; description: string; value: string };

const SUBMIT_ON_CTRL_ENTER = [{ name: "return", ctrl: true, action: "submit" as const }];

/** A bordered, titled column that holds one group of fields. */
export function panel(renderer: CliRenderer, title: string): BoxRenderable {
  return new BoxRenderable(renderer, {
    flexGrow: 1,
    flexBasis: 0,
    flexDirection: "column",
    border: true,
    borderStyle: "rounded",
    borderColor: theme.border,
    title,
    titleColor: theme.muted,
    backgroundColor: theme.panel,
    padding: 1,
    gap: 1,
  });
}

export function tabs(
  renderer: CliRenderer,
  config: { tabWidth: number; options: TabOption[] },
): TabSelectRenderable {
  return new TabSelectRenderable(renderer, {
    height: 2,
    showDescription: false,
    showUnderline: true,
    wrapSelection: true,
    tabWidth: config.tabWidth,
    backgroundColor: theme.panel,
    focusedBackgroundColor: theme.inputFocus,
    selectedBackgroundColor: theme.inputFocus,
    selectedTextColor: theme.accent,
    textColor: theme.muted,
    options: config.options,
  });
}

export function textInput(
  renderer: CliRenderer,
  config: { placeholder: string; value: string; extra?: Record<string, unknown> },
): InputRenderable {
  return new InputRenderable(renderer, {
    placeholder: config.placeholder,
    value: config.value,
    backgroundColor: theme.inputBg,
    focusedBackgroundColor: theme.inputFocus,
    textColor: theme.text,
    cursorColor: theme.cursor,
    ...config.extra,
  });
}

/** A multi-line field that submits on Ctrl+Enter. */
export function editor(
  renderer: CliRenderer,
  config: {
    placeholder: string;
    initialValue: string;
    wrapMode: "word" | "none";
    layout: Record<string, number>;
  },
): TextareaRenderable {
  return new TextareaRenderable(renderer, {
    ...config.layout,
    initialValue: config.initialValue,
    placeholder: config.placeholder,
    backgroundColor: theme.inputBg,
    focusedBackgroundColor: theme.inputFocus,
    textColor: theme.text,
    cursorColor: theme.cursor,
    wrapMode: config.wrapMode,
    keyBindings: SUBMIT_ON_CTRL_ENTER,
  });
}

export function label(
  renderer: CliRenderer,
  content: string,
  extra: Record<string, unknown> = {},
): TextRenderable {
  return new TextRenderable(renderer, { content, fg: theme.muted, ...extra });
}

export function row(renderer: CliRenderer, config: Record<string, unknown>): BoxRenderable {
  return new BoxRenderable(renderer, { flexDirection: "row", ...config });
}
