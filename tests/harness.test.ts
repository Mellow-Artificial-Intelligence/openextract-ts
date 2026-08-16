import { describe, expect, it } from "vitest";
import {
  composeExtractModel,
  parseCodingOptions,
  resizeAgentSpecs,
  sanitizeCodingModel,
  specForModel,
} from "../web/src/lib/harness.ts";

describe("coding agent harness", () => {
  it("keeps settings when the harness stays the same", () => {
    const prev = specForModel("claude-code");
    prev.coding = { model: "claude-opus-4-6", maxTurns: 12, reasoningEffort: "high" };
    expect(specForModel("claude-code", prev).coding).toEqual(prev.coding);
    expect(specForModel("codex", prev).coding?.model).toBe("gpt-5.5");
    expect(specForModel("openai/gpt-5.6-luna", prev).coding).toBeUndefined();
  });

  it("composes nested model ids and coding options", () => {
    const spec = specForModel("codex");
    spec.coding = { model: "gpt-5.5", maxTurns: 25, reasoningEffort: "high" };
    expect(composeExtractModel(spec)).toBe("codex/gpt-5.5");
    expect(parseCodingOptions({ maxTurns: 3.9, reasoningEffort: "high" })).toEqual({
      maxTurns: 3,
      reasoningEffort: "high",
    });
    expect(parseCodingOptions({ reasoningEffort: "nope" })).toBeUndefined();
  });

  it("strips harness prefixes from typed model ids", () => {
    expect(sanitizeCodingModel("claude-code", "claude-code/claude-sonnet-4-6")).toBe("claude-sonnet-4-6");
    expect(sanitizeCodingModel("codex", "codex:gpt-5.5")).toBe("gpt-5.5");
  });

  it("grows a mixed team without dropping coding settings", () => {
    const team = resizeAgentSpecs([specForModel("claude-code")], 3, specForModel("openai/gpt-5.6-luna"));
    expect(team).toHaveLength(3);
    expect(team[0]?.id).toBe("claude-code");
    expect(team[0]?.coding?.model).toBe("claude-sonnet-4-6");
    expect(team[1]?.id).toBe("openai/gpt-5.6-luna");
    expect(team[2]?.id).toBe("xai/grok-4.6");
  });
});
