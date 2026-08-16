import { defineAgent } from "../../src/index.js";

export const invoice = defineAgent({
  description: "Extracts invoice totals and line items.",
  model: "openai/gpt-5.5",
  style: "direct",
  instructions: "Pull vendor, totals, and line items.",
});

export default invoice;
