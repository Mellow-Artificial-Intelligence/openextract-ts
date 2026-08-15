import { start } from "workflow/api";
import { extractWorkflow } from "openextract/workflow";

/**
 * Next.js App Router example. Wrap `next.config` with `withWorkflow()` from
 * `workflow/next` and set `transpilePackages: ["openextract"]`.
 *
 *   POST /api/extract
 *   { "schema": { "type": "object", "properties": { "summary": { "type": "string" } } },
 *     "model": "openai/gpt-5.5",
 *     "input": { "source": "https://example.com/document.pdf" } }
 */
export async function POST(request: Request) {
  const input = await request.json();
  const run = await start(extractWorkflow, [input]);
  const result = await run.returnValue;
  return Response.json({ runId: run.runId, ...result });
}
