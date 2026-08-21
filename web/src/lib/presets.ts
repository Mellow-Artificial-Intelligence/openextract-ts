export const STYLES = ["direct", "search", "code", "sandbox"] as const;
export type StyleName = (typeof STYLES)[number];
export const GATEWAY_STYLES = ["direct", "search", "code"] as const;
export type GatewayStyle = (typeof GATEWAY_STYLES)[number];

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
  sandbox: {
    label: "Sandbox",
    description: "Run Claude Code or Codex in a Vercel Sandbox and extract from the files there.",
  },
};

/** Sample sources that fill the form. Clicking one generates a schema. */
export const EXAMPLES = [
  {
    label: "Invoice line items",
    query: "Invoice line items with description, quantity, unit price, and amount",
    text: `INVOICE #1042
From: Acme Supplies
Date: 2026-03-12

2 × Widget A          $40.00
1 × Widget B          $25.50
Total due             $65.50`,
  },
  {
    label: "Contacts",
    query: "People with name, email, role, and company",
    text: `Jordan Lee
Product Lead, Northwind
jordan@northwind.dev`,
  },
  {
    label: "Action items",
    query: "Action items with owner, task, and due date",
    text: `Quarterly Notes

The team shipped the billing API in March. Primary language: English.
Ada owns usage-based invoicing, due 12 April.
Sam will draft the customer email by Friday.`,
  },
] as const;
