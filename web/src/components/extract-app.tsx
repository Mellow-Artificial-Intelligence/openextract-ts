"use client";

import { ExtractSettings } from "@/components/extract-settings";
import { ExtractSteps, STEP_META, type FlowStep } from "@/components/extract-steps";
import { ExtractSwarmStatus, type SwarmAgentState } from "@/components/extract-swarm";
import { ExtractTable } from "@/components/extract-table";
import {
  Attachment,
  AttachmentInfo,
  AttachmentPreview,
  AttachmentRemove,
  Attachments,
} from "@/components/ai-elements/attachments";
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputTextarea,
  PromptInputTools,
  usePromptInputAttachments,
  type PromptInputMessage,
} from "@/components/ai-elements/prompt-input";
import { AppTopbar } from "@/components/app-topbar";
import { ModelPicker } from "@/components/model-picker";
import { Button } from "@/components/ui/button";
import { ErrorBanner } from "@/components/ui/error-banner";
import { Kbd } from "@/components/ui/kbd";
import { Overline } from "@/components/ui/overline";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { ShellProps } from "@/components/web-app";
import { useObject } from "@ai-sdk/react";
import type { FileUIPart } from "ai";
import {
  ChevronDownIcon,
  FileTextIcon,
  PaperclipIcon,
  PlusIcon,
  SlidersHorizontalIcon,
  XIcon,
} from "lucide-react";
import { nanoid } from "nanoid";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
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

/** Step 3 accepts files only. Both limits are enforced by PromptInput. */
export const MAX_SOURCE_FILES = 5;
export const MAX_SOURCE_BYTES = 2 * 1024 * 1024;

function sourceSummary(source: string, files: FileUIPart[]) {
  const parts: string[] = [];
  if (files.length) parts.push(`${files.length} of ${MAX_SOURCE_FILES} files`);
  if (source.trim()) parts.push("example text");
  if (parts.length === 0) return `Attach up to ${MAX_SOURCE_FILES} files`;
  return parts.join(" · ");
}

function styleLabel(style: StyleName) {
  return style.charAt(0).toUpperCase() + style.slice(1);
}

function SourceDropzone({ onOpen }: { onOpen: () => void }) {
  const attachments = usePromptInputAttachments();
  const full = attachments.files.length >= MAX_SOURCE_FILES;
  return (
    <div className="space-y-2">
      {attachments.files.length > 0 ? (
        <Attachments variant="list">
          {attachments.files.map((file) => (
            <Attachment
              className="gap-2.5 border-border bg-raised p-2 text-sm"
              data={file}
              key={file.id}
              onRemove={() => attachments.remove(file.id)}
            >
              <AttachmentPreview />
              <AttachmentInfo showMediaType />
              <AttachmentRemove />
            </Attachment>
          ))}
        </Attachments>
      ) : null}
      <button
        className="flex w-full flex-col items-center justify-center gap-1.5 rounded-lg border border-border border-dashed px-4 py-6 text-center transition-colors duration-100 hover:border-border-strong hover:bg-hover disabled:pointer-events-none disabled:opacity-40"
        disabled={full}
        onClick={() => {
          onOpen();
          attachments.openFileDialog();
        }}
        type="button"
      >
        <PaperclipIcon className="size-4 text-faint" />
        <span className="font-medium text-sm">
          {full ? `${MAX_SOURCE_FILES} files attached` : "Attach files"}
        </span>
        <span className="text-faint text-xs">
          {full
            ? "Remove one to add another."
            : `Drop them here or click to browse · up to ${MAX_SOURCE_FILES} files, 2 MB each`}
        </span>
      </button>
    </div>
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

interface PrimaryAction {
  label: string;
  onClick: () => void;
  disabled: boolean;
  stop?: boolean;
}

export function ExtractApp({ shell }: { shell: ShellProps }) {
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
  const [attachError, setAttachError] = useState<string | null>(null);
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

  const swarming = swarmAgents.some(
    (agent) => agent.status === "pending" || agent.status === "running",
  );
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
        agent.status === "running" || agent.status === "pending"
          ? { ...agent, status: "done" }
          : agent,
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
    setSwarmAgents(
      members.map((spec) => ({ model: composeExtractModel(spec), status: "running" as const, rows: 0 })),
    );
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
          prev.map((agent, i) =>
            i === index ? { ...agent, status: "done", rows: extracted.length } : agent,
          ),
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
  }, [
    busy,
    displayColumns,
    instructions,
    model,
    query,
    sandbox,
    source,
    sourceFiles,
    stopSchema,
    style,
    team,
    workflow,
  ]);

  const submitQuery = useCallback(
    (message: PromptInputMessage) => {
      generate(message.text, source);
    },
    [generate, source],
  );

  const { onPresetApplied } = shell;
  const loadExample = useCallback(
    (example: (typeof EXAMPLES)[number]) => {
      if (busy) return;
      setQuery(example.query);
      setSource(example.text);
      onPresetApplied(example.label);
      generate(example.query, example.text);
    },
    [busy, generate, onPresetApplied],
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
    setAttachError(null);
    setColumns([]);
    setRows([]);
    setTitle("Table");
    setTableKey(nanoid());
    setSourceKey((key) => key + 1);
    setAgents(1);
    setTeam((prev) => [specForModel(model, prev[0])]);
    setSourceOpen(true);
    onPresetApplied(null);
  }, [clearExtract, clearSchema, model, onPresetApplied, stopExtract, stopSchema, stopSwarm]);

  // Sidebar and command-palette examples land here.
  const handledPreset = useRef(0);
  useEffect(() => {
    const request = shell.preset;
    if (!request || request.nonce === handledPreset.current) return;
    handledPreset.current = request.nonce;
    const example = EXAMPLES.find((item) => item.label === request.id);
    if (example) loadExample(example);
  }, [shell.preset, loadExample]);

  /** One control drives the flow forward, in the topbar and on ⌘↵. */
  const primary: PrimaryAction = useMemo(() => {
    if (step === "describe") {
      if (schemaLoading) return { label: "Stop", onClick: stopSchema, disabled: false, stop: true };
      return {
        label: "Generate schema",
        onClick: () => generate(),
        disabled: !query.trim() || extracting,
      };
    }
    if (step === "schema") {
      if (schemaLoading) return { label: "Stop", onClick: stopSchema, disabled: false, stop: true };
      return {
        label: "Continue",
        onClick: () => {
          setSourceOpen(true);
          setStep("extract");
        },
        disabled: !extractReady,
      };
    }
    if (extracting || swarming) {
      return {
        label: "Stop",
        onClick: swarming ? stopSwarm : stopExtract,
        disabled: false,
        stop: true,
      };
    }
    return {
      label: agents > 1 ? `Extract · ${agents}` : "Extract",
      onClick: () => void extract(),
      disabled: !hasSource || displayColumns.length === 0,
    };
  }, [
    agents,
    displayColumns.length,
    extract,
    extractReady,
    extracting,
    generate,
    hasSource,
    query,
    schemaLoading,
    step,
    stopExtract,
    stopSchema,
    stopSwarm,
    swarming,
  ]);

  const { registerRun } = shell;
  useEffect(() => {
    registerRun(primary.disabled ? null : primary.onClick);
    return () => registerRun(null);
  }, [primary, registerRun]);

  const table = (
    <ExtractTable
      columns={displayColumns}
      emptyHint={
        step === "extract"
          ? "Attach a file, then extract to fill the rows."
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

  const settingsLabel =
    agents > 1 ? `${agents} agents` : sandbox && isCodingAgentId(model) ? "Sandbox" : styleLabel(style);

  return (
    <>
      <AppTopbar
        actions={
          <>
            {step !== "describe" || query || source ? (
              <Button onClick={startOver} size="sm" type="button" variant="ghost">
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
              <span className="hidden sm:inline">{settingsLabel}</span>
            </Button>
          </>
        }
        crumb={STEP_META[step].label}
        onCommand={shell.onCommand}
        onMenu={shell.onMenu}
        primary={
          <Button
            className="gap-2"
            disabled={primary.disabled}
            onClick={primary.onClick}
            size="sm"
            type="button"
            variant={primary.stop ? "outline" : "default"}
          >
            {primary.label}
            {primary.stop ? null : (
              <Kbd className="text-primary-foreground/60" keys={["⌘", "↵"]} />
            )}
          </Button>
        }
        title="Extract"
      />

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
                  resizeAgentSpecs(
                    prev,
                    count,
                    specForModel(model, prev[0]),
                    sandbox ? MODELS : GATEWAY_MODELS,
                  ),
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
                setTeam((current) =>
                  current.map((spec) => (isCodingAgentId(spec.id) ? { id: DEFAULT_MODEL } : spec)),
                );
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
          <div className="mx-auto flex min-h-full w-full max-w-xl flex-col justify-center gap-5 p-4 sm:p-8">
            <div className="space-y-1.5">
              <Overline>Step 1 · Describe</Overline>
              <h1 className="font-semibold text-xl tracking-[-0.02em]">
                What should the table contain?
              </h1>
              <p className="text-muted-foreground text-sm leading-relaxed">
                Name the columns you want. openextract generates a schema you can edit before it
                touches a source.
              </p>
            </div>
            <PromptInput clearOnSubmit={false} onSubmit={submitQuery}>
              <PromptInputBody>
                <PromptInputTextarea
                  className="min-h-24 max-h-40 text-sm"
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="e.g. invoice line items with quantity, unit price, and amount"
                  submitOnEnter={false}
                  value={query}
                />
              </PromptInputBody>
              <PromptInputFooter className="gap-2 border-t border-border">
                <PromptInputTools className="min-w-0 flex-1 overflow-hidden">
                  <ModelPicker
                    models={sandbox ? MODELS : GATEWAY_MODELS}
                    onSelect={(id) => {
                      setModel(id);
                      setTeam((prev) => (agents === 1 ? [specForModel(id, prev[0])] : prev));
                    }}
                    trigger="prompt"
                    value={model}
                  />
                </PromptInputTools>
                <span className="flex items-center gap-1.5 pr-1 text-faint text-xs">
                  <Kbd keys={["⌘", "↵"]} /> to generate
                </span>
              </PromptInputFooter>
            </PromptInput>
            <div className="space-y-2">
              <Overline>Start from an example</Overline>
              <div className="grid gap-1.5">
                {EXAMPLES.map((example) => (
                  <button
                    className="group flex items-center gap-3 rounded-lg border border-border bg-raised px-3 py-2 text-left transition-colors duration-100 hover:border-border-strong hover:bg-hover"
                    key={example.label}
                    onClick={() => loadExample(example)}
                    type="button"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-sm">{example.label}</span>
                      <span className="mt-0.5 block truncate text-faint text-xs">
                        {example.query}
                      </span>
                    </span>
                    <span className="shrink-0 text-faint text-xs opacity-0 transition-opacity group-hover:opacity-100">
                      Load
                    </span>
                  </button>
                ))}
              </div>
            </div>
            {error ? <ErrorBanner>That run failed. Try again in a moment.</ErrorBanner> : null}
          </div>
        </div>
      ) : null}

      {step === "schema" ? (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">{table}</div>
      ) : null}

      {step === "extract" ? (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="max-h-[42vh] shrink-0 overflow-y-auto border-b border-border bg-panel/60">
            <div className="mx-auto w-full max-w-3xl px-3 py-3 sm:px-4">
              <button
                aria-expanded={sourceOpen}
                className="flex w-full items-center gap-2 pb-2 text-left sm:pointer-events-none sm:cursor-default"
                onClick={() => setSourceOpen((open) => !open)}
                type="button"
              >
                <span className="min-w-0 flex-1">
                  <Overline as="span" className="block">
                    Source
                  </Overline>
                  <span className="mt-1 block truncate text-muted-foreground text-xs">
                    {sourceSummary(source, sourceFiles)}
                  </span>
                </span>
                <ChevronDownIcon
                  className={cn(
                    "size-4 shrink-0 text-faint transition-transform sm:hidden",
                    sourceOpen && "rotate-180",
                  )}
                />
              </button>
              <div className={cn("space-y-2", !sourceOpen && "max-sm:hidden")}>
                {source.trim() ? (
                  <div className="flex items-center gap-3 rounded-lg border border-border bg-raised p-3">
                    <FileTextIcon className="size-4 shrink-0 text-faint" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">Example text</span>
                      <span className="block truncate text-faint text-xs">
                        {source.trim().slice(0, 60)}…
                      </span>
                    </span>
                    <Button
                      aria-label="Remove example text"
                      onClick={() => setSource("")}
                      size="icon-sm"
                      type="button"
                      variant="ghost"
                    >
                      <XIcon />
                    </Button>
                  </div>
                ) : null}
                <PromptInput
                  className="[&>[data-slot=input-group]]:h-auto [&>[data-slot=input-group]]:flex-col [&>[data-slot=input-group]]:items-stretch [&>[data-slot=input-group]]:overflow-visible [&>[data-slot=input-group]]:border-0 [&>[data-slot=input-group]]:bg-transparent"
                  clearOnSubmit={false}
                  globalDrop
                  key={sourceKey}
                  maxFileSize={MAX_SOURCE_BYTES}
                  maxFiles={MAX_SOURCE_FILES}
                  multiple
                  onError={(err) => setAttachError(err.message)}
                  onSubmit={() => {
                    void extract();
                  }}
                >
                  <SourceFiles onFiles={setSourceFiles} />
                  <SourceDropzone onOpen={() => setAttachError(null)} />
                </PromptInput>
              </div>
              {attachError ? (
                <ErrorBanner className="mt-3">{attachError}</ErrorBanner>
              ) : null}
              {error ? (
                <ErrorBanner className="mt-3">That run failed. Try again in a moment.</ErrorBanner>
              ) : null}
              <ExtractSwarmStatus agents={swarmAgents} />
            </div>
          </div>
          {table}
        </div>
      ) : null}
    </>
  );
}
