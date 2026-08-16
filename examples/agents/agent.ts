import { defineAgent } from "../../src/index.js";
import { Invoice } from "../schemas.js";

export default defineAgent({
  description: "Extracts invoice totals and line items.",
  model: "openai/gpt-5.5",
  style: "direct",
  outputSchema: Invoice,
});
