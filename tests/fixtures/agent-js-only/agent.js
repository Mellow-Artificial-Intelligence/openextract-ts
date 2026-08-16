import { defineAgent } from "../../../src/agent.js";

export default defineAgent({
  description: "JS-only agent.",
  model: "openai/gpt-5.5",
});
