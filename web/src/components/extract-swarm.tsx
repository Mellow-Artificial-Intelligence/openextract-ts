import { modelLabel } from "@/lib/models";
import { cn } from "@/lib/utils";

export type SwarmAgentStatus = "pending" | "running" | "done" | "error";

export interface SwarmAgentState {
  model: string;
  status: SwarmAgentStatus;
  rows: number;
}

export function ExtractSwarmStatus({ agents }: { agents: SwarmAgentState[] }) {
  if (agents.length <= 1) return null;
  const finished = agents.filter((agent) => agent.status === "done" || agent.status === "error").length;
  const failed = agents.filter((agent) => agent.status === "error").length;
  return (
    <div className="space-y-2 px-3 pb-3 sm:px-4">
      <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
        Swarm · {finished}/{agents.length} agents
        {failed ? ` · ${failed} failed` : ""}
      </p>
      <ul className="flex flex-wrap gap-1.5">
        {agents.map((agent, index) => (
          <li
            className={cn(
              "inline-flex items-center gap-1.5 border px-2 py-1 font-mono text-[11px]",
              agent.status === "error"
                ? "border-destructive/30 text-destructive"
                : "border-black/10 text-muted-foreground",
            )}
            key={`${agent.model}-${index}`}
          >
            <span
              className={cn(
                "size-1.5 rounded-full",
                agent.status === "running" && "animate-pulse bg-foreground",
                agent.status === "done" && "bg-foreground",
                agent.status === "pending" && "bg-muted-foreground/40",
                agent.status === "error" && "bg-destructive",
              )}
            />
            <span>{modelLabel(agent.model)}</span>
            <span className="text-muted-foreground/70">{agent.rows}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
