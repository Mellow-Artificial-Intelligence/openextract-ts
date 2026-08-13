import { MockLanguageModelV3 } from "ai/test";
import { z } from "zod";

export const Person = z.object({
  name: z.string(),
  age: z.number(),
});

export function mockUsage(input = 10, output = 20) {
  return {
    inputTokens: {
      total: input,
      noCache: input,
      cacheRead: undefined,
      cacheWrite: undefined,
    },
    outputTokens: { total: output, text: output, reasoning: undefined },
  };
}

export function mockModel(
  output: unknown,
  options: { inputTokens?: number; outputTokens?: number } = {},
) {
  return new MockLanguageModelV3({
    doGenerate: {
      content: [{ type: "text", text: JSON.stringify(output) }],
      finishReason: { unified: "stop", raw: undefined },
      usage: mockUsage(options.inputTokens ?? 10, options.outputTokens ?? 20),
      warnings: [],
    },
  });
}

export function mockModelFn(
  fn: () => { output: unknown } | Promise<{ output: unknown }>,
) {
  return new MockLanguageModelV3({
    doGenerate: async () => {
      const { output } = await fn();
      return {
        content: [{ type: "text" as const, text: JSON.stringify(output) }],
        finishReason: { unified: "stop" as const, raw: undefined },
        usage: mockUsage(),
        warnings: [],
      };
    },
  });
}
