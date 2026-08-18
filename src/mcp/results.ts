import { errorPayload } from "../errors.js";
import { ModelError, RemoteAgentError, RetryableExtractionError } from "../exceptions.js";

export function serializeError(error: unknown): Record<string, unknown> {
  const payload: Record<string, unknown> = errorPayload(error);
  if (error instanceof RetryableExtractionError) {
    payload.statusCode = error.statusCode;
    payload.retryable = error.retryable;
  }
  if (error instanceof ModelError) {
    payload.provider = error.provider;
    payload.retryAfter = error.retryAfter;
  }
  if (error instanceof RemoteAgentError) {
    payload.url = error.url;
  }
  return payload;
}

/** Errors travel back as tool results, not exceptions, so hosts can read the typed payload. */
export function serializeItem(item: unknown): unknown {
  return item instanceof Error ? serializeError(item) : item;
}

export function toolResult(payload: unknown, isError = false) {
  return {
    isError,
    content: [{ type: "text" as const, text: JSON.stringify(payload) }],
  };
}

/** Runs a tool body, turning thrown errors into an error tool result. */
export async function runTool(run: () => Promise<unknown>) {
  try {
    return toolResult(await run());
  } catch (error) {
    return toolResult(serializeError(error), true);
  }
}

export function userMessage(text: string, instructions?: string) {
  return {
    messages: [
      {
        role: "user" as const,
        content: {
          type: "text" as const,
          text: instructions ? `${text} Instructions: ${instructions}` : text,
        },
      },
    ],
  };
}
