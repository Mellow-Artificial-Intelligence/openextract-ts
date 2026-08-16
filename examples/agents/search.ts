import { defineAgent } from "../../src/index.js";

export const search = defineAgent({
  description: "Searches UTF-8 text for invoice fields.",
  model: "xai/grok-4.6",
  style: "search",
});

export default search;
