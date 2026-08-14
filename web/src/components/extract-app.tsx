"use client";

import { ExtractSettings } from "@/components/extract-settings";
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
import { Suggestion } from "@/components/ai-elements/suggestion";
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
  PlusIcon,
  SlidersHorizontalIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { nanoid } from "nanoid";
import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { DEFAULT_MODEL, MODELS, type ModelId } from "@/lib/models";
import { EXAMPLES, type StyleName } from "@/lib/presets";
import {
  extractRowsClientSchema,
  mergeStreamedRows,
  normalizeColumns,
  tableSchemaObject,
  type TableColumn,
  type TableRow,
} from "@/lib/table-schema";

const GITHUB_URL = "https://github.com/Mellow-Artificial-Intelligence/openextract";

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

export function ExtractApp() {
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

  const {
    object: extractObject,
    submit: submitExtract,
    isLoading: extracting,
    stop: stopExtract,
    error: extractError,
    clear: clearExtract,
  } = useObject({
    api: "/api/extract",
    schema: extractRowsClientSchema,
    onFinish({ object }) {
      if (!object?.rows) return;
      setRows((prev) => mergeStreamedRows(prev, object.rows, (index) => prev[index]?.id ?? `stream-${index}`));
    },
  });

  const selected = MODELS.find((item) => item.id === model) ?? MODELS[0]!;
  const busy = schemaLoading || extracting;
  const error = schemaError ?? extractError;
  const hasSource = Boolean(source.trim() || sourceFiles.length);
  const streamedColumns = normalizeColumns(schemaObject?.columns);
  const displayColumns = schemaLoading || columns.length === 0 ? streamedColumns : columns;
  const displayTitle =
    schemaLoading && schemaObject?.title?.trim() ? schemaObject.title.trim() : title;
  const displayRows =
    extracting || rows.length === 0
      ? mergeStreamedRows(rows, extractObject?.rows, (index) => rows[index]?.id ?? `stream-${index}`)
      : rows;

  const setDisplayColumns: Dispatch<SetStateAction<TableColumn[]>> = (update) => {
    setColumns((prev) => {
      const base = schemaLoading || prev.length === 0 ? streamedColumns : prev;
      return typeof update === "function" ? update(base) : update;
    });
  };

  const setDisplayRows: Dispatch<SetStateAction<TableRow[]>> = (update) => {
    setRows((prev) => {
      const base =
        extracting || prev.length === 0
          ? mergeStreamedRows(prev, extractObject?.rows, (index) => prev[index]?.id ?? `stream-${index}`)
          : prev;
      return typeof update === "function" ? update(base) : update;
    });
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
      submitSchema({ query: trimmed, source: nextSource, model });
    },
    [busy, clearExtract, model, query, source, stopExtract, submitSchema],
  );

  const extract = useCallback(async () => {
    if (displayColumns.length === 0 || busy) return;
    const files = await withDataUrls(sourceFiles);
    if (!query.trim() && !source.trim() && files.length === 0) return;
    stopSchema();
    submitExtract({
      query,
      source,
      files,
      columns: displayColumns,
      model,
      style,
      instructions,
    });
  }, [busy, displayColumns, instructions, model, query, source, sourceFiles, stopSchema, style, submitExtract]);

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
    setQuery("");
    setSource("");
    setSourceFiles([]);
    setColumns([]);
    setRows([]);
    setTitle("Table");
    setTableKey(nanoid());
    setSourceKey((key) => key + 1);
  }, [clearExtract, clearSchema, stopExtract, stopSchema]);

  const settings = (
    <ExtractSettings
      instructions={instructions}
      onInstructions={setInstructions}
      onStyle={setStyle}
      style={style}
    />
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-black/5 bg-background/80 px-4 pt-[env(safe-area-inset-top)] backdrop-blur-lg sm:px-6">
        <div className="flex shrink-0 items-center gap-2">
          <span className="flex size-8 items-center justify-center bg-foreground">
            <span className="font-bold font-mono text-background text-xs">OE</span>
          </span>
          <span className="hidden font-mono text-muted-foreground text-sm sm:inline">
            openextract
          </span>
        </div>
        <span className="hidden min-w-0 truncate font-mono text-muted-foreground text-xs lg:inline">
          describe a table, then extract into it
        </span>
        <nav className="ml-auto flex shrink-0 items-center gap-3 sm:gap-4">
          {columns.length > 0 || query || source ? (
            <Button onClick={startOver} size="sm" type="button" variant="outline">
              <PlusIcon />
              New
            </Button>
          ) : null}
          <Button
            aria-label="Extraction settings"
            className="md:hidden"
            onClick={() => setSettingsOpen(true)}
            size="sm"
            type="button"
            variant="outline"
          >
            <SlidersHorizontalIcon />
            {style}
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

      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-80 shrink-0 flex-col border-r border-black/5 md:flex">
          <div className="shrink-0 border-b border-black/5 px-4 py-3">
            <p className="mb-1 font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
              Extraction
            </p>
            <h2 className="font-medium text-sm">Describe, edit, extract</h2>
            <p className="mt-1 text-muted-foreground text-xs">
              Generate columns from a query, edit the table, then fill it from a source.
            </p>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-4">{settings}</div>
        </aside>

        <Sheet onOpenChange={setSettingsOpen} open={settingsOpen}>
          <SheetContent
            className="w-full gap-0 data-[side=right]:w-full sm:max-w-sm"
            side="right"
          >
            <SheetHeader>
              <SheetTitle>Extraction</SheetTitle>
              <SheetDescription>
                Style and instructions for this run.
              </SheetDescription>
            </SheetHeader>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
              {settings}
            </div>
          </SheetContent>
        </Sheet>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="shrink-0 border-b border-black/5 p-3 sm:p-4">
            <div className="mx-auto grid w-full max-w-3xl gap-3">
              <PromptInput clearOnSubmit={false} onSubmit={submitQuery}>
                <PromptInputHeader className="border-b border-black/5">
                  <div className="flex w-full items-center justify-between gap-2">
                    <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
                      Query
                    </span>
                    <span className="font-mono text-[10px] text-muted-foreground">
                      ⌘/Ctrl+Enter generates columns
                    </span>
                  </div>
                </PromptInputHeader>
                <PromptInputBody>
                  <PromptInputTextarea
                    className="min-h-16 max-h-32 text-sm"
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Describe the table you want… e.g. invoice line items with quantity and amount"
                    submitOnEnter={false}
                    value={query}
                  />
                </PromptInputBody>
                <PromptInputFooter className="gap-2 border-t border-black/5">
                  <PromptInputTools className="min-w-0 flex-1 overflow-hidden">
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
                                {model === item.id ? (
                                  <CheckIcon className="ml-auto size-4" />
                                ) : null}
                              </ModelSelectorItem>
                            ))}
                          </ModelSelectorGroup>
                        </ModelSelectorList>
                      </ModelSelectorContent>
                    </ModelSelector>
                  </PromptInputTools>
                  <PromptInputSubmit
                    className="px-2.5"
                    disabled={(!query.trim() && !schemaLoading) || extracting}
                    onStop={stopSchema}
                    size="sm"
                    status={schemaLoading ? "streaming" : "ready"}
                  >
                    {schemaLoading ? undefined : "Generate"}
                  </PromptInputSubmit>
                </PromptInputFooter>
              </PromptInput>

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
                  <div className="flex w-full items-center justify-between gap-2">
                    <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
                      Source
                    </span>
                    <span className="font-mono text-[10px] text-muted-foreground">
                      used when you extract
                    </span>
                  </div>
                  <PromptAttachments />
                  <SourceFiles onFiles={setSourceFiles} />
                </PromptInputHeader>
                <PromptInputBody>
                  <PromptInputTextarea
                    className="min-h-20 max-h-40 font-mono text-sm"
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

              {columns.length === 0 && !busy ? (
                <div className="flex flex-wrap gap-2">
                  {EXAMPLES.map((example) => (
                    <Suggestion
                      key={example.label}
                      onClick={() => loadExample(example)}
                      suggestion={example.label}
                    />
                  ))}
                </div>
              ) : null}
              {error ? (
                <div className="flex items-start gap-2 border border-destructive/30 bg-destructive/10 px-3 py-2 text-destructive text-sm">
                  <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" />
                  <span className="min-w-0 flex-1">That run failed. Try again in a moment.</span>
                </div>
              ) : null}
            </div>
          </div>

          <ExtractTable
            canExtract={displayColumns.length > 0 && hasSource}
            columns={displayColumns}
            extracting={extracting}
            key={tableKey}
            onColumnsChange={setDisplayColumns}
            onExtract={() => {
              void extract();
            }}
            onRowsChange={setDisplayRows}
            onStop={() => {
              stopSchema();
              stopExtract();
            }}
            rows={displayRows}
            schemaLoading={schemaLoading}
            title={displayTitle}
          />
        </div>
      </div>
    </div>
  );
}
