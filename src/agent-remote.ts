import { z } from "zod";
import type { DefinedRemoteAgent } from "./agent.js";
import { toError } from "./errors.js";
import { RemoteAgentError } from "./exceptions.js";
import type { ResolvedExtractOptions } from "./pipeline.js";
import { runWithRetries } from "./retry.js";
import type { Usage } from "./types.js";

export function joinAgentUrl(base: string, path: string): string {
  const root = base.trim().replace(/\/+$/, "");
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${root}${suffix}`;
}

export async function resolveAgentUrl(url: DefinedRemoteAgent["url"]): Promise<string> {
  const value = typeof url === "function" ? await url() : url;
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("remote agent url must resolve to a non-empty string.");
  }
  const href = value.trim();
  let parsed: URL;
  try {
    parsed = new URL(href);
  } catch {
    throw new Error(`remote agent url is invalid: ${href}`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("remote agent url must be http or https.");
  }
  return href;
}

async function resolveHeaders(agent: DefinedRemoteAgent): Promise<Record<string, string>> {
  const extra = agent.headers == null ? {} : typeof agent.headers === "function" ? await agent.headers() : agent.headers;
  const auth = agent.auth ? await agent.auth() : {};
  return {
    accept: "application/json",
    "content-type": "application/json",
    ...extra,
    ...auth,
  };
}

function usageFrom(value: unknown): Usage {
  if (!value || typeof value !== "object") {
    return { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
  }
  const usage = value as Usage;
  return {
    inputTokens: Number(usage.inputTokens) || 0,
    outputTokens: Number(usage.outputTokens) || 0,
    totalTokens: Number(usage.totalTokens) || 0,
  };
}

export async function runRemoteExtraction<T>(
  schema: z.ZodType<T>,
  agent: DefinedRemoteAgent,
  data: Uint8Array,
  mediaType: string,
  options: ResolvedExtractOptions,
): Promise<{ output: T; usage: Usage; attempts: number }> {
  const url = joinAgentUrl(await resolveAgentUrl(agent.url), agent.path);
  const body = JSON.stringify({
    schema: z.toJSONSchema(schema),
    input: { data: Buffer.from(data).toString("base64"), mediaType },
    instructions: options.instructions,
    style: options.style,
  });
  let attempts = 0;
  const result = await runWithRetries(
    async () => {
      attempts += 1;
      let response: Response;
      try {
        response = await fetch(url, {
          method: "POST",
          headers: await resolveHeaders(agent),
          body,
          signal: options.timeoutMs != null ? AbortSignal.timeout(options.timeoutMs) : undefined,
        });
      } catch (error) {
        throw new RemoteAgentError(`Remote agent request failed: ${toError(error).message}`, {
          url,
          retryable: true,
        });
      }
      const text = await response.text();
      let payload: unknown;
      try {
        payload = text ? JSON.parse(text) : undefined;
      } catch {
        throw new RemoteAgentError(`Remote agent returned non-JSON (${response.status}).`, {
          url,
          statusCode: response.status,
          retryable: response.status >= 500,
        });
      }
      if (!response.ok) {
        const message =
          payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
            ? payload.error
            : `Remote agent failed with status ${response.status}.`;
        throw new RemoteAgentError(message, {
          url,
          statusCode: response.status,
          retryable: response.status === 429 || response.status >= 500,
        });
      }
      if (!payload || typeof payload !== "object") {
        throw new RemoteAgentError("Remote agent returned an empty response.", { url, statusCode: response.status });
      }
      const record = payload as Record<string, unknown>;
      if (typeof record.error === "string") {
        throw new RemoteAgentError(record.error, { url, statusCode: response.status });
      }
      return {
        output: schema.parse("output" in record ? record.output : payload),
        usage: usageFrom(record.usage),
      };
    },
    {
      maxRetries: options.maxRetries,
      retryBackoff: options.retryBackoff,
      retryMaxBackoff: options.retryMaxBackoff,
    },
  );
  return { ...result, attempts };
}
