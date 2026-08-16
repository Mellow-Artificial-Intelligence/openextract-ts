import { basename } from "node:path";
import { describe, expect, it } from "vitest";
import {
  COOKBOOK_MODEL,
  AUDIT_ROLES,
  STYLE_ROLES,
  applyEnvText,
  formatLiveDocs,
  listCookbookDocs,
  numberedRoles,
  auditMembers,
  styleMembers,
  swarmExtractDocs,
  type Invoice,
} from "../examples/cookbook/01-document-swarm/extract.js";
import {
  RECIPES,
  agentMark,
  alignPair,
  clampSwarmSize,
  cookbookCards,
  cookbookModel,
  docOptionLabel,
  formatCookbookCard,
  formatElapsed,
  formatModelPricing,
  languageModels,
  modelSelectOption,
  nextStreamChunk,
  pickCookbookModel,
  sortCookbookModels,
  togglePath,
} from "../examples/cookbook/recipes.js";
import { mockModel } from "./helpers.js";

const sample: Invoice = {
  vendor: "Acme Supplies",
  invoiceNumber: "ACM-1042",
  total: 241.38,
  currency: "USD",
  lineItems: [{ description: "toner", amount: 85 }],
};

describe("cookbook AP inbox", () => {
  it("lists the bundled invoice files", async () => {
    const docs = await listCookbookDocs();
    expect(docs.map((path) => basename(path))).toEqual([
      "acme-invoice.txt",
      "globex-invoice.txt",
      "initech-invoice.txt",
    ]);
  });

  it("runs one extract per document", async () => {
    const docs = await listCookbookDocs();
    const seen: string[] = [];
    const agents: number[] = [];
    const started: string[] = [];
    const results = await swarmExtractDocs(mockModel(sample), docs, {
      size: 1,
      reduce: "first",
      roles: ["Extract"],
      onDoc: (source) => seen.push(basename(source)),
      onAgentStart: ({ role }) => started.push(role),
      onAgent: ({ agentIndex }) => agents.push(agentIndex),
    });
    expect(seen).toEqual(["acme-invoice.txt", "globex-invoice.txt", "initech-invoice.txt"]);
    expect(started).toEqual(["Extract", "Extract", "Extract"]);
    expect(agents).toEqual([0, 0, 0]);
    expect(results).toHaveLength(3);
    for (const item of results) {
      expect(item.output).toEqual(sample);
      expect(item.reduce).toBe("first");
      expect(item.agents).toHaveLength(1);
      expect(item.agents.every((agent) => !(agent instanceof Error))).toBe(true);
    }
  });

  it("formats in-progress agent slots", () => {
    const live = formatLiveDocs([], {
      source: "/tmp/acme-invoice.txt",
      agents: [undefined, new Error("rate limited")],
    });
    expect(live).toEqual([
      {
        source: "acme-invoice.txt",
        status: "running",
        agents: [null, { error: "rate limited" }],
      },
    ]);
  });
});

describe("cookbook recipes", () => {
  it("defaults to Grok 4.6", () => {
    const previous = process.env.OPENEXTRACT_MODEL;
    delete process.env.OPENEXTRACT_MODEL;
    expect(COOKBOOK_MODEL).toBe("xai/grok-4.6");
    expect(cookbookModel()).toBe("xai/grok-4.6");
    if (previous === undefined) delete process.env.OPENEXTRACT_MODEL;
    else process.env.OPENEXTRACT_MODEL = previous;
  });

  it("parses .env text without overriding existing keys", () => {
    const env: NodeJS.ProcessEnv = { KEEP: "old" };
    applyEnvText('KEEP=new\n# skip\nAI_GATEWAY_API_KEY="vck_test"\n', env);
    expect(env.KEEP).toBe("old");
    expect(env.AI_GATEWAY_API_KEY).toBe("vck_test");
  });

  it("registers AP, audit, vote, and recon recipes", async () => {
    expect(RECIPES.map((recipe) => recipe.id)).toEqual(["ap-inbox", "audit", "vote", "recon"]);
    expect(auditMembers("xai/grok-4.6").map((member) => member.style)).toEqual([
      "search",
      "search",
      "search",
    ]);
    expect(styleMembers("xai/grok-4.6").map((member) => member.style)).toEqual(["search", "code"]);
    expect(numberedRoles(2)).toEqual(["Agent 1", "Agent 2"]);
    expect(AUDIT_ROLES).toEqual(["Completeness", "Policy", "Math"]);
    expect(STYLE_ROLES).toEqual(["Search", "Code"]);
    const audit = RECIPES.find((recipe) => recipe.id === "audit");
    expect((await audit!.listDocs()).map((path) => basename(path))).toEqual([
      "acme-invoice.txt",
      "northwind-expense.txt",
      "umbrella-msa.txt",
    ]);
  });

  it("lists the disputed payable", async () => {
    const vote = RECIPES.find((recipe) => recipe.id === "vote");
    expect(vote).toBeDefined();
    expect((await vote!.listDocs()).map((path) => basename(path))).toEqual(["contoso-invoice.txt"]);
  });

  it("clamps swarm size and toggles docs", () => {
    expect(clampSwarmSize(0)).toBe(1);
    expect(clampSwarmSize(99)).toBe(16);
    expect(clampSwarmSize(2.5)).toBe(2);
    expect(togglePath(["a", "b"], "b")).toEqual(["a"]);
    expect(togglePath(["a"], "b")).toEqual(["a", "b"]);
    expect(docOptionLabel("/tmp/acme-invoice.txt", ["/tmp/acme-invoice.txt"])).toBe(
      "● acme-invoice.txt",
    );
    expect(docOptionLabel("/tmp/acme-invoice.txt", [])).toBe("○ acme-invoice.txt");
  });

  it("keeps language models from the gateway catalog", () => {
    const models = languageModels([
      { id: "openai/text-embedding-3-small", name: "Embed", modelType: "embedding" },
      { id: "openai/gpt-5.5", name: "GPT-5.5", modelType: "language" },
      {
        id: "xai/grok-4.6",
        name: "Grok 4.6",
        modelType: "language",
        pricing: { input: "0.000003", output: "0.000015" },
      },
    ]);
    expect(models.map((model) => model.id)).toEqual(["openai/gpt-5.5", "xai/grok-4.6"]);
    expect(sortCookbookModels(models)[0]?.id).toBe("xai/grok-4.6");
    expect(pickCookbookModel(models, "missing")).toBe("xai/grok-4.6");
    expect(pickCookbookModel(models, "openai/gpt-5.5")).toBe("openai/gpt-5.5");
    expect(formatModelPricing({ input: "0.000003", output: "0.000015" })).toBe("$3 / $15 per 1M");
    expect(modelSelectOption(models[1]!)).toEqual({
      name: "Grok 4.6",
      description: "xai/grok-4.6  ·  $3 / $15 per 1M",
      value: "xai/grok-4.6",
    });
  });

  it("lays out invoice cards and streams by word", () => {
    const cards = cookbookCards([], {
      source: "/tmp/acme-invoice.txt",
      slots: [{ phase: "queued" }, { phase: "error", result: new Error("rate limited") }],
    });
    expect(cards[0]).toMatchObject({
      source: "acme-invoice.txt",
      state: "running",
      heading: "Extracting",
      meta: "○ ×  1/2",
      agents: [
        { index: 0, role: "Agent 1", phase: "queued", summary: "queued" },
        { index: 1, role: "Agent 2", phase: "error", summary: "rate limited" },
      ],
    });
    const running = cookbookCards(
      [],
      { source: "/tmp/acme-invoice.txt", slots: [{ phase: "running", startedAt: 1000 }] },
      { roles: ["Header"], now: 2500 },
    );
    expect(running[0]?.agents[0]).toMatchObject({
      role: "Header",
      phase: "running",
      summary: "running",
      elapsed: "1.5s",
    });
    const done = cookbookCards([
      {
        source: "/tmp/acme-invoice.txt",
        output: sample,
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        reduce: "merge",
        agents: [
          {
            output: sample,
            usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
            attempts: 1,
            duration: 1.2,
            model: null,
            mediaType: null,
            source: null,
            warnings: [],
          },
        ],
      },
    ]);
    expect(done[0]).toMatchObject({
      heading: "Acme Supplies",
      subheading: "ACM-1042",
      total: "241.38 USD",
      lines: [{ left: "toner", right: "85.00" }],
      agents: [
        {
          role: "Agent 1",
          phase: "done",
          summary: "Acme Supplies  ACM-1042  241.38 USD",
          elapsed: "1.2s",
        },
      ],
    });
    expect(agentMark("running")).toBe("◐");
    expect(formatElapsed(250)).toBe("250ms");
    expect(alignPair("Acme", "ACM-1", 16)).toBe("Acme       ACM-1");
    expect(formatCookbookCard(cards[0]!, 40)).toContain("1  Agent 1  ○  queued");
    expect(formatCookbookCard(cards[0]!, 40)).toContain("2  Agent 2  ×  rate limited");
    expect(nextStreamChunk("", "Acme Supplies")).toBe("Acme");
    expect(nextStreamChunk("Acme", "Acme Supplies")).toBe(" Supplies");
    expect(nextStreamChunk("Acme Supplies", "Acme Supplies")).toBeNull();
    expect(nextStreamChunk("Foo", "Bar")).toBe("Bar");
  });
});
