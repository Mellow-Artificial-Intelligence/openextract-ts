import { defineAgent, defineRemoteAgent } from "../../src/agent.js";

export const invoice = defineAgent({
  description: "Extracts invoice totals and line items.",
  model: "openai/gpt-5.5",
  style: "direct",
  instructions: "Pull totals.",
});

export const search = defineAgent({
  description: "Searches UTF-8 text for invoice fields.",
  model: "xai/grok-4.6",
  style: "search",
});

export const team = defineAgent({
  description: "Invoice team with search and direct specialists.",
  subagents: [invoice, search],
});

export const remote = defineRemoteAgent({
  url: "https://extract.example.com",
  description: "Remote OCR extraction specialist.",
});
