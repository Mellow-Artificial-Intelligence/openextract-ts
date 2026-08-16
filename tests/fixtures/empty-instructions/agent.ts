import { defineAgent } from "../../../src/agent.js";

export default defineAgent({
  description: "Empty instructions file.",
  model: "openai/gpt-5.5",
  instructions: "Keep mine.",
});
