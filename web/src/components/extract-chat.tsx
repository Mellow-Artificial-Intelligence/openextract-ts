"use client";

import { ChatMessages } from "@/components/chat-messages";
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
import { Suggestion, Suggestions } from "@/components/ai-elements/suggestion";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { CheckIcon } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { DEFAULT_MODEL, MODELS, type ModelId } from "@/lib/models";
import { PRESETS, SUGGESTIONS, type StyleName } from "@/lib/presets";

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

export function ExtractChat() {
  const [model, setModel] = useState<ModelId>(DEFAULT_MODEL);
  const [modelOpen, setModelOpen] = useState(false);
  const [schemaSpec, setSchemaSpec] = useState<string>(PRESETS.document.spec);
  const [style, setStyle] = useState<StyleName>("direct");
  const [instructions, setInstructions] = useState("");
  const [text, setText] = useState("");

  const transport = useMemo(
    () => new DefaultChatTransport({ api: "/api/chat" }),
    [],
  );

  const { messages, sendMessage, status, stop, error, regenerate } = useChat({
    transport,
  });

  const selected = MODELS.find((item) => item.id === model) ?? MODELS[0]!;
  const busy = status === "submitted" || status === "streaming";
  const requestBody = useMemo(
    () => ({ model, schemaSpec, style, instructions }),
    [instructions, model, schemaSpec, style],
  );

  const submit = useCallback(
    (message: PromptInputMessage) => {
      const hasText = Boolean(message.text.trim());
      const hasFiles = Boolean(message.files.length);
      if (!(hasText || hasFiles) || busy) return;
      void sendMessage(
        {
          text: hasText ? message.text : "Extract structured data from the attached file.",
          files: hasFiles ? message.files : undefined,
        },
        { body: requestBody },
      );
      setText("");
    },
    [busy, requestBody, sendMessage],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col md:flex-row">
      <ExtractSettings
        instructions={instructions}
        onInstructions={setInstructions}
        onSchemaSpec={setSchemaSpec}
        onStyle={setStyle}
        schemaSpec={schemaSpec}
        style={style}
      />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <ChatMessages messages={messages} status={status} />
        {error ? (
          <div className="flex items-center justify-between gap-2 border-border border-t px-4 py-2 text-destructive text-sm">
            <span>Something went wrong. Check AI_GATEWAY_API_KEY and try again.</span>
            <button className="underline" onClick={() => regenerate()} type="button">
              Retry
            </button>
          </div>
        ) : null}
        <div className="grid shrink-0 gap-3 border-border border-t p-4">
          {messages.length === 0 ? (
            <Suggestions>
              {SUGGESTIONS.map((suggestion) => (
                <Suggestion
                  key={suggestion}
                  onClick={(value) => {
                    if (busy) return;
                    void sendMessage({ text: value }, { body: requestBody });
                  }}
                  suggestion={suggestion}
                />
              ))}
            </Suggestions>
          ) : null}
          <PromptInput globalDrop multiple onSubmit={submit}>
            <PromptInputHeader>
              <PromptAttachments />
            </PromptInputHeader>
            <PromptInputBody>
              <PromptInputTextarea
                onChange={(event) => setText(event.target.value)}
                placeholder="Paste a document, or describe what to extract…"
                value={text}
              />
            </PromptInputBody>
            <PromptInputFooter>
              <PromptInputTools>
                <PromptInputActionMenu>
                  <PromptInputActionMenuTrigger />
                  <PromptInputActionMenuContent>
                    <PromptInputActionAddAttachments />
                  </PromptInputActionMenuContent>
                </PromptInputActionMenu>
                <ModelSelector onOpenChange={setModelOpen} open={modelOpen}>
                  <ModelSelectorTrigger asChild>
                    <PromptInputButton>
                      <ModelSelectorLogo provider={selected.provider} />
                      <ModelSelectorName>{selected.name}</ModelSelectorName>
                    </PromptInputButton>
                  </ModelSelectorTrigger>
                  <ModelSelectorContent>
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
              </PromptInputTools>
              <PromptInputSubmit onStop={stop} status={status} />
            </PromptInputFooter>
          </PromptInput>
        </div>
      </div>
    </div>
  );
}
