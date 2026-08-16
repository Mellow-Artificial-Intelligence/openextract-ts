import { parseRunnableSystem } from "@/lib/agent-system";
import { hasGatewayAuth } from "@/lib/gateway";
import {
  COOKBOOK_RECIPES,
  clampCookbookSize,
  listCookbookModels,
  pickCookbookModel,
  runCookbook,
  runExtractionSystem,
  type CookbookEvent,
} from "@/lib/cookbook";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET() {
  const models = await listCookbookModels();
  return Response.json({
    recipes: COOKBOOK_RECIPES,
    models,
    model: pickCookbookModel(models),
  });
}

export async function POST(req: Request) {
  if (!hasGatewayAuth()) {
    return Response.json(
      { error: "Set AI_GATEWAY_API_KEY in web/.env.local to run locally." },
      { status: 401 },
    );
  }

  const body = (await req.json()) as {
    system?: unknown;
    recipeId?: unknown;
    model?: unknown;
    docs?: unknown;
    size?: unknown;
  };

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const emit = (event: CookbookEvent) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };
      try {
        if (body.system != null) {
          const system = parseRunnableSystem(body.system);
          if (typeof system === "string") {
            emit({ type: "error", message: system });
            return;
          }
          await runExtractionSystem({ system, emit, signal: req.signal });
          return;
        }
        const recipeId = typeof body.recipeId === "string" ? body.recipeId : "";
        const recipe = COOKBOOK_RECIPES.find((item) => item.id === recipeId);
        if (!recipe || recipe.kind !== "swarm") {
          emit({ type: "error", message: "Unknown recipe." });
          return;
        }
        const docs = Array.isArray(body.docs)
          ? body.docs.filter((item): item is string => typeof item === "string")
          : recipe.docs;
        const models = await listCookbookModels();
        const model =
          typeof body.model === "string" ? pickCookbookModel(models, body.model) : pickCookbookModel(models);
        const size = clampCookbookSize(recipe, typeof body.size === "number" ? body.size : recipe.defaultSize);
        await runCookbook({ recipeId: recipe.id, model, docs, size, emit, signal: req.signal });
      } catch (error) {
        if (!req.signal.aborted) {
          emit({
            type: "error",
            message: error instanceof Error ? error.message : "Cookbook run failed.",
          });
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
