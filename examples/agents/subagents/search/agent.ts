import { defineAgent } from "../../../../src/index.js";
import { Invoice } from "../../../schemas.js";

export default defineAgent({
  description: "Searches UTF-8 text for invoice fields.",
  model: "xai/grok-4.6",
  style: "search",
  outputSchema: Invoice,
});
