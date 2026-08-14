"use client";

import { ExtractOutput } from "@/components/extract-output";
import { ExtractSettings } from "@/components/extract-settings";
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
import { useChat } from "@ai-sdk/react";
import type { ChatStatus } from "ai";
import { DefaultChatTransport } from "ai";
import {
  BracesIcon,
  CheckIcon,
  PlusIcon,
  SlidersHorizontalIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { DEFAULT_MODEL, MODELS, type ModelId } from "@/lib/models";
import { EXAMPLES, PRESETS, presetIdForSpec, type StyleName } from "@/lib/presets";

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

/** Lives inside PromptInput so it can disable itself when there is nothing to send. */
function PromptSubmit({
  text,
  status,
  onStop,
}: {
  text: string;
  status: ChatStatus;
  onStop: () => void;
}) {
  const attachments = usePromptInputAttachments();
  const busy = status === "submitted" || status === "streaming";
  const empty = !text.trim() && attachments.files.length === 0;

  return (
    <PromptInputSubmit
      className="px-2.5"
      disabled={empty && !busy}
      onStop={onStop}
      size="sm"
      status={status}
    >
      {busy ? undefined : "Extract"}
    </PromptInputSubmit>
  );
}

export function ExtractApp() {
  const [model, setModel] = useState<ModelId>(DEFAULT_MODEL);
  const [modelOpen, setModelOpen] = useState(false);
  const [schemaSpec, setSchemaSpec] = useState<string>(PRESETS.document.spec);
  const [style, setStyle] = useState<StyleName>("direct");
  const [instructions, setInstructions] = useState("");
  const [text, setText] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sourceKey, setSourceKey] = useState(0);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/extract",
        prepareSendMessagesRequest: ({ messages, body }) => ({
          body: {
            ...body,
            messages: messages.filter((message) => message.role === "user").slice(-1),
          },
        }),
      }),
    [],
  );

  const { messages, sendMessage, setMessages, status, stop, error, regenerate } = useChat({
    transport,
  });

  const selected = MODELS.find((item) => item.id === model) ?? MODELS[0]!;
  const busy = status === "submitted" || status === "streaming";
  const requestBody = useMemo(
    () => ({ model, schemaSpec, style, instructions }),
    [instructions, model, schemaSpec, style],
  );
  const last = messages.at(-1);
  const assistant = last?.role === "assistant" ? last : undefined;

  const submit = useCallback(
    (message: PromptInputMessage) => {
      const hasText = Boolean(message.text.trim());
      const hasFiles = Boolean(message.files.length);
      if (!(hasText || hasFiles) || busy) return;
      stop();
      setMessages([]);
      void sendMessage(
        {
          text: hasText ? message.text : "Extract structured data from the attached file.",
          files: hasFiles ? message.files : undefined,
        },
        { body: requestBody },
      );
    },
    [busy, requestBody, sendMessage, setMessages, stop],
  );

  const loadExample = useCallback((example: (typeof EXAMPLES)[number]) => {
    if (busy) return;
    setSchemaSpec(PRESETS[example.presetId].spec);
    setText(example.text);
  }, [busy]);

  const startOver = useCallback(() => {
    stop();
    setMessages([]);
    setText("");
    setSourceKey((key) => key + 1);
  }, [setMessages, stop]);

  const settings = (
    <ExtractSettings
      instructions={instructions}
      onInstructions={setInstructions}
      onSchemaSpec={setSchemaSpec}
      onStyle={setStyle}
      schemaSpec={schemaSpec}
      style={style}
    />
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex min-h-14 shrink-0 items-center gap-3 border-b px-3 pt-[env(safe-area-inset-top)] sm:px-4">
        <div className="flex shrink-0 items-center gap-2">
          <span className="flex size-6 items-center justify-center rounded-md bg-foreground text-background">
            <BracesIcon className="size-3.5" />
          </span>
          <span className="font-medium text-sm tracking-tight">openextract</span>
        </div>
        <span className="hidden min-w-0 truncate text-muted-foreground text-sm lg:inline">
          structured data from any file, URL, or pasted text
        </span>
        <div className="ml-auto flex shrink-0 items-center gap-1">
          {assistant || text ? (
            <Button onClick={startOver} size="sm" type="button" variant="ghost">
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
            {PRESETS[presetIdForSpec(schemaSpec)].label}
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-80 shrink-0 flex-col border-r md:flex">
          <div className="shrink-0 border-b px-4 py-3">
            <h2 className="font-medium text-sm">Extraction</h2>
            <p className="text-muted-foreground text-xs">
              Schema, style, and instructions for this run.
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
                Schema, style, and instructions for this run.
              </SheetDescription>
            </SheetHeader>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
              {settings}
            </div>
          </SheetContent>
        </Sheet>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="shrink-0 border-b p-3 sm:p-4">
            <div className="mx-auto grid w-full max-w-3xl gap-2">
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="font-medium text-sm">Source</h2>
                <p className="text-muted-foreground text-xs">⌘/Ctrl+Enter extracts</p>
              </div>
              <PromptInput
                clearOnSubmit={false}
                globalDrop
                key={sourceKey}
                multiple
                onSubmit={submit}
              >
                <PromptInputHeader>
                  <PromptAttachments />
                </PromptInputHeader>
                <PromptInputBody>
                  <PromptInputTextarea
                    className="min-h-28 max-h-56"
                    onChange={(event) => setText(event.target.value)}
                    placeholder="Paste text or attach a file…"
                    submitOnEnter={false}
                    value={text}
                  />
                </PromptInputBody>
                <PromptInputFooter className="gap-2">
                  <PromptInputTools className="min-w-0 flex-1 overflow-hidden">
                    <PromptInputActionMenu>
                      <PromptInputActionMenuTrigger />
                      <PromptInputActionMenuContent>
                        <PromptInputActionAddAttachments />
                      </PromptInputActionMenuContent>
                    </PromptInputActionMenu>
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
                  <PromptSubmit onStop={stop} status={status} text={text} />
                </PromptInputFooter>
              </PromptInput>
              {!assistant && !busy ? (
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
                <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-destructive text-sm">
                  <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" />
                  <span className="min-w-0 flex-1">Extraction failed. Try again in a moment.</span>
                  <button className="shrink-0 underline" onClick={() => regenerate()} type="button">
                    Retry
                  </button>
                </div>
              ) : null}
            </div>
          </div>

          <ExtractOutput message={assistant} status={status} />
        </div>
      </div>
    </div>
  );
}
