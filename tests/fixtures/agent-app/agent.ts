import { defineAgent } from "../../../src/agent.js";
import { z } from "zod";

export default defineAgent({
  description: "Root invoice agent.",
  model: "openai/gpt-5.5",
  outputSchema: z.object({ vendor: z.string() }),
});
