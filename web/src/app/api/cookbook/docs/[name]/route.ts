import { readCookbookDoc } from "@/lib/cookbook";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, context: { params: Promise<{ name: string }> }) {
  const { name } = await context.params;
  const text = await readCookbookDoc(name);
  if (text == null) {
    return Response.json({ error: "Unknown document." }, { status: 404 });
  }
  return new Response(text, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=60",
    },
  });
}
