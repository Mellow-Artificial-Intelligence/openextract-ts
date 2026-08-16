"use client";

import { ExtractSettings } from "@/components/extract-settings";
import { ExtractSteps, type FlowStep } from "@/components/extract-steps";
import { ExtractSwarmStatus, type SwarmAgentState } from "@/components/extract-swarm";
import { ExtractTable } from "@/components/extract-table";
import {
  Attachment,
  AttachmentPreview,
  AttachmentRemove,
  Attachments,
} from "@/components/ai-elements/attachments";
import {
  PromptInput,
  PromptInputActionAddAttachments,
  PromptInputActionMenu,
  PromptInputActionMenuContent,
  PromptInputActionMenuTrigger,
  PromptInputBody,
  PromptInputFooter,
  PromptInputHeader,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  usePromptInputAttachments,
  type PromptInputMessage,
} from "@/components/ai-elements/prompt-input";
import { Suggestion, Suggestions } from "@/components/ai-elements/suggestion";
import { AppHeader } from "@/components/app-header";
import { ModelPicker } from "@/components/model-picker";
import { Button } from "@/components/ui/button";
import { ErrorBanner } from "@/components/ui/error-banner";
import { Overline } from "@/components/ui/overline";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useObject } from "@ai-sdk/react";
import type { FileUIPart } from "ai";
import {
  ChevronDownIcon,
  ChevronLeftIcon,
  PlusIcon,
  SlidersHorizontalIcon,
} from "lucide-react";
import { nanoid } from "nanoid";
import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { fetchExtractRows } from "@/lib/extract-stream";
import {
  DEFAULT_MODEL,
  GATEWAY_MODELS,
  MODELS,
  isCodingAgentId,
  isModelId,
  type ModelId,
  type SwarmSize,
} from "@/lib/models";
import {
  composeExtractModel,
  extractCodingOptions,
  resizeAgentSpecs,
  specForModel,
  type AgentSpec,
} from "@/lib/harness";
import { EXAMPLES, type StyleName } from "@/lib/presets";
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

function sourceSummary(source: string, files: FileUIPart[]) {
  const chars = source.trim().length;
  if (!chars && files.length === 0) return "Paste text or attach a file";
  const parts: string[] = [];
  if (chars) parts.push(`${chars} chars`);
  if (files.length) parts.push(`${files.length} file${files.length === 1 ? "" : "s"}`);
  return parts.join(" · ");
}

function PromptAttachments() {
  const attachments = usePromptInputAttachments();
  if (attachments.files.length === 0) return null;
  return (
    <Attachments variant="inline">
      {attachments.files.map((file) => (
        <Attachment data={file} key={file.id} onRemove={() => attachments.remove(file.id)}>
          <AttachmentPreview />
          <AttachmentRemove />
        </Attachment>
      ))}
    </Attachments>
  );
}

function SourceFiles({ onFiles }: { onFiles: (files: FileUIPart[]) => void }) {
  const attachments = usePromptInputAttachments();
  const files = attachments.files;
  const prev = useRef("");
  useEffect(() => {
    const key = files.map((file) => file.id).join(",");
    if (key === prev.current) return;
    prev.current = key;
    onFiles(files);
  }, [files, onFiles]);
  return null;
}

async function withDataUrls(files: FileUIPart[]): Promise<FileUIPart[]> {
  return Promise.all(
    files.map(async (file) => {
      if (!file.url.startsWith("blob:")) return file;
      const response = await fetch(file.url);
      const blob = await response.blob();
      const url = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
      });
      return { ...file, url };
    }),
  );
}

function StepFooter({ children }: { children: React.ReactNode }) {
  return (
    <div className="shrink-0 border-t border-border/50 bg-background px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-4">
      <div className="mx-auto flex w-full max-w-3xl items-center gap-2">{children}</div>
    </div>
  );
}

export function ExtractApp({ embedded = false }: { embedded?: boolean } = {}) {
  const [step, setStep] = useState<FlowStep>("describe");
  const [model, setModel] = useState<ModelId>(DEFAULT_MODEL);
  const [style, setStyle] = useState<StyleName>("direct");
  const [sandbox, setSandbox] = useState(true);
  const [workflow, setWorkflow] = useState(true);
  const [agents, setAgents] = useState<SwarmSize>(1);
  const [team, setTeam] = useState<AgentSpec[]>([{ id: DEFAULT_MODEL }]);
  const [swarmAgents, setSwarmAgents] = useState<SwarmAgentState[]>([]);
  const [swarmError, setSwarmError] = useState<Error | null>(null);
  const swarmAbort = useRef<AbortController | null>(null);
  const [instructions, setInstructions] = useState("");
  const [query, setQuery] = useState("");
  const [source, setSource] = useState("");
  const [sourceFiles, setSourceFiles] = useState<FileUIPart[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sourceKey, setSourceKey] = useState(0);
  const [title, setTitle] = useState("Table");
  const [columns, setColumns] = useState<TableColumn[]>([]);
  const [rows, setRows] = useState<TableRow[]>([]);
  const [tableKey, setTableKey] = useState("init");
  const [sourceOpen, setSourceOpen] = useState(true);
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState<Error | null>(null);
  const extractAbort = useRef<AbortController | null>(null);

  const {
    object: schemaObject,
    submit: submitSchema,
    isLoading: schemaLoading,
    stop: stopSchema,
    error: schemaError,
    clear: clearSchema,
  } = useObject({
    api: "/api/schema",
    schema: tableSchemaObject,
    onFinish({ object }) {
      if (!object?.columns) return;
      setColumns(normalizeColumns(object.columns));
      if (object.title?.trim()) setTitle(object.title.trim());
    },
  });

  const stopExtract = useCallback(() => {
    extractAbort.current?.abort();
    extractAbort.current = null;
    setExtracting(false);
  }, []);

  const clearExtract = useCallback(() => {
    setExtractError(null);
  }, []);

  const swarming = swarmAgents.some((agent) => agent.status === "pending" || agent.status === "running");
  const busy = schemaLoading || extracting || swarming;
  const error = schemaError ?? extractError ?? swarmError;
  const hasSource = Boolean(source.trim() || sourceFiles.length);
  const streamedColumns = normalizeColumns(schemaObject?.columns);
  const displayColumns = schemaLoading || columns.length === 0 ? streamedColumns : columns;
  const displayTitle =
    schemaLoading && schemaObject?.title?.trim() ? schemaObject.title.trim() : title;
  const displayRows = rows;
  const schemaReady = schemaLoading || displayColumns.length > 0;
  const extractReady = displayColumns.length > 0;

  const setDisplayColumns: Dispatch<SetStateAction<TableColumn[]>> = (update) => {
    setColumns((prev) => {
      const base = schemaLoading || prev.length === 0 ? streamedColumns : prev;
      return typeof update === "function" ? update(base) : update;
    });
  };

  const setDisplayRows: Dispatch<SetStateAction<TableRow[]>> = (update) => {
    setRows((prev) => (typeof update === "function" ? update(prev) : update));
  };

  const stopSwarm = useCallback(() => {
    swarmAbort.current?.abort();
    setSwarmAgents((prev) =>
      prev.map((agent) =>
        agent.status === "running" || agent.status === "pending" ? { ...agent, status: "done" } : agent,
      ),
    );
  }, []);

  const generate = useCallback(
    (nextQuery = query, nextSource = source) => {
      const trimmed = nextQuery.trim();
      if (!trimmed || busy) return;
      stopExtract();
      stopSwarm();
      clearExtract();
      setSwarmAgents([]);
      setSwarmError(null);
      setColumns([]);
      setRows([]);
      setTitle("Table");
      setTableKey(nanoid());
      setStep("schema");
      submitSchema({
        query: trimmed,
        source: nextSource,
        model: isCodingAgentId(model) ? DEFAULT_MODEL : model,
      });
    },
    [busy, clearExtract, model, query, source, stopExtract, stopSwarm, submitSchema],
  );

  const extract = useCallback(async () => {
    if (displayColumns.length === 0 || busy) return;
    const files = await withDataUrls(sourceFiles);
    if (!query.trim() && !source.trim() && files.length === 0) return;
    stopSchema();
    setSourceOpen(false);
    const members = team.length > 0 ? team : [specForModel(model)];
    extractAbort.current?.abort();
    swarmAbort.current?.abort();
    const controller = new AbortController();
    extractAbort.current = controller;
    swarmAbort.current = controller;
    setExtractError(null);
    setSwarmError(null);
    setRows([]);
    if (members.length === 1) {
      const spec = members[0] ?? specForModel(model);
      setSwarmAgents([]);
      setExtracting(true);
      try {
        const extracted = await fetchExtractRows(
          {
            query,
            source,
            files,
            columns: displayColumns,
            model: composeExtractModel(spec),
            style,
            instructions,
            sandbox,
            workflow,
            coding: extractCodingOptions(spec),
          },
          controller.signal,
        );
        setRows(mergeStreamedRows([], extracted, (index) => `row-${index}`));
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") return;
        setExtractError(error instanceof Error ? error : new Error("Extraction failed"));
      } finally {
        if (extractAbort.current === controller) extractAbort.current = null;
        setExtracting(false);
      }
      return;
    }
    setExtracting(false);
    setSwarmAgents(members.map((spec) => ({ model: composeExtractModel(spec), status: "running" as const, rows: 0 })));
    const groups: Array<Array<Record<string, unknown>>> = members.map(() => []);
    const publish = () => {
      const merged = unionRows(groups);
      setRows(merged.map((values, index) => ({ id: `swarm-${index}`, values })));
    };
    const outcomes = await Promise.allSettled(
      members.map(async (spec, index) => {
        const extractModel = composeExtractModel(spec);
        const extracted = await fetchExtractRows(
          {
            query,
            source,
            files,
            columns: displayColumns,
            model: extractModel,
            style,
            instructions: swarmAgentInstructions({
              instructions,
              index,
              total: members.length,
              model: extractModel,
            }),
            sandbox,
            workflow,
            coding: extractCodingOptions(spec),
          },
          controller.signal,
        );
        groups[index] = extracted;
        setSwarmAgents((prev) =>
          prev.map((agent, i) => (i === index ? { ...agent, status: "done", rows: extracted.length } : agent)),
        );
        publish();
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
      setSwarmError(new Error("Every swarm agent failed."));
    }
    if (swarmAbort.current === controller) swarmAbort.current = null;
  }, [busy, displayColumns, instructions, model, query, sandbox, source, sourceFiles, stopSchema, style, team, workflow]);

  const submitQuery = useCallback(
    (message: PromptInputMessage) => {
      generate(message.text, source);
    },
    [generate, source],
  );

  const loadExample = useCallback(
    (example: (typeof EXAMPLES)[number]) => {
      if (busy) return;
      setQuery(example.query);
      setSource(example.text);
      generate(example.query, example.text);
    },
    [busy, generate],
  );

  const startOver = useCallback(() => {
    stopSchema();
    stopExtract();
    stopSwarm();
    clearSchema();
    clearExtract();
    setSwarmAgents([]);
    setSwarmError(null);
    setStep("describe");
    setQuery("");
    setSource("");
    setSourceFiles([]);
    setColumns([]);
    setRows([]);
    setTitle("Table");
    setTableKey(nanoid());
    setSourceKey((key) => key + 1);
    setAgents(1);
    setTeam((prev) => [specForModel(model, prev[0])]);
    setSourceOpen(true);
  }, [clearExtract, clearSchema, model, stopExtract, stopSchema, stopSwarm]);

  const table = (
    <ExtractTable
      columns={displayColumns}
      emptyHint={
        step === "extract"
          ? "Paste a source or attach a file, then extract to fill the rows."
          : "Columns stream in here. Edit them, then continue to add a source."
      }
      extracting={extracting || swarming}
      key={tableKey}
      onColumnsChange={setDisplayColumns}
      onRowsChange={setDisplayRows}
      rows={displayRows}
      schemaLoading={schemaLoading}
      title={displayTitle}
    />
  );

  const modelPicker = (
    <ModelPicker
      models={sandbox ? MODELS : GATEWAY_MODELS}
      onSelect={(id) => {
        setModel(id);
        setTeam((prev) => (agents === 1 ? [specForModel(id, prev[0])] : prev));
      }}
      trigger="prompt"
      value={model}
    />
  );

  const actions = (
    <>
      {step !== "describe" || query || source ? (
        <Button onClick={startOver} size="sm" type="button" variant="outline">
          <PlusIcon />
          <span className="hidden sm:inline">New</span>
        </Button>
      ) : null}
      <Button
        aria-label="Extraction settings"
        onClick={() => setSettingsOpen(true)}
        size="sm"
        type="button"
        variant="outline"
      >
        <SlidersHorizontalIcon />
        <span className="hidden capitalize sm:inline">
          {agents > 1 ? `${agents} agents` : sandbox && isCodingAgentId(model) ? "sandbox" : style}
        </span>
      </Button>
    </>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {embedded ? (
        <div className="flex shrink-0 items-center justify-end gap-2 border-b border-border/50 px-3 py-2 sm:px-4">
          {actions}
        </div>
      ) : (
        <AppHeader title="openextract">{actions}</AppHeader>
      )}

      <ExtractSteps
        extractReady={extractReady}
        onStep={setStep}
        schemaReady={schemaReady}
        step={step}
      />

      <Sheet onOpenChange={setSettingsOpen} open={settingsOpen}>
        <SheetContent className="w-full gap-0 data-[side=right]:w-full sm:max-w-sm" side="right">
          <SheetHeader>
            <SheetTitle>Team</SheetTitle>
            <SheetDescription>
              Orchestrate gateway models and coding agents on one source.
            </SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <ExtractSettings
              agents={agents}
              instructions={instructions}
              onAgents={(count) => {
                setAgents(count);
                setTeam((prev) =>
                  resizeAgentSpecs(prev, count, specForModel(model, prev[0]), sandbox ? MODELS : GATEWAY_MODELS),
                );
              }}
              onInstructions={setInstructions}
              onMember={(index, spec) => {
                setTeam((prev) => prev.map((item, i) => (i === index ? spec : item)));
                if (agents === 1 && isModelId(spec.id)) setModel(spec.id);
              }}
              onSandbox={(next) => {
                setSandbox(next);
                if (next) return;
                setModel((current) => (isCodingAgentId(current) ? DEFAULT_MODEL : current));
                setTeam((current) => current.map((spec) => (isCodingAgentId(spec.id) ? { id: DEFAULT_MODEL } : spec)));
              }}
              onStyle={setStyle}
              onWorkflow={setWorkflow}
              sandbox={sandbox}
              style={style}
              team={team}
              workflow={workflow}
            />
          </div>
        </SheetContent>
      </Sheet>

      {step === "describe" ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto flex min-h-full w-full max-w-lg flex-col gap-4 p-4 sm:justify-center sm:p-6">
            <div className="space-y-1">
              <Overline>Step 1</Overline>
              <h1 className="font-medium text-lg sm:text-xl">What should the table contain?</h1>
              <p className="text-muted-foreground text-sm">
                Describe the columns you want. We&apos;ll generate a schema you can edit before extracting.
              </p>
            </div>
            <PromptInput clearOnSubmit={false} onSubmit={submitQuery}>
              <PromptInputBody>
                <PromptInputTextarea
                  className="min-h-24 max-h-40 text-sm sm:min-h-28"
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="e.g. invoice line items with quantity, unit price, and amount"
                  submitOnEnter={false}
                  value={query}
                />
              </PromptInputBody>
              <PromptInputFooter className="gap-2 border-t border-border/50">
                <PromptInputTools className="min-w-0 flex-1 overflow-hidden">
                  {modelPicker}
                </PromptInputTools>
                <PromptInputSubmit
                  className="h-9 px-3"
                  disabled={(!query.trim() && !schemaLoading) || extracting}
                  onStop={stopSchema}
                  size="sm"
                  status={schemaLoading ? "streaming" : "ready"}
                >
                  {schemaLoading ? undefined : "Generate"}
                </PromptInputSubmit>
              </PromptInputFooter>
            </PromptInput>
            <div className="space-y-2">
              <Overline>Try an example</Overline>
              <Suggestions>
                {EXAMPLES.map((example) => (
                  <Suggestion
                    key={example.label}
                    onClick={() => loadExample(example)}
                    suggestion={example.label}
                  />
                ))}
              </Suggestions>
            </div>
            {error ? <ErrorBanner>That run failed. Try again in a moment.</ErrorBanner> : null}
          </div>
        </div>
      ) : null}

      {step === "schema" ? (
        <>
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">{table}</div>
          <StepFooter>
            <Button
              className="h-11 sm:h-9"
              onClick={() => setStep("describe")}
              type="button"
              variant="outline"
            >
              <ChevronLeftIcon />
              Back
            </Button>
            {schemaLoading ? (
              <Button className="h-11 flex-1 sm:h-9 sm:flex-none" onClick={stopSchema} type="button" variant="outline">
                Stop
              </Button>
            ) : (
              <Button
                className="h-11 flex-1 sm:h-9 sm:flex-none sm:px-5"
                disabled={!extractReady}
                onClick={() => {
                  setSourceOpen(true);
                  setStep("extract");
                }}
                type="button"
              >
                Continue
              </Button>
            )}
          </StepFooter>
        </>
      ) : null}

      {step === "extract" ? (
        <>
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <div className="shrink-0 border-b border-border/50">
              <div className="mx-auto w-full max-w-3xl">
                <button
                  aria-expanded={sourceOpen}
                  className="flex w-full items-center gap-2 px-3 py-2.5 text-left sm:pointer-events-none sm:cursor-default sm:px-4 sm:pt-4 sm:pb-2"
                  onClick={() => setSourceOpen((open) => !open)}
                  type="button"
                >
                  <span className="min-w-0 flex-1">
                    <Overline as="span" className="block">
                      Source
                    </Overline>
                    <span className="block truncate text-muted-foreground text-xs">
                      {sourceSummary(source, sourceFiles)}
                    </span>
                  </span>
                  <ChevronDownIcon
                    className={cn(
                      "size-4 shrink-0 text-muted-foreground transition-transform sm:hidden",
                      sourceOpen && "rotate-180",
                    )}
                  />
                </button>
                <div className={cn("px-3 pb-3 sm:px-4 sm:pb-4", !sourceOpen && "max-sm:hidden")}>
                  <PromptInput
                    clearOnSubmit={false}
                    globalDrop
                    key={sourceKey}
                    multiple
                    onSubmit={() => {
                      void extract();
                    }}
                  >
                    <PromptInputHeader className="border-b border-border/50">
                      <PromptAttachments />
                      <SourceFiles onFiles={setSourceFiles} />
                    </PromptInputHeader>
                    <PromptInputBody>
                      <PromptInputTextarea
                        className="min-h-16 max-h-32 font-mono text-sm sm:min-h-20 sm:max-h-40"
                        onChange={(event) => setSource(event.target.value)}
                        placeholder="Paste text or attach a file to extract from…"
                        submitOnEnter={false}
                        value={source}
                      />
                    </PromptInputBody>
                    <PromptInputFooter className="gap-2 border-t border-border/50">
                      <PromptInputTools>
                        <PromptInputActionMenu>
                          <PromptInputActionMenuTrigger />
                          <PromptInputActionMenuContent>
                            <PromptInputActionAddAttachments />
                          </PromptInputActionMenuContent>
                        </PromptInputActionMenu>
                      </PromptInputTools>
                    </PromptInputFooter>
                  </PromptInput>
                </div>
                {error ? (
                  <ErrorBanner className="mx-3 mb-3 sm:mx-4">
                    That run failed. Try again in a moment.
                  </ErrorBanner>
                ) : null}
                <ExtractSwarmStatus agents={swarmAgents} />
              </div>
            </div>
            {table}
          </div>
          <StepFooter>
            <Button
              className="h-11 sm:h-9"
              disabled={busy}
              onClick={() => setStep("schema")}
              type="button"
              variant="outline"
            >
              <ChevronLeftIcon />
              Back
            </Button>
            {extracting || swarming ? (
              <Button
                className="h-11 flex-1 sm:h-9 sm:flex-none"
                onClick={swarming ? stopSwarm : stopExtract}
                type="button"
                variant="outline"
              >
                Stop
              </Button>
            ) : (
              <Button
                className="h-11 flex-1 sm:h-9 sm:flex-none sm:px-5"
                disabled={!hasSource || displayColumns.length === 0}
                onClick={() => {
                  void extract();
                }}
                type="button"
              >
                {agents > 1 ? `Extract · ${agents}` : "Extract"}
              </Button>
            )}
          </StepFooter>
        </>
      ) : null}
    </div>
  );
}
