import { extract } from "../../src/index.js";
import { DocumentInfo } from "../schemas.js";

const inputFile = process.argv[2];
if (!inputFile) {
  console.error("Usage: npx tsx examples/basic/local-file.ts <path-to-file>");
  process.exit(1);
}

const result = await extract(DocumentInfo, "xai/grok-4.6", inputFile, {
  instructions: "Read the document and return its title, a two-sentence summary, and the primary language.",
});

console.log(JSON.stringify(result, null, 2));
