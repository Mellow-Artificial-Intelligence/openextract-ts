"use client";

import { AgentsBuilder } from "@/components/agents-builder";
import { AgentsResultCard } from "@/components/agents-result";
import { AppTopbar } from "@/components/app-topbar";
import { DocumentPane } from "@/components/document-pane";
import { Button } from "@/components/ui/button";
import { ErrorBanner } from "@/components/ui/error-banner";
import { Kbd } from "@/components/ui/kbd";
import { Overline } from "@/components/ui/overline";
import { Panel, PanelEmpty } from "@/components/ui/panel";
import { StatusDot } from "@/components/ui/status-dot";
import type { ShellProps } from "@/components/web-app";
import { applyEvent, readNdjson, type DocCard } from "@/lib/agents-stream";
import {
  agentModelPool,
  systemFromStarter,
  toRunnable,
  type ExtractionSystem,
} from "@/lib/agent-system";
import {
  FALLBACK_COOKBOOK_MODELS,
  displayReduce,
  type CookbookEvent,
  type CookbookModel,
} from "@/lib/cookbook-catalog";
import { LayersIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export function AgentsApp({ shell }: { shell: ShellProps }) {
  const [system, setSystem] = useState<ExtractionSystem>(() => systemFromStarter("audit"));
  const [viewing, setViewing] = useState<string | null>(system.docs[0] ?? null);
  const [gatewayModels, setGatewayModels] = useState<CookbookModel[]>(FALLBACK_COOKBOOK_MODELS);
  const [cards, setCards] = useState<DocCard[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const abort = useRef<AbortController | null>(null);
  const models = useMemo(
    () => agentModelPool(gatewayModels, system.sandbox),
    [gatewayModels, system.sandbox],
  );
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

  const selectStarter = useCallback((id: string) => {
    abort.current?.abort();
    abort.current = null;
    setBusy(false);
    const next = systemFromStarter(id);
    setSystem(next);
    setViewing(next.docs[0] ?? null);
    setCards([]);
    setStatus("");
    setError(null);
  }, []);

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

  // Sidebar and command-palette starters land here.
  const handledPreset = useRef(0);
  useEffect(() => {
    const request = shell.preset;
    if (!request || request.nonce === handledPreset.current) return;
    handledPreset.current = request.nonce;
    selectStarter(request.id);
  }, [shell.preset, selectStarter]);

  // Keep the sidebar highlight in step with the system actually loaded.
  const { onPresetApplied } = shell;
  useEffect(() => {
    onPresetApplied(system.starterId);
  }, [onPresetApplied, system.starterId]);

  const runnable = system.docs.length > 0 && system.agents.length > 0;
  const { registerRun } = shell;
  useEffect(() => {
    if (busy) {
      registerRun(stop);
    } else {
      registerRun(runnable ? () => void extract() : null);
    }
    return () => registerRun(null);
  }, [busy, extract, registerRun, runnable, stop]);

  return (
    <>
      <AppTopbar
        actions={
          <span className="hidden items-center gap-2 pr-1 text-muted-foreground text-xs sm:flex">
            <span>{system.agents.length} agents</span>
            <span aria-hidden className="text-faint">
              ·
            </span>
            <span>{displayReduce(system.reduce)}</span>
            <span aria-hidden className="text-faint">
              ·
            </span>
            <span>
              {system.docs.length} doc{system.docs.length === 1 ? "" : "s"}
            </span>
          </span>
        }
        crumb={system.name}
        onCommand={shell.onCommand}
        onMenu={shell.onMenu}
        primary={
          busy ? (
            <Button onClick={stop} size="sm" type="button" variant="outline">
              Stop
            </Button>
          ) : (
            <Button
              className="gap-2"
              disabled={!runnable}
              onClick={() => void extract()}
              size="sm"
              type="button"
            >
              Run system
              <Kbd className="text-primary-foreground/60" keys={["⌘", "↵"]} />
            </Button>
          )
        }
        title="Agents"
      />

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <Panel
          className="w-[min(100%,17rem)] shrink-0 border-r border-border bg-panel/40 md:w-72"
          extra={<Overline as="span">{system.agents.length}</Overline>}
          title="Builder"
        >
          <AgentsBuilder
            busy={busy}
            models={models}
            onStarter={selectStarter}
            onSystem={setSystem}
            onView={setViewing}
            system={system}
            viewing={viewing}
          />
        </Panel>

        <DocumentPane name={viewing} />

        <Panel
          className="min-w-0 flex-1"
          extra={
            <span className="flex items-center gap-2 text-faint text-[11px]">
              {busy ? <StatusDot status="running" /> : null}
              <span>
                {displayReduce(system.reduce)}
                {cards.length ? ` · ${cards.length}` : ""}
              </span>
            </span>
          }
          footer={
            status ? (
              <p className="truncate px-3 py-2 font-mono text-[11px] text-muted-foreground">
                {status}
              </p>
            ) : null
          }
          title="Output"
        >
          {cards.length === 0 && !error ? (
            <PanelEmpty icon={<LayersIcon />}>
              Compose your specialists on the left, then run the system to see each one report.
            </PanelEmpty>
          ) : null}
          <div className="space-y-2.5 p-3">
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
        </Panel>
      </div>
    </>
  );
}
