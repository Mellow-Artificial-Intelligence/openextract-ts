import { Overline } from "@/components/ui/overline";
import { StatusDot, type StatusDotStatus } from "@/components/ui/status-dot";
import { modelLabel } from "@/lib/models";
import { cn } from "@/lib/utils";

export type SwarmAgentStatus = "pending" | "running" | "done" | "error";

export interface SwarmAgentState {
  model: string;
  status: SwarmAgentStatus;
  rows: number;
}

function dotStatus(status: SwarmAgentStatus): StatusDotStatus {
  return status === "pending" ? "queued" : status;
}

export function ExtractSwarmStatus({ agents }: { agents: SwarmAgentState[] }) {
  if (agents.length <= 1) return null;
  const finished = agents.filter((agent) => agent.status === "done" || agent.status === "error").length;
  const failed = agents.filter((agent) => agent.status === "error").length;
  return (
    <div className="space-y-2 px-3 pb-3 sm:px-4">
      <Overline>
        Swarm · {finished}/{agents.length} agents
        {failed ? ` · ${failed} failed` : ""}
      </Overline>
      <ul className="flex flex-wrap gap-1.5">
        {agents.map((agent, index) => (
          <li
            className={cn(
              "inline-flex items-center gap-1.5 border px-2 py-1 font-mono text-[11px]",
              agent.status === "error"
                ? "border-destructive/30 text-destructive"
                : "text-muted-foreground",
            )}
            key={`${agent.model}-${index}`}
          >
            <StatusDot status={dotStatus(agent.status)} />
            <span>{modelLabel(agent.model)}</span>
            <span className="text-muted-foreground/70">{agent.rows}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
