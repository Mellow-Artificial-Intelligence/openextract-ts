import { afterEach, describe, expect, it, vi } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import {
  defineAgent,
  defineRemoteAgent,
  flattenAgent,
  isDefinedAgent,
  loadAgent,
  loadAgentDirectory,
  loadAgents,
  resolveOutputSchema,
} from "../src/agent.js";
import { basic, bearer, vercelOidc } from "../src/agent-auth.js";
import { extract, extractWithUsage } from "../src/extract.js";
import { RemoteAgentError } from "../src/exceptions.js";
import { extractSwarm, resolveSwarmMembers } from "../src/swarm.js";
import { mockModel, Person } from "./helpers.js";

const fixtures = join(dirname(fileURLToPath(import.meta.url)), "fixtures/agents.ts");
const agentApp = join(dirname(fileURLToPath(import.meta.url)), "fixtures/agent-app");

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
    const a = defineAgent({ description: "A", model: "openai/gpt-5.5" });
    const b = defineAgent({ description: "B", subagents: [a] });
    (a.subagents as import("../src/agent.js").AgentInput[]).push(b);
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
    await expect(loadAgent(`${fixtures}:notAgent`)).rejects.toThrow(/not a defineAgent/);
  });

  it("returns a defined agent as-is and rejects empty specs", async () => {
    const agent = defineAgent({ description: "Ready", model: "openai/gpt-5.5" });
    await expect(loadAgent(agent)).resolves.toBe(agent);
    await expect(loadAgent("")).rejects.toThrow(/module:exportName/);
    await expect(loadAgents("")).rejects.toThrow(/at least one agent path/);
    await expect(loadAgents([])).rejects.toThrow(/at least one agent path/);
  });

  it("loads agent.js when agent.ts is absent", async () => {
    const agent = await loadAgent(join(dirname(fileURLToPath(import.meta.url)), "fixtures/agent-js-only"));
    expect(agent.kind).toBe("local");
  });

  it("loads a directory of only subagents", async () => {
    const root = dirname(fileURLToPath(import.meta.url));
    const single = await loadAgentDirectory(join(root, "fixtures/single-subagent"));
    expect(single.kind).toBe("local");
    if (single.kind === "local") expect(single.description).toBe("Only child.");
    const multi = await loadAgentDirectory(join(root, "fixtures/multi-subagents"));
    expect(multi.kind).toBe("local");
    if (multi.kind === "local") {
      expect(multi.description).toBe("multi-subagents");
      expect(multi.subagents).toHaveLength(2);
    }
  });

  it("keeps a remote root and skips empty instructions", async () => {
    const root = dirname(fileURLToPath(import.meta.url));
    const remote = await loadAgent(join(root, "fixtures/remote-root"));
    expect(remote.kind).toBe("remote");
    const kept = await loadAgent(join(root, "fixtures/empty-instructions"));
    expect(kept.kind).toBe("local");
    if (kept.kind === "local") expect(kept.instructions).toBe("Keep mine.");
    const skipped = await loadAgent(join(root, "fixtures/skip-entries"));
    expect(skipped.kind).toBe("local");
    if (skipped.kind === "local") expect(skipped.subagents).toHaveLength(0);
  });

  it("rejects missing agents and non-agent files", async () => {
    const root = dirname(fileURLToPath(import.meta.url));
    await expect(loadAgentDirectory(join(root, "fixtures/empty-agent-dir"))).rejects.toThrow(
      /No agent.ts or subagents/,
    );
    await expect(loadAgent(join(root, "fixtures/not-an-agent.mjs"))).rejects.toThrow(/must default-export/);
    await expect(loadAgent(join(root, "fixtures/bad-root-agent"))).rejects.toThrow(/must default-export/);
    await expect(loadAgent(join(root, "fixtures/bad-subagent"))).rejects.toThrow(/must default-export/);
  });

  it("resolves JSON Schema output and rejects invalid specs", () => {
    const agent = defineAgent({
      description: "JSON schema",
      model: "openai/gpt-5.5",
      outputSchema: {
        type: "object",
        properties: { name: { type: "string" } },
        required: ["name"],
      },
    });
    expect(resolveOutputSchema(agent).parse({ name: "Ada" })).toEqual({ name: "Ada" });
    expect(() => resolveOutputSchema(defineAgent({ description: "No schema", model: "openai/gpt-5.5" }))).toThrow(
      /missing outputSchema/,
    );
    expect(() =>
      resolveOutputSchema(
        defineAgent({
          description: "Bad schema",
          model: "openai/gpt-5.5",
          outputSchema: 1 as unknown as Record<string, unknown>,
        }),
      ),
    ).toThrow(/Zod schema or JSON Schema/);
  });

  it("rejects a directory with no agent files", async () => {
    const dir = await mkdtemp(join(tmpdir(), "openextract-empty-"));
    await expect(loadAgentDirectory(dir)).rejects.toThrow(/No agent.ts or subagents/);
  });

  it("falls through when a path is neither a file nor a directory", async () => {
    const dir = await mkdtemp(join(tmpdir(), "openextract-fifo-"));
    const fifo = join(dir, "pipe");
    const { spawnSync } = await import("node:child_process");
    spawnSync("mkfifo", [fifo]);
    await expect(loadAgent(fifo)).rejects.toThrow(/module:exportName|Invalid module path/);
  });

  it("rethrows unexpected filesystem errors", async () => {
    await expect(loadAgent(join("/tmp", "x".repeat(8000)))).rejects.toThrow();
    const dir = await mkdtemp(join(tmpdir(), "openextract-notdir-"));
    await writeFile(join(dir, "subagents"), "not a directory");
    await writeFile(
      join(dir, "agent.ts"),
      `import { defineAgent } from ${JSON.stringify(new URL("../src/agent.js", import.meta.url).href)};\nexport default defineAgent({ description: "Tmp", model: "openai/gpt-5.5" });\n`,
    );
    await expect(loadAgentDirectory(dir)).rejects.toThrow();
  });

  it("loads a default export from a file path", async () => {
    const agent = await loadAgent(fixtures);
    expect(agent.kind).toBe("local");
  });

  it("loads an eve-style agent directory and its subagents", async () => {
    const agent = await loadAgent(agentApp);
    expect(agent.kind).toBe("local");
    if (agent.kind === "local") {
      expect(agent.model).toBe("openai/gpt-5.5");
      expect(agent.instructions).toBe("Pull vendor names from the source.");
      expect(agent.subagents).toHaveLength(2);
    }
    const members = flattenAgent(agent);
    expect(members[0]?.kind).toBe("local");
    expect(members.filter((member) => member.kind === "local")).toHaveLength(2);
    expect(members.filter((member) => member.kind === "remote")).toHaveLength(1);
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

  it("resolves function credentials", async () => {
    expect(await bearer(async () => "tok")()).toEqual({ Authorization: "Bearer tok" });
    expect(await basic(async () => ({ username: "u", password: "p" }))()).toEqual({
      Authorization: `Basic ${Buffer.from("u:p").toString("base64")}`,
    });
  });

  it("rejects a missing OIDC token", async () => {
    const prev = process.env.VERCEL_OIDC_TOKEN;
    delete process.env.VERCEL_OIDC_TOKEN;
    try {
      await expect(vercelOidc()()).rejects.toThrow(/VERCEL_OIDC_TOKEN/);
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
      outputSchema: Person,
    });
    await expect(extract(agent, Buffer.from("doc"), { mediaType: "text/plain" })).resolves.toEqual({
      name: "Ada",
      age: 36,
    });
  });

  it("runs subagents as a swarm", async () => {
    const Profile = Person.extend({ age: Person.shape.age.nullable() });
    const team = defineAgent({
      description: "Team",
      outputSchema: Profile,
      subagents: [mockModel({ name: "Ada", age: null }), mockModel({ name: "", age: 36 })],
    });
    await expect(extract(team, Buffer.from("doc"), { mediaType: "text/plain" })).resolves.toEqual({
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

  it("covers remote URL, header, and error branches", async () => {
    const { joinAgentUrl, resolveAgentUrl, runRemoteExtraction } = await import("../src/agent-remote.js");
    const { resolveExtractOptions } = await import("../src/pipeline.js");
    expect(joinAgentUrl("https://extract.example.com/", "v1")).toBe("https://extract.example.com/v1");
    await expect(resolveAgentUrl(async () => "  ")).rejects.toThrow(/non-empty string/);
    await expect(resolveAgentUrl("not a url")).rejects.toThrow(/invalid/);
    await expect(resolveAgentUrl("ftp://extract.example.com")).rejects.toThrow(/http or https/);
    const opts = resolveExtractOptions({ timeout: 5, maxRetries: 0 });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("offline");
      }),
    );
    await expect(
      runRemoteExtraction(
        Person,
        defineRemoteAgent({ url: "https://extract.example.com", description: "Remote" }),
        Buffer.from("doc"),
        "text/plain",
        opts,
      ),
    ).rejects.toBeInstanceOf(RemoteAgentError);
    vi.stubGlobal("fetch", vi.fn(async () => new Response("not-json", { status: 200 })));
    await expect(
      runRemoteExtraction(
        Person,
        defineRemoteAgent({ url: "https://extract.example.com", description: "Remote" }),
        Buffer.from("doc"),
        "text/plain",
        opts,
      ),
    ).rejects.toThrow(/non-JSON/);
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 200 })));
    await expect(
      runRemoteExtraction(
        Person,
        defineRemoteAgent({ url: "https://extract.example.com", description: "Remote" }),
        Buffer.from("doc"),
        "text/plain",
        opts,
      ),
    ).rejects.toThrow(/empty response/);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: "denied" }), { status: 200 })),
    );
    await expect(
      runRemoteExtraction(
        Person,
        defineRemoteAgent({
          url: "https://extract.example.com",
          description: "Remote",
          headers: async () => ({ "x-test": "1" }),
        }),
        Buffer.from("doc"),
        "text/plain",
        opts,
      ),
    ).rejects.toThrow(/denied/);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ nope: true }), { status: 400 })));
    await expect(
      runRemoteExtraction(
        Person,
        defineRemoteAgent({ url: "https://extract.example.com", description: "Remote" }),
        Buffer.from("doc"),
        "text/plain",
        opts,
      ),
    ).rejects.toThrow(/status 400/);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ name: "Ada", age: 36, usage: "bad" }), { status: 200 })),
    );
    const parsed = await runRemoteExtraction(
      Person,
      defineRemoteAgent({ url: "https://extract.example.com", description: "Remote" }),
      Buffer.from("doc"),
      "text/plain",
      opts,
    );
    expect(parsed.output).toEqual({ name: "Ada", age: 36 });
    expect(parsed.usage.totalTokens).toBe(0);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ output: { name: "Ada", age: 36 }, usage: {} }), { status: 200 })),
    );
    const withHeaders = await runRemoteExtraction(
      Person,
      defineRemoteAgent({
        url: "https://extract.example.com",
        description: "Remote",
        headers: { "x-test": "1" },
      }),
      Buffer.from("doc"),
      "text/plain",
      opts,
    );
    expect(withHeaders.usage.inputTokens).toBe(0);
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
