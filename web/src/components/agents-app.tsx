"use client";

import { AgentsBuilder } from "@/components/agents-builder";
import { AgentsPane } from "@/components/agents-pane";
import { AgentsResultCard } from "@/components/agents-result";
import { DocumentPane } from "@/components/document-pane";
import { Button } from "@/components/ui/button";
import { ErrorBanner } from "@/components/ui/error-banner";
import { Overline } from "@/components/ui/overline";
import { applyEvent, readNdjson, type DocCard } from "@/lib/agents-stream";
import { agentModelPool, systemFromStarter, toRunnable, type ExtractionSystem } from "@/lib/agent-system";
import {
  FALLBACK_COOKBOOK_MODELS,
  displayReduce,
  type CookbookEvent,
  type CookbookModel,
} from "@/lib/cookbook-catalog";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export function AgentsApp() {
  const [system, setSystem] = useState<ExtractionSystem>(() => systemFromStarter("audit"));
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

  const selectStarter = (id: string) => {
    abort.current?.abort();
    abort.current = null;
    setBusy(false);
    const next = systemFromStarter(id);
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
    <div className="flex min-h-0 flex-1 overflow-hidden">
      <aside className="flex min-h-0 w-[min(100%,20rem)] shrink-0 flex-col overflow-hidden border-r border-border/50">
        <AgentsPane
          className="min-h-0 flex-1"
          extra={<Overline as="span">{system.agents.length}</Overline>}
          title="Builder"
        >
          <AgentsBuilder
            busy={busy}
            models={models}
            onSystem={setSystem}
            onStarter={selectStarter}
            onView={setViewing}
            system={system}
            viewing={viewing}
          />
        </AgentsPane>
        <div className="shrink-0 border-t border-border/50 p-3">
          {busy ? (
            <Button className="w-full" onClick={stop} type="button" variant="outline">
              Stop
            </Button>
          ) : (
            <Button
              className="w-full"
              disabled={system.docs.length === 0 || system.agents.length === 0}
              onClick={() => void extract()}
              type="button"
            >
              Run
            </Button>
          )}
        </div>
      </aside>

      <DocumentPane name={viewing} />

      <AgentsPane
        className="min-w-0 flex-1"
        extra={
          <Overline as="span">
            {displayReduce(system.reduce)}
            {busy ? " · running" : cards.length ? ` · ${cards.length}` : ""}
          </Overline>
        }
        title="Output"
      >
        <div className="space-y-3 p-3">
          {cards.length === 0 && !error ? (
            <p className="text-muted-foreground text-sm">Compose specialists, then run.</p>
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
        {status ? (
          <footer className="sticky bottom-0 border-t border-border/50 bg-background px-3 py-2 font-mono text-[11px] text-muted-foreground">
            {status}
          </footer>
        ) : null}
      </AgentsPane>
    </div>
  );
}
