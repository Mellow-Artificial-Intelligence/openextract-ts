"use client";

import { Panel, PanelEmpty } from "@/components/ui/panel";
import { FileTextIcon, FileWarningIcon } from "lucide-react";
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
    <Panel
      className="hidden min-w-0 flex-1 border-r border-border md:flex"
      extra={
        <span className="max-w-[12rem] truncate font-mono text-[10px] text-muted-foreground">
          {name ?? "—"}
        </span>
      }
      title="Source"
    >
      {error ? <PanelEmpty icon={<FileWarningIcon />}>{error}</PanelEmpty> : null}
      {!error && name && text == null ? (
        <PanelEmpty>Loading {name}…</PanelEmpty>
      ) : null}
      {!error && text != null ? (
        <pre className="whitespace-pre-wrap px-3 py-3 font-mono text-[11.5px] leading-[1.7] text-muted-foreground">
          {text}
        </pre>
      ) : null}
      {!name && !error ? (
        <PanelEmpty icon={<FileTextIcon />}>
          Pick a document in the builder to read its source here.
        </PanelEmpty>
      ) : null}
    </Panel>
  );
}
