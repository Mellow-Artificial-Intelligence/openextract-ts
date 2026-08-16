import { describe, expect, it } from "vitest";
import {
  addSystemAgent,
  dropCodingAgents,
  parseRunnableSystem,
  systemFromTemplate,
  toRunnable,
} from "../web/src/lib/agent-system.ts";

describe("extraction systems", () => {
  it("builds templates with distinct specialists", () => {
    const audit = systemFromTemplate("audit");
    expect(audit.agents.map((agent) => agent.role)).toEqual(["Completeness", "Policy", "Math"]);
    expect(audit.agents[2]?.style).toBe("code");
    expect(systemFromTemplate("recon").agents.map((agent) => agent.style)).toEqual(["search", "code"]);
  });

  it("lets users add a coding agent and serialize a runnable system", () => {
    let system = systemFromTemplate("custom");
    system = addSystemAgent(system, [{ id: "claude-code" }]);
    const coding = system.agents[1];
    expect(coding?.id).toBe("claude-code");
    expect(coding?.coding?.model).toBe("claude-sonnet-4-6");
    const runnable = toRunnable(system);
    expect(runnable.agents[1]?.model).toBe("claude-code/claude-sonnet-4-6");
    const parsed = parseRunnableSystem({
      ...runnable,
      docs: ["acme-invoice.txt"],
    });
    expect(parsed).toMatchObject({ schema: "invoice", sandbox: true });
  });

  it("rejects coding agents when sandboxes are off", () => {
    const system = dropCodingAgents({
      ...systemFromTemplate("custom"),
      agents: [
        {
          id: "claude-code",
          role: "Coder",
          style: "direct",
          instructions: "Extract",
          coding: { model: "claude-sonnet-4-6", maxTurns: 10, reasoningEffort: "low" },
        },
      ],
    });
    expect(system.agents[0]?.id).toBe("openai/gpt-5.6-luna");
    expect(parseRunnableSystem({ sandbox: false, docs: ["acme-invoice.txt"], agents: [{ model: "codex", role: "X" }] })).toBe(
      "Turn on Sandboxes to use Claude Code or Codex.",
    );
  });
});
