import {
  summarizeOutput,
  type CookbookEvent,
  type CookbookOutput,
  type CookbookReduce,
} from "@/lib/cookbook-catalog";

export type AgentPhase = "queued" | "running" | "done" | "error";

export interface AgentView {
  role: string;
  phase: AgentPhase;
  output?: CookbookOutput;
  error?: string;
  duration?: number;
  startedAt?: number;
}

export interface DocCard {
  source: string;
  reduce?: CookbookReduce;
  output?: CookbookOutput;
  agents: AgentView[];
}

export function agentSummary(agent: AgentView): string {
  if (agent.phase === "queued") return "queued";
  if (agent.phase === "running") return "running";
  if (agent.error) return agent.error;
  if (agent.output) return summarizeOutput(agent.output);
  return "—";
}

export function latestOutput(card: DocCard): CookbookOutput | undefined {
  if (card.output) return card.output;
  for (let index = card.agents.length - 1; index >= 0; index--) {
    const output = card.agents[index]?.output;
    if (output) return output;
  }
}

function ensureAgents(agents: AgentView[], total: number, roles: string[]): AgentView[] {
  if (agents.length >= total) return agents;
  return Array.from({ length: total }, (_, index) => {
    return agents[index] ?? { role: roles[index] ?? `Agent ${index + 1}`, phase: "queued" as const };
  });
}

export function applyEvent(cards: DocCard[], event: CookbookEvent, roles: string[]): DocCard[] {
  if (event.type === "error" || event.type === "done") return cards;
  if (event.type === "doc") {
    if (cards.some((card) => card.source === event.source)) return cards;
    return [
      ...cards,
      { source: event.source, agents: roles.map((role) => ({ role, phase: "queued" as const })) },
    ];
  }
  return cards.map((card) => {
    if (card.source !== event.source) return card;
    if (event.type === "result") return { ...card, output: event.output, reduce: event.reduce };
    const agents = ensureAgents(card.agents, event.agentTotal, roles);
    if (event.type === "agent-start") {
      return {
        ...card,
        agents: agents.map((agent, index) =>
          index === event.agentIndex
            ? { ...agent, role: event.role, phase: "running", startedAt: Date.now() }
            : agent,
        ),
      };
    }
    return {
      ...card,
      agents: agents.map((agent, index) =>
        index === event.agentIndex
          ? {
              ...agent,
              role: event.role,
              phase: event.error ? "error" : "done",
              output: event.output,
              error: event.error,
              duration: event.duration,
            }
          : agent,
      ),
    };
  });
}

export async function readNdjson(
  response: Response,
  onEvent: (event: CookbookEvent) => void,
): Promise<void> {
  if (!response.body) throw new Error("Cookbook stream was empty.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      onEvent(JSON.parse(line) as CookbookEvent);
    }
  }
  if (buffer.trim()) onEvent(JSON.parse(buffer) as CookbookEvent);
}
