import { afterEach, describe, expect, it, vi } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  defineAgent,
  defineRemoteAgent,
  flattenAgent,
  isDefinedAgent,
  loadAgent,
  loadAgents,
} from "../src/agent.js";
import { basic, bearer, vercelOidc } from "../src/agent-auth.js";
import { extract, extractWithUsage } from "../src/extract.js";
import { RemoteAgentError } from "../src/exceptions.js";
import { extractSwarm, resolveSwarmMembers } from "../src/swarm.js";
import { mockModel, Person } from "./helpers.js";

const fixtures = join(dirname(fileURLToPath(import.meta.url)), "fixtures/agents.ts");

describe("defineAgent", () => {
  it("creates an importable local agent", () => {
    const agent = defineAgent({
      description: "Invoice specialist",
      model: "openai/gpt-5.5",
      style: "direct",
      instructions: "Pull totals.",
    });
    expect(isDefinedAgent(agent)).toBe(true);
    expect(agent.kind).toBe("local");
    expect(agent.description).toBe("Invoice specialist");
    expect(agent.model).toBe("openai/gpt-5.5");
  });

  it("requires description and model or subagents", () => {
    expect(() => defineAgent({ description: "", model: "openai/gpt-5.5" })).toThrow(/description/);
    expect(() => defineAgent({ description: "empty" })).toThrow(/model or subagents/);
  });

  it("flattens nested subagents", () => {
    const search = defineAgent({ description: "Search", model: "xai/grok-4.6", style: "search" });
    const team = defineAgent({
      description: "Team",
      subagents: [search, { model: "openai/gpt-5.5", instructions: "Be thorough." }],
    });
    expect(flattenAgent(team)).toEqual([
      { kind: "local", model: "xai/grok-4.6", instructions: undefined, style: "search", description: "Search" },
      { kind: "local", model: "openai/gpt-5.5", instructions: "Be thorough.", style: undefined },
    ]);
  });

  it("rejects a subagent cycle", () => {
    const children: import("../src/agent.js").AgentInput[] = [];
    const a = defineAgent({ description: "A", subagents: children });
    children.push(defineAgent({ description: "B", subagents: [a] }));
    expect(() => flattenAgent(a)).toThrow(/cycle/);
  });
});

describe("defineRemoteAgent", () => {
  it("creates an importable remote agent", () => {
    const agent = defineRemoteAgent({
      url: "https://extract.example.com",
      description: "Remote OCR",
      path: "/v1/extract",
    });
    expect(agent.kind).toBe("remote");
    expect(agent.path).toBe("/v1/extract");
    expect(flattenAgent(agent)[0]).toMatchObject({ kind: "remote", remote: agent });
  });

  it("requires url and description", () => {
    expect(() => defineRemoteAgent({ url: "", description: "Remote" })).toThrow(/url/);
    expect(() => defineRemoteAgent({ url: "https://extract.example.com", description: " " })).toThrow(
      /description/,
    );
  });
});

describe("loadAgent", () => {
  it("loads defineAgent exports from module:exportName", async () => {
    const agent = await loadAgent(`${fixtures}:invoice`);
    expect(agent.kind).toBe("local");
    if (agent.kind === "local") expect(agent.model).toBe("openai/gpt-5.5");
  });

  it("loads a list of agents", async () => {
    const agents = await loadAgents(`${fixtures}:invoice,${fixtures}:remote`);
    expect(agents.map((agent) => agent.kind)).toEqual(["local", "remote"]);
  });

  it("rejects a non-agent export", async () => {
    await expect(loadAgent(`${fixtures}:missing`)).rejects.toThrow(/Export 'missing'/);
  });
});

describe("auth helpers", () => {
  it("builds bearer and basic headers", async () => {
    expect(await bearer("tok")()).toEqual({ Authorization: "Bearer tok" });
    expect(await basic({ username: "u", password: "p" })()).toEqual({
      Authorization: `Basic ${Buffer.from("u:p").toString("base64")}`,
    });
  });

  it("reads VERCEL_OIDC_TOKEN", async () => {
    const prev = process.env.VERCEL_OIDC_TOKEN;
    process.env.VERCEL_OIDC_TOKEN = "oidc";
    try {
      expect(await vercelOidc()()).toEqual({ Authorization: "Bearer oidc" });
    } finally {
      if (prev == null) delete process.env.VERCEL_OIDC_TOKEN;
      else process.env.VERCEL_OIDC_TOKEN = prev;
    }
  });
});

describe("extract with agents", () => {
  it("uses a defined agent's model and instructions", async () => {
    const agent = defineAgent({
      description: "Person reader",
      model: mockModel({ name: "Ada", age: 36 }),
    });
    await expect(extract(Person, agent, Buffer.from("doc"), { mediaType: "text/plain" })).resolves.toEqual({
      name: "Ada",
      age: 36,
    });
  });

  it("runs subagents as a swarm", async () => {
    const team = defineAgent({
      description: "Team",
      subagents: [mockModel({ name: "Ada", age: null }), mockModel({ name: "", age: 36 })],
    });
    const Profile = Person.extend({ age: Person.shape.age.nullable() });
    await expect(extract(Profile, team, Buffer.from("doc"), { mediaType: "text/plain" })).resolves.toEqual({
      name: "Ada",
      age: 36,
    });
  });
});

describe("remote extract", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts loaded bytes to the remote agent", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe("https://extract.example.com/extract");
      const body = JSON.parse(String(init?.body));
      expect(body.input.mediaType).toBe("text/plain");
      expect(Buffer.from(body.input.data, "base64").toString()).toBe("doc");
      expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer secret");
      return new Response(JSON.stringify({ output: { name: "Ada", age: 36 }, usage: { inputTokens: 2, outputTokens: 1, totalTokens: 3 } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const agent = defineRemoteAgent({
      url: () => "https://extract.example.com",
      description: "Remote OCR",
      auth: bearer("secret"),
    });
    const { output, usage } = await extractWithUsage(Person, agent, Buffer.from("doc"), {
      mediaType: "text/plain",
    });
    expect(output).toEqual({ name: "Ada", age: 36 });
    expect(usage.totalTokens).toBe(3);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("surfaces a failed remote agent", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: "nope" }), { status: 503 })),
    );
    const agent = defineRemoteAgent({
      url: "https://extract.example.com",
      description: "Remote OCR",
    });
    await expect(extract(Person, agent, Buffer.from("doc"), { mediaType: "text/plain" })).rejects.toBeInstanceOf(
      RemoteAgentError,
    );
  });

  it("mixes local and remote swarm members", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ output: { name: "", age: 36 } }), { status: 200 })),
    );
    const result = await extractSwarm(
      Person.extend({ age: Person.shape.age.nullable() }),
      [
        defineAgent({ description: "Local", model: mockModel({ name: "Ada", age: null }) }),
        defineRemoteAgent({ url: "https://extract.example.com", description: "Remote" }),
      ],
      Buffer.from("doc"),
      { mediaType: "text/plain" },
    );
    expect(result).toEqual({ name: "Ada", age: 36 });
  });
});

describe("resolveSwarmMembers with agents", () => {
  it("expands a coordinator agent", () => {
    const team = defineAgent({
      description: "Team",
      subagents: ["openai/gpt-5.5", "xai/grok-4.6"],
    });
    expect(resolveSwarmMembers(team).map((member) => (member.kind === "local" ? member.model : null))).toEqual([
      "openai/gpt-5.5",
      "xai/grok-4.6",
    ]);
  });
});
