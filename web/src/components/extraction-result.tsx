"use client";

import {
  Artifact,
  ArtifactAction,
  ArtifactActions,
  ArtifactDescription,
  ArtifactHeader,
  ArtifactTitle,
} from "@/components/ai-elements/artifact";
import { CodeBlock } from "@/components/ai-elements/code-block";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { cn } from "@/lib/utils";
import { countFields, isPlainObject, parseStreamingJson } from "@/lib/extraction";
import { BracesIcon, CheckIcon, CopyIcon, ListIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";

type ResultView = "fields" | "json";

const COPIED_RESET_MS = 1500;

function useCopyToClipboard() {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), COPIED_RESET_MS);
    return () => clearTimeout(timer);
  }, [copied]);

  const copy = async (value: string) => {
    if (!navigator?.clipboard?.writeText) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      // Clipboard access can be blocked; leaving the icon unchanged is enough.
    }
  };

  return { copied, copy };
}

function EmptyValue({ label = "—" }: { label?: string }) {
  return <span className="text-muted-foreground">{label}</span>;
}

function ValueChip({ children }: { children: ReactNode }) {
  return (
    <span className="border border-black/10 bg-card px-1.5 py-0.5 font-mono text-foreground text-xs">
      {children}
    </span>
  );
}

function FieldValue({ value }: { value: unknown }) {
  if (value === null || value === undefined) {
    return <EmptyValue />;
  }
  if (typeof value === "boolean") {
    return <ValueChip>{String(value)}</ValueChip>;
  }
  if (typeof value === "number") {
    return <span className="font-mono tabular-nums">{value}</span>;
  }
  if (typeof value === "string") {
    return value ? (
      <span className="whitespace-pre-wrap break-words">{value}</span>
    ) : (
      <EmptyValue />
    );
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return <EmptyValue label="Empty" />;
    }
    if (value.every((item) => !isPlainObject(item) && !Array.isArray(item))) {
      return (
        <div className="flex flex-wrap gap-1">
          {value.map((item, index) => (
            <ValueChip key={index}>{item === null ? "null" : String(item)}</ValueChip>
          ))}
        </div>
      );
    }
    return (
      <div className="grid gap-1.5">
        {value.map((item, index) => (
          <div
            className="fade-in slide-in-from-bottom-1 animate-in border border-black/10 bg-card px-2.5 py-1.5"
            key={index}
          >
            <div className="font-mono text-[0.7rem] text-muted-foreground">{index + 1}</div>
            <FieldValue value={item} />
          </div>
        ))}
      </div>
    );
  }
  if (isPlainObject(value)) {
    return <FieldList nested value={value} />;
  }
  return <EmptyValue />;
}

function FieldList({
  value,
  nested = false,
}: {
  value: Record<string, unknown>;
  nested?: boolean;
}) {
  const entries = Object.entries(value);
  if (entries.length === 0) {
    return nested ? <EmptyValue label="Empty" /> : null;
  }

  return (
    <dl className={cn(!nested && "divide-y")}>
      {entries.map(([key, item]) => (
        <div
          className={cn(
            "fade-in slide-in-from-bottom-1 grid animate-in gap-0.5 sm:gap-4",
            nested
              ? "py-0.5 sm:grid-cols-[minmax(0,7rem)_minmax(0,1fr)]"
              : "py-2.5 sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)]"
          )}
          key={key}
        >
          <dt className="truncate font-mono text-muted-foreground text-xs sm:pt-px" title={key}>
            {key}
          </dt>
          <dd className="min-w-0 text-sm">
            <FieldValue value={item} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

function ViewToggle({
  view,
  onView,
}: {
  view: ResultView;
  onView: (view: ResultView) => void;
}) {
  return (
    <ButtonGroup aria-label="Result view">
      <Button
        aria-pressed={view === "fields"}
        onClick={() => onView("fields")}
        size="xs"
        type="button"
        variant={view === "fields" ? "secondary" : "ghost"}
      >
        <ListIcon />
        Fields
      </Button>
      <Button
        aria-pressed={view === "json"}
        onClick={() => onView("json")}
        size="xs"
        type="button"
        variant={view === "json" ? "secondary" : "ghost"}
      >
        <BracesIcon />
        JSON
      </Button>
    </ButtonGroup>
  );
}

export function ExtractionResult({
  jsonText,
  complete,
  streaming,
}: {
  jsonText: string;
  complete: boolean;
  streaming: boolean;
}) {
  const [view, setView] = useState<ResultView>("fields");
  const { copied, copy } = useCopyToClipboard();

  const value = useMemo(() => parseStreamingJson(jsonText), [jsonText]);
  const formatted = useMemo(() => {
    if (complete && value !== undefined) return JSON.stringify(value, null, 2);
    return jsonText.trim();
  }, [complete, jsonText, value]);

  const fieldCount = countFields(value);

  return (
    <Artifact className="w-full">
      <ArtifactHeader className="gap-2 px-3 py-2.5 sm:px-4">
        <div className="flex min-w-0 items-center gap-2">
          <ArtifactTitle>
            {/* Shimmer renders a <p> by default, which cannot nest inside ArtifactTitle. */}
            {streaming ? <Shimmer as="span">Extracting…</Shimmer> : "Result"}
          </ArtifactTitle>
          {fieldCount > 0 ? (
            <ArtifactDescription className="hidden shrink-0 font-mono text-[10px] sm:block">
              {fieldCount} {fieldCount === 1 ? "field" : "fields"}
            </ArtifactDescription>
          ) : null}
        </div>
        <ArtifactActions>
          <ViewToggle onView={setView} view={view} />
          <ArtifactAction
            disabled={!formatted}
            icon={copied ? CheckIcon : CopyIcon}
            label="Copy JSON"
            onClick={() => copy(formatted)}
            tooltip="Copy JSON"
          />
        </ArtifactActions>
      </ArtifactHeader>

      {view === "fields" ? (
        <div className="px-3 py-1">
          {isPlainObject(value) ? (
            <FieldList value={value} />
          ) : value === undefined ? (
            <p className="py-2 text-muted-foreground text-sm">Waiting for the first field…</p>
          ) : (
            <div className="py-2 text-sm">
              <FieldValue value={value} />
            </div>
          )}
        </div>
      ) : (
        <CodeBlock code={formatted || "…"} language="json" />
      )}
    </Artifact>
  );
}
