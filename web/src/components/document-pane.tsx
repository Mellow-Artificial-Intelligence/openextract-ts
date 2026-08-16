"use client";

import { AgentsPane } from "@/components/agents-pane";
import { useEffect, useState } from "react";

const cache = new Map<string, string>();

export function DocumentPane({ name }: { name: string | null }) {
  const [text, setText] = useState<string | null>(name ? (cache.get(name) ?? null) : null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!name) {
      setText(null);
      setError(null);
      return;
    }
    const hit = cache.get(name);
    if (hit != null) {
      setText(hit);
      setError(null);
      return;
    }
    const controller = new AbortController();
    setText(null);
    setError(null);
    void fetch(`/api/cookbook/docs/${encodeURIComponent(name)}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Couldn't load this document.");
        return response.text();
      })
      .then((body) => {
        cache.set(name, body);
        setText(body);
      })
      .catch((caught) => {
        if (caught instanceof Error && caught.name === "AbortError") return;
        setError(caught instanceof Error ? caught.message : "Couldn't load this document.");
      });
    return () => controller.abort();
  }, [name]);

  return (
    <AgentsPane
      className="hidden min-w-0 flex-1 border-r border-border/50 md:flex"
      extra={
        <span className="max-w-[12rem] truncate font-mono text-[10px] text-muted-foreground">{name ?? "—"}</span>
      }
      title="Source"
    >
      <div className="px-3 py-3">
        {error ? <p className="text-muted-foreground text-sm">{error}</p> : null}
        {!error && name && text == null ? (
          <p className="font-mono text-muted-foreground text-xs">Loading…</p>
        ) : null}
        {text != null ? (
          <pre className="whitespace-pre-wrap font-mono text-[12px] leading-[1.65] text-foreground/80">
            {text}
          </pre>
        ) : null}
        {!name && !error ? (
          <p className="text-muted-foreground text-sm">Select a document to read it here.</p>
        ) : null}
      </div>
    </AgentsPane>
  );
}
