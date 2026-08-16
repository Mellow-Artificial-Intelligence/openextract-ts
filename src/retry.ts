import { validateRetryOptions } from "./config.js";
import { ModelError, RemoteAgentError } from "./exceptions.js";

export function retryDelay(
  retryBackoff: number,
  retryMaxBackoff: number,
  attempt: number,
  retryAfter: number | null,
): number {
  if (retryAfter != null) return Math.min(retryAfter, retryMaxBackoff);
  const delay = retryBackoff * 2 ** attempt * (1 + Math.random() * 0.25);
  return Number.isFinite(delay) ? Math.min(delay, retryMaxBackoff) : retryMaxBackoff;
}

export async function runWithRetries<R>(
  fn: () => Promise<R>,
  options: {
    maxRetries: number;
    retryBackoff: number;
    retryMaxBackoff: number;
  },
): Promise<R> {
  validateRetryOptions(options.maxRetries, options.retryBackoff, options.retryMaxBackoff);
  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (error) {
      const retryable =
        (error instanceof ModelError || error instanceof RemoteAgentError) && error.retryable;
      if (!retryable || attempt >= options.maxRetries) throw error;
      await new Promise((resolve) =>
        setTimeout(
          resolve,
          retryDelay(
            options.retryBackoff,
            options.retryMaxBackoff,
            attempt,
            error instanceof ModelError ? error.retryAfter : null,
          ) * 1000,
        ),
      );
      attempt += 1;
    }
  }
}
