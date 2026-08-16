import { defineAgent } from "../../../src/agent.js";

export default defineAgent({
  description: "Has a bad subagent file.",
  model: "openai/gpt-5.5",
});
