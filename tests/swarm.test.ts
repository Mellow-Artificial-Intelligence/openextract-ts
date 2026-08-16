import { describe, expect, it } from "vitest";
import { ModelError } from "../src/exceptions.js";
import { normalizeReduce, reduceOutputs } from "../src/reduce.js";
import { extractSwarm, extractSwarmWithResults, resolveSwarmMembers } from "../src/swarm.js";
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
});
