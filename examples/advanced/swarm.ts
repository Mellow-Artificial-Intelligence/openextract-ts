import { extractSwarmWithResults } from "../../src/index.js";
import { DocumentInfo } from "../schemas.js";

const inputFile = process.argv[2];
if (!inputFile) {
  console.error("Usage: npx tsx examples/advanced/swarm.ts <path-to-file>");
  process.exit(1);
}

const { output, usage, agents } = await extractSwarmWithResults(
  DocumentInfo,
  "xai/grok-4.6",
  inputFile,
  {
    size: 3,
    reduce: "merge",
    instructions: "Summarize the document and report its language.",
  },
);

console.log(
  JSON.stringify(
    { output, usage, agents: agents.length, failed: agents.filter((item) => item instanceof Error).length },
    null,
    2,
  ),
);
