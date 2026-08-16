"use client";

import {
  Artifact,
  ArtifactContent,
  ArtifactDescription,
  ArtifactHeader,
} from "@/components/ai-elements/artifact";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { Task, TaskContent, TaskItem, TaskTrigger } from "@/components/ai-elements/task";
import { Overline } from "@/components/ui/overline";
import { StatusDot } from "@/components/ui/status-dot";
import {
  displayReduce,
  formatCookbookElapsed,
  outputAmount,
  outputHeading,
  outputLines,
  outputSubheading,
  type CookbookReduce,
} from "@/lib/cookbook-catalog";
import { agentSummary, latestOutput, type AgentView, type DocCard } from "@/lib/agents-stream";

function elapsedFor(agent: AgentView, now: number): string {
  if (agent.phase === "done" || agent.phase === "error") {
    return agent.duration != null ? formatCookbookElapsed(agent.duration) : "";
  }
  if (agent.phase === "running" && agent.startedAt != null) {
    return formatCookbookElapsed(now - agent.startedAt);
  }
  return "";
}

export function AgentsResultCard({
  card,
  reduce,
  size,
  now,
  onView,
}: {
  card: DocCard;
  reduce: CookbookReduce;
  size: number;
  now: number;
  onView: (source: string) => void;
}) {
  const finished = card.agents.filter((agent) => agent.phase === "done" || agent.phase === "error").length;
  const output = latestOutput(card);
  const lines = output ? outputLines(output) : [];
  return (
    <Artifact>
      <ArtifactHeader>
        <div className="min-w-0">
          <Overline as="span">
            <button className="truncate text-left" onClick={() => onView(card.source)} type="button">
              {card.source}
            </button>
          </Overline>
          <p className="truncate text-sm">
            {output ? outputHeading(output) : finished === 0 ? "Extracting" : "—"}
            {output ? <span className="text-muted-foreground"> · {outputSubheading(output)}</span> : null}
          </p>
        </div>
        <div className="text-right">
          <p className="font-mono text-sm">{output ? outputAmount(output) : ""}</p>
          <ArtifactDescription className="flex items-center justify-end gap-2">
            <span className="flex items-center gap-1">
              {card.agents.map((agent, index) => (
                <StatusDot key={index} status={agent.phase} />
              ))}
            </span>
            <span>
              {displayReduce(card.reduce ?? reduce)} {finished}/{card.agents.length || size}
            </span>
          </ArtifactDescription>
        </div>
      </ArtifactHeader>
      <ArtifactContent className="space-y-3 p-3">
        {lines.length ? (
          <ul className="space-y-1 font-mono text-xs">
            {lines.map((item) => (
              <li className="flex justify-between gap-4" key={`${item.left}:${item.right}`}>
                <span className="min-w-0 truncate">{item.left}</span>
                <span className="shrink-0 text-muted-foreground">{item.right}</span>
              </li>
            ))}
          </ul>
        ) : null}
        <div className="space-y-1">
          {card.agents.map((agent, index) => {
            const summary = agentSummary(agent);
            const elapsed = elapsedFor(agent, now);
            return (
              <Task defaultOpen={agent.phase === "error"} key={`${card.source}-${index}`}>
                <TaskTrigger title={agent.role}>
                  <div className="flex w-full cursor-pointer items-center gap-2 py-1 font-mono text-xs">
                    <span className="w-4 shrink-0 text-muted-foreground">{index + 1}</span>
                    <span className="w-28 shrink-0 truncate">{agent.role}</span>
                    <StatusDot status={agent.phase} />
                    <span className="min-w-0 flex-1 truncate text-muted-foreground">
                      {agent.phase === "running" ? <Shimmer className="text-xs">{summary}</Shimmer> : summary}
                    </span>
                    <span className="shrink-0 text-muted-foreground">{elapsed}</span>
                  </div>
                </TaskTrigger>
                <TaskContent>
                  <TaskItem>
                    {agent.error ??
                      (agent.output ? JSON.stringify(agent.output, null, 2) : "Waiting for this agent.")}
                  </TaskItem>
                </TaskContent>
              </Task>
            );
          })}
        </div>
      </ArtifactContent>
    </Artifact>
  );
}
