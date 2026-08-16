import { afterEach, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { z } from "zod";
import { isDefinedAgent } from "../src/agent.js";
import { createOpenExtractMcpServer, resolveMcpInput } from "../src/mcp.js";
import { ModelError } from "../src/exceptions.js";
import type { ExtractionInputLike } from "../src/types.js";

const PersonSchema = {
  type: "object",
  properties: { name: { type: "string" }, age: { type: "number" } },
  required: ["name", "age"],
};

async function connect(options: Parameters<typeof createOpenExtractMcpServer>[0] = {}) {
  const server = createOpenExtractMcpServer(options);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "0.0.0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return {
    client,
    server,
    async close() {
      await client.close();
      await server.close();
    },
  };
}

function textPayload(result: { content: Array<{ type: string; text?: string }> }) {
  const item = result.content[0];
  expect(item?.type).toBe("text");
  return JSON.parse(item!.text!);
}

describe("resolveMcpInput", () => {
  it("passes through a path", () => {
    expect(resolveMcpInput({ source: "./notes.txt" })).toBe("./notes.txt");
  });

  it("decodes base64 bytes", () => {
    const input = resolveMcpInput({
      data: Buffer.from("hello").toString("base64"),
      mediaType: "text/plain",
      name: "notes",
    }) as { source: Buffer; mediaType: string; name: string };
    expect(input.mediaType).toBe("text/plain");
    expect(input.name).toBe("notes");
    expect(Buffer.from(input.source).toString()).toBe("hello");
  });

  it("requires mediaType for bytes", () => {
    expect(() => resolveMcpInput({ data: "YQ==" })).toThrow(/mediaType/);
  });
});

describe("MCP server", () => {
  const sessions: Array<{ close: () => Promise<void> }> = [];

  afterEach(async () => {
    await Promise.all(sessions.splice(0).map((session) => session.close()));
  });

  it("lists tools, resources, and prompts", async () => {
    const session = await connect();
    sessions.push(session);
    const tools = await session.client.listTools();
    expect(tools.tools.map((tool) => tool.name).sort()).toEqual([
      "close_extractor",
      "create_extractor",
      "extract",
      "extract_many",
      "extract_swarm",
      "extractor_extract",
    ]);
    const resources = await session.client.listResources();
    expect(resources.resources.map((resource) => resource.uri).sort()).toEqual([
      "openextract://capabilities",
      "openextract://docs/api",
    ]);
    const prompts = await session.client.listPrompts();
    expect(prompts.prompts.map((prompt) => prompt.name).sort()).toEqual([
      "extract-batch",
      "extract-document",
      "extract-swarm",
    ]);
  });

  it("extracts with a JSON Schema and returns usage", async () => {
    const session = await connect({
      extractWithUsage: async (_schema, model, input) => {
        expect(model).toBe("openai/gpt-5.5");
        expect(input).toBe("https://example.com/doc.pdf");
        return { output: { name: "Ada", age: 36 }, usage: { inputTokens: 3, outputTokens: 2, totalTokens: 5 } };
      },
    });
    sessions.push(session);
    const result = await session.client.callTool({
      name: "extract",
      arguments: {
        schema: PersonSchema,
        model: "openai/gpt-5.5",
        source: "https://example.com/doc.pdf",
        includeUsage: true,
      },
    });
    expect(result.isError).toBeFalsy();
    expect(textPayload(result)).toEqual({
      output: { name: "Ada", age: 36 },
      usage: { inputTokens: 3, outputTokens: 2, totalTokens: 5 },
    });
  });

  it("extracts many and serializes per-item errors", async () => {
    const session = await connect({
      extractMany: async (_schema, _model, inputs) => [
        { name: "Ada", age: 36 },
        new ModelError("rate limited", { statusCode: 429, retryable: true }),
      ],
    });
    sessions.push(session);
    const result = await session.client.callTool({
      name: "extract_many",
      arguments: {
        schema: PersonSchema,
        model: "xai/grok-4.6",
        inputs: [{ source: "./a.txt" }, { source: "./b.txt" }],
        returnExceptions: true,
      },
    });
    expect(textPayload(result)).toEqual([
      { name: "Ada", age: 36 },
      { error: "rate limited", errorType: "ModelError", provider: null, statusCode: 429, retryable: true, retryAfter: null },
    ]);
  });

  it("extracts with an imported agent", async () => {
    const session = await connect({
      extract: async (_schema, model) => {
        expect(isDefinedAgent(model)).toBe(true);
        return { name: "Ada", age: 36 };
      },
    });
    sessions.push(session);
    const { fileURLToPath } = await import("node:url");
    const { dirname, join } = await import("node:path");
    const agents = join(dirname(fileURLToPath(import.meta.url)), "fixtures/agents.ts");
    const result = await session.client.callTool({
      name: "extract",
      arguments: {
        schema: PersonSchema,
        agent: `${agents}:invoice`,
        source: "./notes.txt",
      },
    });
    expect(textPayload(result)).toEqual({ name: "Ada", age: 36 });
  });

  it("runs a swarm and returns reduced output", async () => {
    const session = await connect({
      extractSwarm: async (_schema, agents) => {
        expect(agents).toEqual([{ model: "openai/gpt-5.5" }, { model: "xai/grok-4.6" }]);
        return { name: "Ada", age: 36 };
      },
    });
    sessions.push(session);
    const result = await session.client.callTool({
      name: "extract_swarm",
      arguments: {
        schema: PersonSchema,
        models: ["openai/gpt-5.5", "xai/grok-4.6"],
        source: "./notes.txt",
      },
    });
    expect(textPayload(result)).toEqual({ name: "Ada", age: 36 });
  });

  it("runs a reusable extractor session", async () => {
    const closed: string[] = [];
    const seen: ExtractionInputLike[] = [];
    const session = await connect({
      createExtractor: () => ({
        extract: async (input) => {
          seen.push(input);
          return { name: "Ada", age: 36 };
        },
        extractWithUsage: async () => ({
          output: { name: "Ada", age: 36 },
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
        }),
        close: () => closed.push("yes"),
      }),
    });
    sessions.push(session);
    const created = textPayload(
      await session.client.callTool({
        name: "create_extractor",
        arguments: { schema: PersonSchema, model: "openai/gpt-5.5", style: "search" },
      }),
    );
    const extracted = await session.client.callTool({
      name: "extractor_extract",
      arguments: { sessionId: created.sessionId, source: "./notes.txt" },
    });
    expect(textPayload(extracted)).toEqual({ name: "Ada", age: 36 });
    expect(seen).toEqual(["./notes.txt"]);
    await session.client.callTool({
      name: "close_extractor",
      arguments: { sessionId: created.sessionId },
    });
    expect(closed).toEqual(["yes"]);
  });

  it("reads capabilities and returns extract prompts", async () => {
    const session = await connect();
    sessions.push(session);
    const resource = await session.client.readResource({ uri: "openextract://capabilities" });
    const body = JSON.parse(resource.contents[0]!.text as string);
    expect(body.styles).toEqual(["direct", "search", "code"]);
    expect(body.tools).toContain("extract");
    const prompt = await session.client.getPrompt({
      name: "extract-document",
      arguments: { source: "./a.pdf", schema: '{"type":"object"}', style: "direct" },
    });
    expect(prompt.messages[0]?.content).toMatchObject({
      type: "text",
      text: expect.stringContaining("./a.pdf"),
    });
  });

  it("returns a tool error when model is missing", async () => {
    const previous = process.env.OPENEXTRACT_MODEL;
    delete process.env.OPENEXTRACT_MODEL;
    const session = await connect({
      extract: async () => ({ name: "Ada", age: 36 }),
    });
    sessions.push(session);
    try {
      const result = await session.client.callTool({
        name: "extract",
        arguments: { schema: PersonSchema, source: "./a.txt" },
      });
      expect(result.isError).toBe(true);
      expect(textPayload(result).error).toMatch(/OPENEXTRACT_MODEL/);
    } finally {
      if (previous == null) delete process.env.OPENEXTRACT_MODEL;
      else process.env.OPENEXTRACT_MODEL = previous;
    }
  });

  it("validates JSON Schema output through the loaded schema", async () => {
    let parsed: unknown;
    const session = await connect({
      extract: async (schema: z.ZodType<unknown>) => {
        parsed = schema.parse({ name: "Ada", age: 36 });
        return parsed;
      },
    });
    sessions.push(session);
    const result = await session.client.callTool({
      name: "extract",
      arguments: { schema: PersonSchema, model: "openai/gpt-5.5", source: "./a.txt" },
    });
    expect(textPayload(result)).toEqual({ name: "Ada", age: 36 });
    expect(parsed).toEqual({ name: "Ada", age: 36 });
  });
});
