import { describe, expect, it, vi } from "vitest";
import { ModelError } from "../src/exceptions.js";
import { normalizeReduce, reduceOutputs } from "../src/reduce.js";
import {
  extractSwarm,
  extractSwarmAsync,
  extractSwarmWithResults,
  extractSwarmWithResultsAsync,
  resolveSwarmMembers,
} from "../src/swarm.js";
import { z } from "zod";
import { mockModel, mockModelFn, Person } from "./helpers.js";

const Profile = z.object({
  name: z.string(),
  age: z.number().nullable(),
});

describe("resolveSwarmMembers", () => {
  it("repeats one model by size", () => {
    const members = resolveSwarmMembers("openai/gpt-5.5", 3);
    expect(members).toHaveLength(3);
    expect(members.every((member) => member.model === "openai/gpt-5.5")).toBe(true);
  });

  it("keeps a heterogeneous list", () => {
    const members = resolveSwarmMembers([
      { model: "openai/gpt-5.5", style: "search" },
      "xai/grok-4.6",
    ]);
    expect(members).toEqual([
      { kind: "local", model: "openai/gpt-5.5", instructions: undefined, style: "search" },
      { kind: "local", model: "xai/grok-4.6" },
    ]);
  });

  it("rejects size with a multi-agent list", () => {
    expect(() => resolveSwarmMembers(["a", "b"], 3)).toThrow(/size cannot be combined/);
    expect(() => resolveSwarmMembers([])).toThrow(/at least one model/);
    const empty = Object.freeze({
      [Symbol.for("openextract.agent")]: true,
      kind: "local",
      description: "Empty",
      subagents: [],
    });
    expect(() => resolveSwarmMembers(empty as never)).toThrow(/at least one model/);
  });
});

describe("reduceOutputs", () => {
  it("merges objects and unions arrays", () => {
    expect(
      reduceOutputs(
        [
          { name: "Ada", tags: ["a"], extra: null },
          { name: "", tags: ["b", "a"], extra: "ok" },
        ],
        "merge",
      ),
    ).toEqual({ name: "Ada", tags: ["a", "b"], extra: "ok" });
  });

  it("votes on primitive fields", () => {
    expect(normalizeReduce("vote")).toBe("vote");
    expect(reduceOutputs(["Ada", "Ada", "Grace"], "vote")).toBe("Ada");
    expect(
      reduceOutputs(
        [
          { name: "Ada", age: 1 },
          { name: "Ada", age: 2 },
          { name: "Grace", age: 2 },
        ],
        "vote",
      ),
    ).toEqual({ name: "Ada", age: 2 });
  });

  it("returns the first value", () => {
    expect(reduceOutputs(["a", "b"], "first")).toBe("a");
    expect(reduceOutputs(["only"], "merge")).toBe("only");
    expect(() => normalizeReduce("avg")).toThrow(/reduce must be one of/);
    expect(() => reduceOutputs([], "first")).toThrow(/at least one value/);
  });

  it("merges and votes on nested objects and empty values", async () => {
    const { mergeValues, voteValues } = await import("../src/reduce.js");
    expect(mergeValues([])).toBeNull();
    expect(mergeValues(["x"])).toBe("x");
    expect(mergeValues([null, "", "ok"])).toBe("ok");
    expect(mergeValues([null, ""])).toBeNull();
    expect(mergeValues([[null], [undefined]])).toEqual([null, undefined]);
    expect(mergeValues([[[1]], [[1], [2]]])).toEqual([[1], [2]]);
    expect(
      mergeValues([
        { items: [{ id: 1 }, { id: 2 }] },
        { items: [{ id: 2 }, { id: 3 }] },
      ]),
    ).toEqual({ items: [{ id: 1 }, { id: 2 }, { id: 3 }] });
    expect(voteValues([])).toBeNull();
    expect(voteValues(["x"])).toBe("x");
    expect(voteValues([[1], [1, 2]])).toEqual([1, 2]);
    expect(voteValues([null, "", null])).toBeNull();
    expect(voteValues([null, "Ada", "Ada"])).toBe("Ada");
  });
});

describe("extractSwarm", () => {
  it("merges parallel agent outputs", async () => {
    const result = await extractSwarm(
      Profile,
      [mockModel({ name: "Ada", age: null }), mockModel({ name: "", age: 36 })],
      Buffer.from("doc"),
      { mediaType: "text/plain" },
    );
    expect(result).toEqual({ name: "Ada", age: 36 });
  });

  it("returns per-agent results and usage", async () => {
    const swarm = await extractSwarmWithResults(
      Person,
      [
        mockModel({ name: "Ada", age: 36 }, { inputTokens: 4, outputTokens: 2 }),
        mockModel({ name: "Ada", age: 36 }, { inputTokens: 5, outputTokens: 3 }),
      ],
      Buffer.from("doc"),
      { mediaType: "text/plain", reduce: "first" },
    );
    expect(swarm.output).toEqual({ name: "Ada", age: 36 });
    expect(swarm.reduce).toBe("first");
    expect(swarm.usage).toEqual({ inputTokens: 9, outputTokens: 5, totalTokens: 14 });
    expect(swarm.agents).toHaveLength(2);
    expect(swarm.agents[0]).not.toBeInstanceOf(Error);
  });

  it("notifies as each agent starts and finishes", async () => {
    const started: number[] = [];
    const finished: number[] = [];
    await extractSwarmWithResults(
      Person,
      [mockModel({ name: "Ada", age: 1 }), mockModel({ name: "Ada", age: 2 })],
      Buffer.from("doc"),
      {
        mediaType: "text/plain",
        onAgentStart: ({ index, total }) => {
          started.push(index);
          expect(total).toBe(2);
        },
        onAgent: ({ index, total }) => {
          finished.push(index);
          expect(total).toBe(2);
        },
      },
    );
    expect(started.sort()).toEqual([0, 1]);
    expect(finished.sort()).toEqual([0, 1]);
  });

  it("keeps going when one agent fails", async () => {
    const swarm = await extractSwarmWithResults(
      Person,
      [
        mockModelFn(() => {
          throw new ModelError("rate limited", { statusCode: 429, retryAfter: 0 });
        }),
        mockModel({ name: "Ada", age: 36 }),
      ],
      Buffer.from("doc"),
      { mediaType: "text/plain" },
    );
    expect(swarm.output).toEqual({ name: "Ada", age: 36 });
    expect(swarm.agents[0]).toBeInstanceOf(Error);
  });

  it("throws when every agent fails", async () => {
    await expect(
      extractSwarm(
        Person,
        mockModelFn(() => {
          throw new ModelError("unavailable", { statusCode: 503, retryAfter: 0 });
        }),
        Buffer.from("doc"),
        { mediaType: "text/plain", size: 2, retryBackoff: 0, retryMaxBackoff: 0 },
      ),
    ).rejects.toBeInstanceOf(ModelError);
  });

  it("adds per-agent instructions and labels a function-url remote", async () => {
    const { defineRemoteAgent } = await import("../src/agent.js");
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ output: { name: "Ada", age: 36 } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    try {
      const swarm = await extractSwarmWithResults(
        Person,
        [
          mockModel({ name: "Ada", age: 36 }),
          defineRemoteAgent({
            url: () => "https://extract.example.com",
            description: "Remote OCR",
          }),
        ],
        Buffer.from("doc"),
        { mediaType: "text/plain", instructions: "Be thorough." },
      );
      expect(swarm.output.name).toBe("Ada");
      const remote = swarm.agents[1];
      expect(remote).not.toBeInstanceOf(Error);
      if (!(remote instanceof Error)) expect(remote.model).toBe("Remote OCR");
      expect(extractSwarmAsync).toBe(extractSwarm);
      expect(extractSwarmWithResultsAsync).toBe(extractSwarmWithResults);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
