"use client";

import { AppHeader } from "@/components/app-header";
import { BuilderInspector } from "@/components/builder-inspector";
import { ExtractSwarmStatus, type SwarmAgentState } from "@/components/extract-swarm";
import { ExtractTable } from "@/components/extract-table";
import { Button } from "@/components/ui/button";
import { useObject } from "@ai-sdk/react";
import type { FileUIPart } from "ai";
import {
  ADDABLE_KINDS,
  createStep,
  defaultPipeline,
  isAddableKind,
  isRunStep,
  moveStepTo,
  patchStep,
  removeStep,
  resolveColumns,
  STEP_CATALOG,
  stepTitle,
  validatePipeline,
  type AddableKind,
  type BuilderStep,
} from "@/lib/builder";
import { fetchExtractRows } from "@/lib/extract-stream";
import { DEFAULT_MODEL, resizeAgentModels } from "@/lib/models";
import { swarmAgentInstructions } from "@/lib/system-prompt";
import {
  mergeStreamedRows,
  normalizeColumns,
  tableSchemaObject,
  unionRows,
  type TableColumn,
  type TableRow,
} from "@/lib/table-schema";
import { cn } from "@/lib/utils";
import {
  ChevronDownIcon,
  ChevronUpIcon,
  GripVerticalIcon,
  PlusIcon,
  Trash2Icon,
  TriangleAlertIcon,
} from "lucide-react";
import { nanoid } from "nanoid";
import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";

const KIND_MIME = "application/x-oe-kind";
const INDEX_MIME = "application/x-oe-index";

function slotFromPoint(list: HTMLElement, clientY: number): number {
  const cards = [...list.querySelectorAll<HTMLElement>("[data-step-index]")];
  for (const card of cards) {
    const rect = card.getBoundingClientRect();
    const index = Number(card.dataset.stepIndex);
    if (clientY < rect.top + rect.height / 2) return Number.isFinite(index) ? index : 1;
  }
  return cards.length;
}

export function ExtractBuilder() {
  const [steps, setSteps] = useState<BuilderStep[]>(defaultPipeline);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sourceFiles, setSourceFiles] = useState<FileUIPart[]>([]);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [swarmAgents, setSwarmAgents] = useState<SwarmAgentState[]>([]);
  const [resultTitle, setResultTitle] = useState("Table");
  const [resultColumns, setResultColumns] = useState<TableColumn[]>([]);
  const [resultRows, setResultRows] = useState<TableRow[]>([]);
  const [tableKey, setTableKey] = useState("init");
  const runAbort = useRef<AbortController | null>(null);
  const generateId = useRef<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selected = steps.find((step) => step.id === selectedId) ?? steps[0];

  const {
    submit: submitSchema,
    isLoading: schemaLoading,
    stop: stopSchema,
    object: schemaObject,
  } = useObject({
    api: "/api/schema",
    schema: tableSchemaObject,
    onFinish({ object }) {
      const id = generateId.current;
      if (!id || !object?.columns) return;
      setSteps((prev) => patchStep(prev, id, { columns: normalizeColumns(object.columns) }));
    },
  });

  useEffect(() => {
    const id = generateId.current;
    if (!schemaLoading || !id || !schemaObject?.columns) return;
    setSteps((prev) => patchStep(prev, id, { columns: normalizeColumns(schemaObject.columns) }));
  }, [schemaLoading, schemaObject]);

  const addKind = useCallback((kind: AddableKind, insertAt?: number) => {
    const step = createStep(kind);
    setSteps((prev) => {
      const next = prev.slice();
      const at = Math.max(1, Math.min(insertAt ?? next.length, next.length));
      next.splice(at, 0, step);
      return next;
    });
    setSelectedId(step.id);
  }, []);

  const startOver = useCallback(() => {
    runAbort.current?.abort();
    stopSchema();
    setSteps(defaultPipeline());
    setSelectedId(null);
    setSourceFiles([]);
    setRunError(null);
    setActiveRunId(null);
    setSwarmAgents([]);
    setResultTitle("Table");
    setResultColumns([]);
    setResultRows([]);
    setTableKey(nanoid());
    setRunning(false);
  }, [stopSchema]);

  const onDragOverList = (event: DragEvent<HTMLDivElement>) => {
    if (![...event.dataTransfer.types].some((type) => type === KIND_MIME || type === INDEX_MIME)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = event.dataTransfer.types.includes(KIND_MIME) ? "copy" : "move";
    const list = listRef.current;
    if (list) setDropIndex(Math.max(1, slotFromPoint(list, event.clientY)));
  };

  const onDropList = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const list = listRef.current;
    const slot = Math.max(1, list ? slotFromPoint(list, event.clientY) : steps.length);
    const kind = event.dataTransfer.getData(KIND_MIME);
    const from = event.dataTransfer.getData(INDEX_MIME);
    if (isAddableKind(kind)) addKind(kind, slot);
    else if (from !== "") setSteps((prev) => moveStepTo(prev, Number(from), slot));
    setDropIndex(null);
    setDragging(false);
  };

  const run = useCallback(async () => {
    const message = validatePipeline(steps, sourceFiles.length > 0);
    if (message) {
      setRunError(message);
      return;
    }
    const files = sourceFiles;
    const sourceText = steps.find((step) => step.kind === "source")?.source ?? "";
    const schemaQuery = steps.find((step) => step.kind === "schema")?.query ?? "";
    runAbort.current?.abort();
    const controller = new AbortController();
    runAbort.current = controller;
    setRunning(true);
    setRunError(null);
    setSwarmAgents([]);
    setResultRows([]);
    setTableKey(nanoid());
    let prior: Array<Record<string, unknown>> = [];
    try {
      for (const step of steps) {
        if (!isRunStep(step)) continue;
        if (controller.signal.aborted) return;
        setActiveRunId(step.id);
        setSelectedId(step.id);
        const columns = resolveColumns(steps, step.id);
        const source = prior.length
          ? `${sourceText}\n\nPrevious step output:\n${JSON.stringify(prior)}`
          : sourceText;
        const query =
          step.kind === "custom" && step.label.trim()
            ? step.label.trim()
            : schemaQuery.trim() || "Extract structured rows from the source.";
        const body = {
          query,
          source,
          files,
          columns,
          style: step.style,
          instructions: step.instructions,
        };
        setResultTitle(stepTitle(step));
        setResultColumns(columns);
        if (step.kind === "swarm") {
          const models = resizeAgentModels(step.agentModels, step.agents, step.model);
          setSwarmAgents(models.map((id) => ({ model: id, status: "running" as const, rows: 0 })));
          const groups: Array<Array<Record<string, unknown>>> = models.map(() => []);
          const outcomes = await Promise.allSettled(
            models.map(async (model, index) => {
              const extracted = await fetchExtractRows(
                { ...body, model, instructions: swarmAgentInstructions(step.instructions, index, models.length) },
                controller.signal,
              );
              groups[index] = extracted;
              setSwarmAgents((prev) =>
                prev.map((agent, i) => (i === index ? { ...agent, status: "done", rows: extracted.length } : agent)),
              );
            }),
          );
          if (controller.signal.aborted) return;
          outcomes.forEach((outcome, index) => {
            if (outcome.status === "rejected") {
              setSwarmAgents((prev) =>
                prev.map((agent, i) => (i === index ? { ...agent, status: "error" } : agent)),
              );
            }
          });
          if (outcomes.every((outcome) => outcome.status === "rejected")) {
            throw new Error("Every swarm agent failed.");
          }
          prior = unionRows(groups);
        } else {
          setSwarmAgents([]);
          prior = await fetchExtractRows({ ...body, model: step.model }, controller.signal);
        }
        setResultRows(mergeStreamedRows([], prior, (index) => `row-${index}`));
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      setRunError(error instanceof Error ? error.message : "Extraction failed");
    } finally {
      if (runAbort.current === controller) runAbort.current = null;
      setRunning(false);
      setActiveRunId(null);
    }
  }, [sourceFiles, steps]);

  const indicator = dropIndex === null ? -1 : dropIndex;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <AppHeader current="builder">
        <Button onClick={startOver} size="sm" type="button" variant="outline">
          <PlusIcon />
          <span className="hidden sm:inline">New</span>
        </Button>
        {running ? (
          <Button
            onClick={() => {
              runAbort.current?.abort();
              setRunning(false);
              setActiveRunId(null);
            }}
            size="sm"
            type="button"
            variant="outline"
          >
            Stop
          </Button>
        ) : (
          <Button onClick={() => void run()} size="sm" type="button">
            Run
          </Button>
        )}
      </AppHeader>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <aside className="shrink-0 border-black/5 lg:w-52 lg:border-r">
          <div className="px-3 py-2 sm:px-4 sm:py-3">
            <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">Steps</p>
            <p className="hidden text-muted-foreground text-xs lg:block">Drag onto the pipeline, or click to add.</p>
          </div>
          <ul className="flex gap-1.5 overflow-x-auto px-3 pb-3 lg:flex-col lg:overflow-visible lg:px-3">
            {ADDABLE_KINDS.map((kind) => (
              <li key={kind}>
                <button
                  className="flex w-full min-w-28 flex-col items-start gap-0.5 border border-black/10 bg-background px-2.5 py-2 text-left transition-colors hover:bg-muted/60 lg:min-w-0"
                  draggable
                  onClick={() => addKind(kind)}
                  onDragEnd={() => {
                    setDragging(false);
                    setDropIndex(null);
                  }}
                  onDragStart={(event) => {
                    event.dataTransfer.setData(KIND_MIME, kind);
                    event.dataTransfer.effectAllowed = "copy";
                    setDragging(true);
                  }}
                  type="button"
                >
                  <span className="font-medium text-sm">{STEP_CATALOG[kind].label}</span>
                  <span className="hidden text-muted-foreground text-xs lg:block">{STEP_CATALOG[kind].hint}</span>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col border-black/5 max-lg:border-t lg:border-r">
          <div className="shrink-0 px-3 py-2 sm:px-4 sm:py-3">
            <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">Pipeline</p>
            <p className="text-muted-foreground text-xs">
              {steps.filter(isRunStep).length} extract {steps.filter(isRunStep).length === 1 ? "step" : "steps"}
            </p>
          </div>
          <div
            className={cn(
              "min-h-0 flex-1 overflow-y-auto px-3 pb-4 sm:px-4",
              dragging && "bg-muted/30",
            )}
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node)) setDropIndex(null);
            }}
            onDragOver={onDragOverList}
            onDrop={onDropList}
            ref={listRef}
          >
            <ol className="mx-auto flex w-full max-w-xl flex-col">
              {steps.map((step, index) => (
                <li key={step.id}>
                  {indicator === index ? <DropLine /> : null}
                  <article
                    className={cn(
                      "flex items-stretch border border-black/10 bg-background",
                      selected?.id === step.id && "border-foreground/40 bg-muted/40",
                      activeRunId === step.id && "border-foreground",
                      index > 0 && "mt-2",
                    )}
                    data-step-index={index}
                  >
                    <button
                      aria-label={`Reorder ${stepTitle(step)}`}
                      className={cn(
                        "flex shrink-0 cursor-grab items-center px-1.5 text-muted-foreground active:cursor-grabbing",
                        step.kind === "source" && "pointer-events-none opacity-30",
                      )}
                      draggable={step.kind !== "source"}
                      onDragEnd={() => {
                        setDragging(false);
                        setDropIndex(null);
                      }}
                      onDragStart={(event) => {
                        event.dataTransfer.setData(INDEX_MIME, String(index));
                        event.dataTransfer.effectAllowed = "move";
                        setDragging(true);
                      }}
                      type="button"
                    >
                      <GripVerticalIcon className="size-4" />
                    </button>
                    <button
                      className="min-w-0 flex-1 px-2 py-2.5 text-left"
                      onClick={() => setSelectedId(step.id)}
                      type="button"
                    >
                      <span className="block font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
                        {index + 1} · {STEP_CATALOG[step.kind].label}
                        {activeRunId === step.id ? " · running" : ""}
                      </span>
                      <span className="block truncate font-medium text-sm">{stepTitle(step)}</span>
                      <span className="block truncate text-muted-foreground text-xs">
                        {step.kind === "source"
                          ? step.source.trim() || (sourceFiles.length ? `${sourceFiles.length} file(s)` : "Empty")
                          : step.kind === "schema"
                            ? step.columns.length
                              ? `${step.columns.length} columns`
                              : step.query || "No columns yet"
                            : step.kind === "custom"
                              ? step.columns.length
                                ? `${step.style} · ${step.columns.length} fields`
                                : step.fields || step.style
                              : step.kind === "swarm"
                                ? `${step.agents} agents · ${step.style}`
                                : step.style}
                      </span>
                    </button>
                    <div className="flex shrink-0 flex-col justify-center gap-0.5 pr-1">
                      <Button
                        aria-label="Move up"
                        disabled={step.kind === "source" || index <= 1}
                        onClick={() => setSteps((prev) => moveStepTo(prev, index, index - 1))}
                        size="icon-xs"
                        type="button"
                        variant="ghost"
                      >
                        <ChevronUpIcon />
                      </Button>
                      <Button
                        aria-label="Move down"
                        disabled={step.kind === "source" || index >= steps.length - 1}
                        onClick={() => setSteps((prev) => moveStepTo(prev, index, index + 2))}
                        size="icon-xs"
                        type="button"
                        variant="ghost"
                      >
                        <ChevronDownIcon />
                      </Button>
                      <Button
                        aria-label={`Remove ${stepTitle(step)}`}
                        disabled={step.kind === "source"}
                        onClick={() => {
                          setSteps((prev) => removeStep(prev, step.id));
                          if (selectedId === step.id) setSelectedId(null);
                        }}
                        size="icon-xs"
                        type="button"
                        variant="ghost"
                      >
                        <Trash2Icon />
                      </Button>
                    </div>
                  </article>
                </li>
              ))}
              {indicator === steps.length ? <DropLine /> : null}
            </ol>
          </div>
        </div>

        <aside className="flex min-h-0 w-full shrink-0 flex-col border-black/5 max-lg:border-t lg:w-80">
          <BuilderInspector
            generating={schemaLoading}
            onGenerate={() => {
              if (selected?.kind !== "schema" || !selected.query.trim()) return;
              generateId.current = selected.id;
              submitSchema({
                query: selected.query,
                source: steps.find((step) => step.kind === "source")?.source,
                model: DEFAULT_MODEL,
              });
            }}
            onPatch={(patch) => {
              if (!selected) return;
              setSteps((prev) => patchStep(prev, selected.id, patch));
            }}
            onSourceFiles={setSourceFiles}
            onStopGenerate={stopSchema}
            sourceFiles={sourceFiles}
            step={selected}
          />
        </aside>
      </div>

      <div className="flex min-h-0 flex-1 flex-col border-t border-black/5">
        {runError ? (
          <div className="flex shrink-0 items-start gap-2 border-b border-destructive/20 bg-destructive/10 px-3 py-2 text-destructive text-sm sm:px-4">
            <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" />
            <span className="min-w-0 flex-1">{runError}</span>
          </div>
        ) : null}
        <ExtractSwarmStatus agents={swarmAgents} />
        <ExtractTable
          columns={resultColumns}
          emptyHint="Run the pipeline to fill rows. Each extract, swarm, or custom step calls extract."
          extracting={running}
          key={tableKey}
          onColumnsChange={setResultColumns}
          onRowsChange={setResultRows}
          rows={resultRows}
          schemaLoading={false}
          title={resultTitle}
        />
      </div>
    </div>
  );
}

function DropLine() {
  return <div aria-hidden className="my-1 h-0.5 bg-foreground" />;
}
