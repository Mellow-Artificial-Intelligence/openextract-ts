import { defineAgent } from "../../../../../src/agent.js";

export default defineAgent({
  description: "Search specialist.",
  model: "xai/grok-4.6",
  style: "search",
});
