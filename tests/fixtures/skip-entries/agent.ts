import { defineAgent } from "../../../src/agent.js";

export default defineAgent({
  description: "Skips hidden and test files.",
  model: "openai/gpt-5.5",
});
