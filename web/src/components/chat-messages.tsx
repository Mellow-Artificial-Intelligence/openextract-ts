"use client";

import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/ai-elements/reasoning";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { Suggestion } from "@/components/ai-elements/suggestion";
import { ExtractionResult } from "@/components/extraction-result";
import { splitExtraction } from "@/lib/extraction";
import type { ChatStatus, UIMessage } from "ai";
import { FileTextIcon, PaperclipIcon } from "lucide-react";
import { useMemo } from "react";

function AssistantText({ text, isStreaming }: { text: string; isStreaming: boolean }) {
  const { prose, jsonText, jsonComplete } = useMemo(() => splitExtraction(text), [text]);

  if (jsonText === null) {
    return <MessageResponse isAnimating={isStreaming}>{prose}</MessageResponse>;
  }

  return (
    <div className="grid gap-3">
      <ExtractionResult
        complete={jsonComplete}
        jsonText={jsonText}
        streaming={isStreaming && !jsonComplete}
      />
      {prose ? <MessageResponse isAnimating={isStreaming}>{prose}</MessageResponse> : null}
    </div>
  );
}

function MessagePart({
  part,
  isStreaming,
  isUser,
}: {
  part: UIMessage["parts"][number];
  isStreaming: boolean;
  isUser: boolean;
}) {
  if (part.type === "reasoning") {
    return (
      <Reasoning isStreaming={isStreaming}>
        <ReasoningTrigger />
        <ReasoningContent>{part.text}</ReasoningContent>
      </Reasoning>
    );
  }

  if (part.type === "text") {
    if (isUser) {
      return (
        <MessageContent>
          <MessageResponse>{part.text}</MessageResponse>
        </MessageContent>
      );
    }
    return <AssistantText isStreaming={isStreaming} text={part.text} />;
  }

  if (part.type === "file" && part.mediaType?.startsWith("image/")) {
    return (
      // Data-URL attachments from the prompt cannot use next/image.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        alt={part.filename ?? "attachment"}
        className="ml-auto h-auto max-h-48 w-full max-w-xs rounded-lg border object-contain"
        src={part.url}
      />
    );
  }

  if (part.type === "file") {
    return (
      <div className="ml-auto flex max-w-full items-center gap-2 rounded-lg border bg-muted/40 px-2.5 py-1.5">
        <PaperclipIcon className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate text-xs">{part.filename ?? "Attached file"}</span>
      </div>
    );
  }

  return null;
}

function EmptyState({
  suggestions,
  onSuggestion,
}: {
  suggestions: readonly string[];
  onSuggestion: (suggestion: string) => void;
}) {
  return (
    <ConversationEmptyState className="gap-5">
      <div className="flex size-11 items-center justify-center rounded-xl border bg-muted/40">
        <FileTextIcon className="size-5 text-muted-foreground" />
      </div>
      <div className="space-y-1">
        <h2 className="font-medium text-base">Extract structured data</h2>
        <p className="mx-auto max-w-sm text-muted-foreground text-sm">
          Paste text or attach a file. The model streams JSON that matches your schema.
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        {suggestions.map((suggestion) => (
          <Suggestion key={suggestion} onClick={onSuggestion} suggestion={suggestion} />
        ))}
      </div>
    </ConversationEmptyState>
  );
}

export function ChatMessages({
  messages,
  status,
  suggestions,
  onSuggestion,
}: {
  messages: UIMessage[];
  status: ChatStatus;
  suggestions: readonly string[];
  onSuggestion: (suggestion: string) => void;
}) {
  const lastId = messages.at(-1)?.id;
  const waiting = status === "submitted" && messages.at(-1)?.role === "user";

  return (
    <Conversation className="min-h-0">
      <ConversationContent className="mx-auto w-full max-w-3xl gap-6 p-3 sm:p-6">
        {messages.length === 0 ? (
          <EmptyState onSuggestion={onSuggestion} suggestions={suggestions} />
        ) : (
          messages.map((message) => (
            <Message className="max-w-full" from={message.role} key={message.id}>
              {message.parts.map((part, index) => (
                <MessagePart
                  isStreaming={status === "streaming" && message.id === lastId}
                  isUser={message.role === "user"}
                  key={`${message.id}-${index}`}
                  part={part}
                />
              ))}
            </Message>
          ))
        )}
        {waiting ? <Shimmer className="text-sm">Extracting…</Shimmer> : null}
      </ConversationContent>
      <ConversationScrollButton />
    </Conversation>
  );
}
