export const STYLES = ["direct", "search", "code"] as const;
export type StyleName = (typeof STYLES)[number];

/** Shared by the style picker and the system prompt so both describe the same behaviour. */
export const STYLE_DETAILS: Record<StyleName, { label: string; description: string }> = {
  direct: {
    label: "Direct",
    description: "Read the full source and extract in one pass.",
  },
  search: {
    label: "Search",
    description: "Scan for the most relevant passages before extracting.",
  },
  code: {
    label: "Code",
    description: "Reason over the text as data (counts, totals, lists) before extracting.",
  },
};

export const PRESETS = {
  document: {
    label: "Document",
    spec: "title: string\nsummary: string\nlanguage: string",
  },
  invoice: {
    label: "Invoice",
    spec: "vendor: string\ntotal: number\nlineItems: [{ description: string, amount: number }]",
  },
  contact: {
    label: "Contact",
    spec: "name: string\nemail: string\nrole: string\ncompany: string",
  },
  facts: {
    label: "Facts",
    spec: "facts: [{ name: string, value: string }]",
  },
  custom: {
    label: "Custom",
    spec: "field: string",
  },
} as const;

export type PresetId = keyof typeof PRESETS;
export const PRESET_IDS = Object.keys(PRESETS) as PresetId[];

export function presetIdForSpec(spec: string): PresetId {
  const normalized = spec.trim();
  for (const id of PRESET_IDS) {
    if (id !== "custom" && PRESETS[id].spec === normalized) return id;
  }
  return "custom";
}

export const SUGGESTIONS = [
  "Extract structured fields from this text.",
  "Summarize the document and list key facts.",
  "Pull vendor, totals, and line items.",
];
