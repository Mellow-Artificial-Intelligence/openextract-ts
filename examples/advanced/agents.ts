import { extract } from "../../src/index.js";
import team from "../agents/team.js";
import { Invoice } from "../schemas.js";

const inputFile = process.argv[2];
if (!inputFile) {
  console.error("Usage: npx tsx examples/advanced/agents.ts <path-to-file>");
  process.exit(1);
}

const output = await extract(Invoice, team, inputFile);
console.log(JSON.stringify(output, null, 2));
