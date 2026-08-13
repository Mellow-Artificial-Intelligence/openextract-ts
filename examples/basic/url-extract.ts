import { extract } from "../../src/index.js";
import { DocumentInfo } from "../schemas.js";

const inputFile = process.argv[2] ?? "https://example.com";

const result = await extract(DocumentInfo, "xai/grok-4.6", inputFile, {
  instructions: "Return a two-sentence summary and the document's primary language.",
});

console.log(JSON.stringify(result, null, 2));
