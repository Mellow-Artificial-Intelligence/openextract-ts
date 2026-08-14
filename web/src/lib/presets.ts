export const STYLES = ["direct", "search", "code"] as const;
export type StyleName = (typeof STYLES)[number];

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
