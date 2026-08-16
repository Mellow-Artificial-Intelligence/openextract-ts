import { extract, loadAgent } from "../../src/index.js";

const inputFile = process.argv[2];
if (!inputFile) {
  console.error("Usage: npx tsx examples/advanced/agents.ts <path-to-file>");
  process.exit(1);
}

const agent = await loadAgent(new URL("../agents", import.meta.url).pathname);
const output = await extract(agent, inputFile);
console.log(JSON.stringify(output, null, 2));
