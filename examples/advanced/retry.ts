import { extractWithUsage } from "../../src/index.js";
import { DocumentInfo } from "../schemas.js";

const inputFile = process.argv[2];
if (!inputFile) {
  console.error("Usage: npx tsx examples/advanced/retry.ts <path-to-file>");
  process.exit(1);
}

const { output, usage } = await extractWithUsage(DocumentInfo, "xai/grok-4.6", inputFile, {
  maxRetries: 3,
  instructions: "Summarize the document and report its language.",
});

console.log(JSON.stringify({ output, usage }, null, 2));
