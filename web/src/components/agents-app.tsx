"use client";

import { AgentsResultCard } from "@/components/agents-result";
import { DocumentPane } from "@/components/document-pane";
import { SystemAgentCard } from "@/components/system-agent-card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ErrorBanner } from "@/components/ui/error-banner";
import { Overline } from "@/components/ui/overline";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { applyEvent, readNdjson, type DocCard } from "@/lib/agents-stream";
import {
  addSystemAgent,
  agentModelPool,
  dropCodingAgents,
  removeSystemAgent,
  replaceSystemAgent,
  systemFromTemplate,
  toRunnable,
  SYSTEM_TEMPLATES,
  type ExtractionSystem,
} from "@/lib/agent-system";
import {
  COOKBOOK_DOCS,
  FALLBACK_COOKBOOK_MODELS,
  displayReduce,
  type CookbookEvent,
  type CookbookModel,
} from "@/lib/cookbook-catalog";
import { MAX_SWARM_AGENTS } from "@/lib/models";
import { cn } from "@/lib/utils";
import { PlusIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export function AgentsApp() {
  const [system, setSystem] = useState<ExtractionSystem>(() => systemFromTemplate("audit"));
  const [viewing, setViewing] = useState<string | null>(system.docs[0] ?? null);
  const [gatewayModels, setGatewayModels] = useState<CookbookModel[]>(FALLBACK_COOKBOOK_MODELS);
  const [cards, setCards] = useState<DocCard[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const abort = useRef<AbortController | null>(null);
  const models = useMemo(() => agentModelPool(gatewayModels, system.sandbox), [gatewayModels, system.sandbox]);
  const roles = useMemo(() => system.agents.map((agent) => agent.role), [system.agents]);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/cookbook")
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { models?: CookbookModel[] } | null) => {
        if (cancelled || !data?.models?.length) return;
        setGatewayModels(data.models);
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

  const selectTemplate = (id: string) => {
    abort.current?.abort();
    abort.current = null;
    setBusy(false);
    const next = systemFromTemplate(id);
    setSystem(next);
    setViewing(next.docs[0] ?? null);
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
    if (busy || system.docs.length === 0 || system.agents.length === 0) return;
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setCards([]);
    setError(null);
    setBusy(true);
    setNow(Date.now());
    setStatus(`Extracting ${system.docs[0]}`);
    try {
      const response = await fetch("/api/cookbook", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ system: toRunnable(system) }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        throw new Error(payload.error ?? `System run failed (${response.status})`);
      }
      await readNdjson(response, (event: CookbookEvent) => {
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
          setViewing(event.source);
        }
        setCards((prev) => applyEvent(prev, event, roles));
      });
    } catch (caught) {
      if (caught instanceof Error && caught.name === "AbortError") return;
      setError(caught instanceof Error ? caught.message : "System run failed.");
      setStatus("");
    } finally {
      if (abort.current === controller) abort.current = null;
      setBusy(false);
    }
  }, [busy, roles, system]);

  return (
    <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
      <aside className="flex w-full shrink-0 flex-col border-b border-border/50 lg:h-full lg:w-96 lg:border-r lg:border-b-0">
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          <section className="space-y-1">
            <Overline>System</Overline>
            <p className="text-muted-foreground text-xs">
              Compose specialists — gateway models, Claude Code, Codex — then extract.
            </p>
            <div className="flex snap-x gap-2 overflow-x-auto pb-1 lg:snap-none lg:flex-col lg:gap-0 lg:overflow-visible lg:border lg:pb-0">
              {SYSTEM_TEMPLATES.map((item) => {
                const active = item.id === system.templateId;
                return (
                  <button
                    className={cn(
                      "w-60 shrink-0 snap-start border px-3 py-2 text-left transition-colors lg:w-full lg:border-0",
                      active ? "border-foreground bg-foreground text-background" : "hover:bg-muted",
                    )}
                    key={item.id}
                    onClick={() => selectTemplate(item.id)}
                    type="button"
                  >
                    <p className="text-sm">{item.name}</p>
                    <p className={cn("text-xs", active ? "text-background/70" : "text-muted-foreground")}>
                      {item.blurb}
                    </p>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Overline>Schema</Overline>
              <Select
                disabled={busy}
                onValueChange={(value) =>
                  setSystem((current) => ({
                    ...current,
                    templateId: "custom",
                    schema: value === "audit" ? "audit" : "invoice",
                  }))
                }
                value={system.schema}
              >
                <SelectTrigger className="w-full" size="sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="invoice">Invoice</SelectItem>
                  <SelectItem value="audit">Audit</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Overline>Reduce</Overline>
              <Select
                disabled={busy}
                onValueChange={(value) =>
                  setSystem((current) => ({
                    ...current,
                    templateId: "custom",
                    reduce: value as ExtractionSystem["reduce"],
                  }))
                }
                value={system.reduce}
              >
                <SelectTrigger className="w-full" size="sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="merge">Merge</SelectItem>
                  <SelectItem value="vote">Vote</SelectItem>
                  <SelectItem value="first">First</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </section>

          <label className="flex cursor-pointer items-start gap-2">
            <Checkbox
              checked={system.sandbox}
              disabled={busy}
              onCheckedChange={(value) => {
                const next = value === true;
                setSystem((current) => (next ? { ...current, sandbox: true } : dropCodingAgents(current)));
              }}
            />
            <span className="space-y-0.5">
              <span className="block font-mono text-xs">Sandboxes</span>
              <span className="block text-muted-foreground text-[11px]">
                Claude Code and Codex can join as callable specialists.
              </span>
            </span>
          </label>

          <section className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Overline>Agents</Overline>
              <Button
                disabled={busy || system.agents.length >= MAX_SWARM_AGENTS}
                onClick={() => setSystem((current) => addSystemAgent(current, models))}
                size="xs"
                type="button"
                variant="outline"
              >
                <PlusIcon />
                Add
              </Button>
            </div>
            <ol className="space-y-2">
              {system.agents.map((agent, index) => (
                <SystemAgentCard
                  agent={agent}
                  canRemove={system.agents.length > 1}
                  disabled={busy}
                  index={index}
                  key={`${agent.role}-${index}`}
                  models={models}
                  onChange={(next) => setSystem((current) => replaceSystemAgent(current, index, next))}
                  onRemove={() => setSystem((current) => removeSystemAgent(current, index))}
                />
              ))}
            </ol>
          </section>

          <section className="space-y-2">
            <Overline>Documents</Overline>
            <ul className="flex flex-col gap-0.5">
              {COOKBOOK_DOCS.map((name) => {
                const checked = system.docs.includes(name);
                const active = viewing === name;
                return (
                  <li className="flex items-center gap-2" key={name}>
                    <Checkbox
                      checked={checked}
                      disabled={busy}
                      id={name}
                      onCheckedChange={(value) => {
                        const next = value === true;
                        setSystem((current) => {
                          const has = current.docs.includes(name);
                          if (next === has) return current;
                          return {
                            ...current,
                            docs: next ? [...current.docs, name] : current.docs.filter((item) => item !== name),
                          };
                        });
                        if (next) setViewing(name);
                      }}
                    />
                    <button
                      aria-current={active ? "true" : undefined}
                      className={cn(
                        "min-w-0 flex-1 cursor-pointer truncate border-l-2 py-1 pl-2 text-left font-mono text-xs leading-none",
                        active
                          ? "border-foreground text-foreground"
                          : "border-transparent text-muted-foreground hover:text-foreground",
                      )}
                      onClick={() => setViewing(name)}
                      type="button"
                    >
                      {name}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>

        <div className="flex shrink-0 gap-2 border-t border-border/50 p-4">
          {busy ? (
            <Button className="flex-1" onClick={stop} type="button" variant="outline">
              Stop
            </Button>
          ) : (
            <Button
              className="flex-1"
              disabled={system.docs.length === 0 || system.agents.length === 0}
              onClick={() => void extract()}
              type="button"
            >
              Run system
            </Button>
          )}
        </div>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col lg:flex-row">
        <DocumentPane name={viewing} />
        <main className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="flex items-baseline justify-between border-b border-border/50 px-4 py-2">
            <Overline>Output</Overline>
            <Overline>
              {system.agents.length} agents · {displayReduce(system.reduce)}
              {busy ? " · running" : cards.length ? ` · ${cards.length}` : ""}
            </Overline>
          </div>
          <ScrollArea className="min-h-0 flex-1">
            <div className="space-y-3 p-4">
              {cards.length === 0 && !error ? (
                <p className="text-muted-foreground text-sm">
                  Add specialists, pick documents, then run the system.
                </p>
              ) : null}
              {error ? <ErrorBanner>{error}</ErrorBanner> : null}
              {cards.map((card) => (
                <AgentsResultCard
                  card={card}
                  key={card.source}
                  now={now}
                  onView={setViewing}
                  reduce={system.reduce}
                  size={system.agents.length}
                />
              ))}
            </div>
          </ScrollArea>
          <footer className="min-h-10 shrink-0 border-t border-border/50 px-4 py-2 font-mono text-[11px] text-muted-foreground">
            {status}
          </footer>
        </main>
      </div>
    </div>
  );
}
