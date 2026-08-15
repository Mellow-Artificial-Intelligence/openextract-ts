"use client";

import { ExtractSettings } from "@/components/extract-settings";
import { ExtractSteps, type FlowStep } from "@/components/extract-steps";
import { ExtractTable } from "@/components/extract-table";
import {
  Attachment,
  AttachmentPreview,
  AttachmentRemove,
  Attachments,
} from "@/components/ai-elements/attachments";
import {
  ModelSelector,
  ModelSelectorContent,
  ModelSelectorEmpty,
  ModelSelectorGroup,
  ModelSelectorInput,
  ModelSelectorItem,
  ModelSelectorList,
  ModelSelectorLogo,
  ModelSelectorName,
  ModelSelectorTrigger,
} from "@/components/ai-elements/model-selector";
import {
  PromptInput,
  PromptInputActionAddAttachments,
  PromptInputActionMenu,
  PromptInputActionMenuContent,
  PromptInputActionMenuTrigger,
  PromptInputBody,
  PromptInputButton,
  PromptInputFooter,
  PromptInputHeader,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  usePromptInputAttachments,
  type PromptInputMessage,
} from "@/components/ai-elements/prompt-input";
import { Suggestion, Suggestions } from "@/components/ai-elements/suggestion";
import { Button } from "@/components/ui/button";
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
  CheckIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  PlusIcon,
  SlidersHorizontalIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { nanoid } from "nanoid";
import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { DEFAULT_MODEL, MODELS, type ModelId } from "@/lib/models";
import { EXAMPLES, type StyleName } from "@/lib/presets";
import {
  mergeStreamedRows,
  normalizeColumns,
  tableSchemaObject,
  type TableColumn,
  type TableRow,
} from "@/lib/table-schema";
import { cn } from "@/lib/utils";

const GITHUB_URL = "https://github.com/Mellow-Artificial-Intelligence/openextract";

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
    <div className="shrink-0 border-t border-black/5 bg-background px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-4">
      <div className="mx-auto flex w-full max-w-3xl items-center gap-2">{children}</div>
    </div>
  );
}

export function ExtractApp() {
  const [step, setStep] = useState<FlowStep>("describe");
  const [model, setModel] = useState<ModelId>(DEFAULT_MODEL);
  const [modelOpen, setModelOpen] = useState(false);
  const [style, setStyle] = useState<StyleName>("direct");
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

  const selected = MODELS.find((item) => item.id === model) ?? MODELS[0]!;
  const busy = schemaLoading || extracting;
  const error = schemaError ?? extractError;
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

  const generate = useCallback(
    (nextQuery = query, nextSource = source) => {
      const trimmed = nextQuery.trim();
      if (!trimmed || busy) return;
      stopExtract();
      clearExtract();
      setColumns([]);
      setRows([]);
      setTitle("Table");
      setTableKey(nanoid());
      setStep("schema");
      submitSchema({ query: trimmed, source: nextSource, model });
    },
    [busy, clearExtract, model, query, source, stopExtract, submitSchema],
  );

  const extract = useCallback(async () => {
    if (displayColumns.length === 0 || busy) return;
    const files = await withDataUrls(sourceFiles);
    if (!query.trim() && !source.trim() && files.length === 0) return;
    stopSchema();
    setSourceOpen(false);
    extractAbort.current?.abort();
    const controller = new AbortController();
    extractAbort.current = controller;
    setExtracting(true);
    setExtractError(null);
    setRows([]);
    try {
      const response = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query,
          source,
          files,
          columns: displayColumns,
          model,
          style,
          instructions,
        }),
        signal: controller.signal,
      });
      const data = (await response.json()) as { rows?: unknown; error?: string };
      if (!response.ok) throw new Error(data.error ?? "Extraction failed");
      setRows(mergeStreamedRows([], data.rows, (index) => `row-${index}`));
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      setExtractError(error instanceof Error ? error : new Error("Extraction failed"));
    } finally {
      if (extractAbort.current === controller) extractAbort.current = null;
      setExtracting(false);
    }
  }, [busy, displayColumns, instructions, model, query, source, sourceFiles, stopSchema, style]);

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
    clearSchema();
    clearExtract();
    setStep("describe");
    setQuery("");
    setSource("");
    setSourceFiles([]);
    setColumns([]);
    setRows([]);
    setTitle("Table");
    setTableKey(nanoid());
    setSourceKey((key) => key + 1);
    setSourceOpen(true);
  }, [clearExtract, clearSchema, stopExtract, stopSchema]);

  const table = (
    <ExtractTable
      columns={displayColumns}
      emptyHint={
        step === "extract"
          ? "Paste a source or attach a file, then extract to fill the rows."
          : "Columns stream in here. Edit them, then continue to add a source."
      }
      extracting={extracting}
      key={tableKey}
      onColumnsChange={setDisplayColumns}
      onRowsChange={setDisplayRows}
      rows={displayRows}
      schemaLoading={schemaLoading}
      title={displayTitle}
    />
  );

  const modelPicker = (
    <ModelSelector onOpenChange={setModelOpen} open={modelOpen}>
      <ModelSelectorTrigger asChild>
        <PromptInputButton className="max-w-[min(100%,11rem)]">
          <ModelSelectorLogo provider={selected.provider} />
          <ModelSelectorName>{selected.name}</ModelSelectorName>
        </PromptInputButton>
      </ModelSelectorTrigger>
      <ModelSelectorContent className="w-[calc(100vw-2rem)] max-w-md">
        <ModelSelectorInput placeholder="Search models…" />
        <ModelSelectorList>
          <ModelSelectorEmpty>No models found.</ModelSelectorEmpty>
          <ModelSelectorGroup heading="AI Gateway">
            {MODELS.map((item) => (
              <ModelSelectorItem
                key={item.id}
                onSelect={() => {
                  setModel(item.id);
                  setModelOpen(false);
                }}
                value={item.id}
              >
                <ModelSelectorLogo provider={item.provider} />
                <ModelSelectorName>{item.name}</ModelSelectorName>
                {model === item.id ? <CheckIcon className="ml-auto size-4" /> : null}
              </ModelSelectorItem>
            ))}
          </ModelSelectorGroup>
        </ModelSelectorList>
      </ModelSelectorContent>
    </ModelSelector>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-black/5 bg-background/80 px-3 pt-[env(safe-area-inset-top)] backdrop-blur-lg sm:h-14 sm:gap-3 sm:px-6">
        <div className="flex shrink-0 items-center gap-2">
          <span className="flex size-7 items-center justify-center bg-foreground sm:size-8">
            <span className="font-bold font-mono text-background text-[10px] sm:text-xs">OE</span>
          </span>
          <span className="hidden font-mono text-muted-foreground text-sm sm:inline">
            openextract
          </span>
        </div>
        <nav className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3">
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
            <span className="hidden capitalize sm:inline">{style}</span>
          </Button>
          <a
            className="font-mono text-muted-foreground text-xs transition-colors hover:text-foreground"
            href={GITHUB_URL}
            rel="noreferrer"
            target="_blank"
          >
            GitHub
          </a>
        </nav>
      </header>

      <ExtractSteps
        extractReady={extractReady}
        onStep={setStep}
        schemaReady={schemaReady}
        step={step}
      />

      <Sheet onOpenChange={setSettingsOpen} open={settingsOpen}>
        <SheetContent className="w-full gap-0 data-[side=right]:w-full sm:max-w-sm" side="right">
          <SheetHeader>
            <SheetTitle>Extraction</SheetTitle>
            <SheetDescription>Style and instructions for this run.</SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <ExtractSettings
              instructions={instructions}
              onInstructions={setInstructions}
              onStyle={setStyle}
              style={style}
            />
          </div>
        </SheetContent>
      </Sheet>

      {step === "describe" ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto flex min-h-full w-full max-w-lg flex-col gap-4 p-4 sm:justify-center sm:p-6">
            <div className="space-y-1">
              <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
                Step 1
              </p>
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
              <PromptInputFooter className="gap-2 border-t border-black/5">
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
              <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
                Try an example
              </p>
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
            {error ? (
              <div className="flex items-start gap-2 border border-destructive/30 bg-destructive/10 px-3 py-2 text-destructive text-sm">
                <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" />
                <span className="min-w-0 flex-1">That run failed. Try again in a moment.</span>
              </div>
            ) : null}
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
            <div className="shrink-0 border-b border-black/5">
              <div className="mx-auto w-full max-w-3xl">
                <button
                  aria-expanded={sourceOpen}
                  className="flex w-full items-center gap-2 px-3 py-2.5 text-left sm:pointer-events-none sm:cursor-default sm:px-4 sm:pt-4 sm:pb-2"
                  onClick={() => setSourceOpen((open) => !open)}
                  type="button"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
                      Source
                    </span>
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
                    <PromptInputHeader className="border-b border-black/5">
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
                    <PromptInputFooter className="gap-2 border-t border-black/5">
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
                  <div className="flex items-start gap-2 px-3 pb-3 text-destructive text-sm sm:px-4">
                    <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" />
                    <span className="min-w-0 flex-1">That run failed. Try again in a moment.</span>
                  </div>
                ) : null}
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
            {extracting ? (
              <Button className="h-11 flex-1 sm:h-9 sm:flex-none" onClick={stopExtract} type="button" variant="outline">
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
                Extract
              </Button>
            )}
          </StepFooter>
        </>
      ) : null}
    </div>
  );
}
