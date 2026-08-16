"use client";

import {
  Artifact,
  ArtifactContent,
  ArtifactDescription,
  ArtifactHeader,
  ArtifactTitle,
} from "@/components/ai-elements/artifact";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { Task, TaskContent, TaskItem, TaskTrigger } from "@/components/ai-elements/task";
import { AppHeader } from "@/components/app-header";
import { ExtractApp } from "@/components/extract-app";
import { ModelPicker } from "@/components/model-picker";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Checkbox } from "@/components/ui/checkbox";
import { ErrorBanner } from "@/components/ui/error-banner";
import { Overline } from "@/components/ui/overline";
import { ScrollArea } from "@/components/ui/scroll-area";
import { StatusDot } from "@/components/ui/status-dot";
import {
  COOKBOOK_RECIPES,
  FALLBACK_COOKBOOK_MODELS,
  clampCookbookSize,
  cookbookRoles,
  formatCookbookElapsed,
  displayReduce,
  outputAmount,
  outputHeading,
  outputLines,
  outputSubheading,
  pickCookbookModel,
  summarizeOutput,
  type CookbookEvent,
  type CookbookModel,
  type CookbookOutput,
  type CookbookRecipeMeta,
  type CookbookReduce,
} from "@/lib/cookbook-catalog";
import { cn } from "@/lib/utils";
import { MinusIcon, PlusIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type AgentPhase = "queued" | "running" | "done" | "error";

interface AgentView {
  role: string;
  phase: AgentPhase;
  output?: CookbookOutput;
  error?: string;
  duration?: number;
  startedAt?: number;
}

interface DocCard {
  source: string;
  reduce?: CookbookReduce;
  output?: CookbookOutput;
  agents: AgentView[];
}

function agentSummary(agent: AgentView): string {
  if (agent.phase === "queued") return "queued";
  if (agent.phase === "running") return "running";
  if (agent.error) return agent.error;
  if (agent.output) return summarizeOutput(agent.output);
  return "—";
}

function latestOutput(card: DocCard): CookbookOutput | undefined {
  if (card.output) return card.output;
  for (let index = card.agents.length - 1; index >= 0; index--) {
    const output = card.agents[index]?.output;
    if (output) return output;
  }
}

function elapsedFor(agent: AgentView, now: number): string {
  if (agent.phase === "done" || agent.phase === "error") {
    return agent.duration != null ? formatCookbookElapsed(agent.duration) : "";
  }
  if (agent.phase === "running" && agent.startedAt != null) {
    return formatCookbookElapsed(now - agent.startedAt);
  }
  return "";
}

function ensureAgents(agents: AgentView[], total: number, roles: string[]): AgentView[] {
  if (agents.length >= total) return agents;
  return Array.from({ length: total }, (_, index) => {
    return agents[index] ?? { role: roles[index] ?? `Agent ${index + 1}`, phase: "queued" as const };
  });
}

function applyEvent(cards: DocCard[], event: CookbookEvent, roles: string[]): DocCard[] {
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

async function readNdjson(response: Response, onEvent: (event: CookbookEvent) => void): Promise<void> {
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

export function CookbookApp() {
  const [recipeId, setRecipeId] = useState(COOKBOOK_RECIPES[0]!.id);
  const [docs, setDocs] = useState<string[]>([...COOKBOOK_RECIPES[0]!.docs]);
  const [size, setSize] = useState(COOKBOOK_RECIPES[0]!.defaultSize);
  const [models, setModels] = useState<CookbookModel[]>(FALLBACK_COOKBOOK_MODELS);
  const [model, setModel] = useState(() => pickCookbookModel(FALLBACK_COOKBOOK_MODELS));
  const [cards, setCards] = useState<DocCard[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const abort = useRef<AbortController | null>(null);

  const recipe = COOKBOOK_RECIPES.find((item) => item.id === recipeId) ?? COOKBOOK_RECIPES[0]!;
  const roles = useMemo(() => cookbookRoles(recipe, size), [recipe, size]);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/cookbook")
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { models?: CookbookModel[]; model?: string } | null) => {
        if (cancelled || !data?.models?.length) return;
        setModels(data.models);
        setModel((current) => pickCookbookModel(data.models!, current));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!busy) return;
    const id = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(id);
  }, [busy]);

  const selectRecipe = (next: CookbookRecipeMeta) => {
    abort.current?.abort();
    abort.current = null;
    setBusy(false);
    setRecipeId(next.id);
    setDocs([...next.docs]);
    setSize(next.defaultSize);
    setCards([]);
    setStatus("");
    setError(null);
  };

  const stop = useCallback(() => {
    abort.current?.abort();
    abort.current = null;
    setBusy(false);
  }, []);

  const extract = useCallback(async () => {
    if (busy || docs.length === 0) return;
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setCards([]);
    setError(null);
    setBusy(true);
    setNow(Date.now());
    setStatus(`Extracting ${docs[0]}`);
    try {
      const response = await fetch("/api/cookbook", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ recipeId: recipe.id, model, docs, size }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        throw new Error(payload.error ?? `Cookbook failed (${response.status})`);
      }
      await readNdjson(response, (event) => {
        if (event.type === "error") {
          setError(event.message);
          setStatus("");
          return;
        }
        if (event.type === "done") {
          setStatus("");
          return;
        }
        if (event.type === "doc") {
          setStatus(`Extracting ${event.source} · ${event.index + 1}/${event.total}`);
        }
        setCards((prev) => applyEvent(prev, event, roles));
      });
    } catch (caught) {
      if (caught instanceof Error && caught.name === "AbortError") return;
      setError(caught instanceof Error ? caught.message : "Cookbook run failed.");
      setStatus("");
    } finally {
      if (abort.current === controller) abort.current = null;
      setBusy(false);
    }
  }, [busy, docs, model, recipe.id, roles, size]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <AppHeader title="Cookbook" />

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <aside className="flex w-full shrink-0 flex-col gap-4 border-b border-border/50 p-4 lg:w-72 lg:border-r lg:border-b-0">
          <section className="space-y-1">
            <Overline>Recipe</Overline>
            <div className="flex snap-x gap-2 overflow-x-auto pb-1 lg:snap-none lg:flex-col lg:gap-0 lg:overflow-visible lg:border lg:pb-0">
              {COOKBOOK_RECIPES.map((item) => {
                const active = item.id === recipe.id;
                return (
                  <button
                    className={cn(
                      "w-60 shrink-0 snap-start border px-3 py-2 text-left transition-colors lg:w-full lg:border-0",
                      active ? "border-foreground bg-foreground text-background" : "hover:bg-muted",
                    )}
                    key={item.id}
                    onClick={() => selectRecipe(item)}
                    type="button"
                  >
                    <p className="text-sm">{item.title}</p>
                    <p className={cn("text-xs", active ? "text-background/70" : "text-muted-foreground")}>
                      {item.blurb}
                    </p>
                  </button>
                );
              })}
            </div>
          </section>

          {recipe.kind === "table" ? (
            <p className="text-muted-foreground text-xs">
              Describe the table, edit the schema, then extract from a source in the main pane.
            </p>
          ) : (
            <>
              <section className="space-y-2">
                <Overline>Documents</Overline>
                <ul className="flex flex-wrap gap-x-4 gap-y-1.5 lg:flex-col">
                  {recipe.docs.map((name) => {
                    const checked = docs.includes(name);
                    return (
                      <li className="flex items-center gap-2" key={name}>
                        <Checkbox
                          checked={checked}
                          disabled={busy}
                          id={name}
                          onCheckedChange={() =>
                            setDocs((prev) =>
                              prev.includes(name) ? prev.filter((item) => item !== name) : [...prev, name],
                            )
                          }
                        />
                        <label className="cursor-pointer font-mono text-xs leading-none" htmlFor={name}>
                          {name}
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </section>

              <div className="grid grid-cols-2 items-start gap-3 lg:grid-cols-1 lg:gap-4">
                <section className="space-y-2">
                  <Overline>Model</Overline>
                  <ModelPicker disabled={busy} models={models} onSelect={setModel} value={model} />
                </section>

                <section className="space-y-2">
                  <Overline>Agents</Overline>
                  {recipe.lockSize ? (
                    <p className="font-mono text-muted-foreground text-xs">
                      {size} · {roles.join(" / ")}
                    </p>
                  ) : (
                    <ButtonGroup>
                      <Button
                        disabled={busy || size <= 1}
                        onClick={() => setSize((value) => clampCookbookSize(recipe, value - 1))}
                        size="icon-sm"
                        type="button"
                        variant="outline"
                      >
                        <MinusIcon />
                      </Button>
                      <Button disabled size="sm" type="button" variant="outline">
                        {size}
                      </Button>
                      <Button
                        disabled={busy || size >= 8}
                        onClick={() => setSize((value) => clampCookbookSize(recipe, value + 1))}
                        size="icon-sm"
                        type="button"
                        variant="outline"
                      >
                        <PlusIcon />
                      </Button>
                    </ButtonGroup>
                  )}
                </section>
              </div>

              <div className="mt-auto flex gap-2">
                {busy ? (
                  <Button className="flex-1" onClick={stop} type="button" variant="outline">
                    Stop
                  </Button>
                ) : (
                  <Button
                    className="flex-1"
                    disabled={docs.length === 0}
                    onClick={() => void extract()}
                    type="button"
                  >
                    Extract
                  </Button>
                )}
              </div>
            </>
          )}
        </aside>

        <div className={cn("flex min-h-0 min-w-0 flex-1 flex-col", recipe.kind !== "table" && "hidden")}>
          <ExtractApp embedded />
        </div>

        {recipe.kind === "table" ? null : (
          <main className="flex min-h-0 min-w-0 flex-1 flex-col">
            <div className="flex items-baseline justify-between border-b border-border/50 px-4 py-2">
              <Overline>Output</Overline>
              <Overline>
                {displayReduce(recipe.reduce)}
                {busy ? " · running" : cards.length ? ` · ${cards.length}` : ""}
              </Overline>
            </div>
            <ScrollArea className="min-h-0 flex-1">
              <div className="space-y-3 p-4">
                {cards.length === 0 && !error ? (
                  <p className="text-muted-foreground text-sm">Output stays empty until you extract.</p>
                ) : null}
                {error ? <ErrorBanner>{error}</ErrorBanner> : null}
                {cards.map((card) => {
                  const finished = card.agents.filter(
                    (agent) => agent.phase === "done" || agent.phase === "error",
                  ).length;
                  const output = latestOutput(card);
                  const lines = output ? outputLines(output) : [];
                  return (
                    <Artifact key={card.source}>
                      <ArtifactHeader>
                        <div className="min-w-0">
                          <ArtifactTitle>{card.source}</ArtifactTitle>
                          <p className="truncate text-sm">
                            {output ? outputHeading(output) : finished === 0 ? "Extracting" : "—"}
                            {output ? (
                              <span className="text-muted-foreground"> · {outputSubheading(output)}</span>
                            ) : null}
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
                              {displayReduce(card.reduce ?? recipe.reduce)} {finished}/
                              {card.agents.length || size}
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
                                      {agent.phase === "running" ? (
                                        <Shimmer className="text-xs">{summary}</Shimmer>
                                      ) : (
                                        summary
                                      )}
                                    </span>
                                    <span className="shrink-0 text-muted-foreground">{elapsed}</span>
                                  </div>
                                </TaskTrigger>
                                <TaskContent>
                                  <TaskItem>
                                    {agent.error ??
                                      (agent.output
                                        ? JSON.stringify(agent.output, null, 2)
                                        : "Waiting for this agent.")}
                                  </TaskItem>
                                </TaskContent>
                              </Task>
                            );
                          })}
                        </div>
                      </ArtifactContent>
                    </Artifact>
                  );
                })}
              </div>
            </ScrollArea>
            <footer className="min-h-10 shrink-0 border-t border-border/50 px-4 py-2 font-mono text-[11px] text-muted-foreground">
              {status}
            </footer>
          </main>
        )}
      </div>
    </div>
  );
}
