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
import type { ChatStatus, UIMessage } from "ai";
import { FileTextIcon } from "lucide-react";

function MessageParts({
  message,
  isStreaming,
}: {
  message: UIMessage;
  isStreaming: boolean;
}) {
  return (
    <>
      {message.parts.map((part, index) => {
        const key = `${message.id}-${index}`;
        if (part.type === "reasoning") {
          return (
            <Reasoning isStreaming={isStreaming} key={key}>
              <ReasoningTrigger />
              <ReasoningContent>{part.text}</ReasoningContent>
            </Reasoning>
          );
        }
        if (part.type === "text") {
          return (
            <MessageContent className="max-w-full overflow-x-auto" key={key}>
              <MessageResponse isAnimating={isStreaming}>{part.text}</MessageResponse>
            </MessageContent>
          );
        }
        if (part.type === "file" && part.mediaType?.startsWith("image/")) {
          return (
            // Data-URL attachments from the prompt cannot use next/image.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              alt={part.filename ?? "attachment"}
              className="h-auto max-h-48 w-full max-w-full rounded-lg border border-border object-contain sm:w-auto"
              key={key}
              src={part.url}
            />
          );
        }
        if (part.type === "file") {
          return (
            <p className="break-all text-muted-foreground text-xs" key={key}>
              {part.filename ?? "attached file"}
            </p>
          );
        }
        return null;
      })}
    </>
  );
}

export function ChatMessages({
  messages,
  status,
}: {
  messages: UIMessage[];
  status: ChatStatus;
}) {
  const lastId = messages.at(-1)?.id;
  const waiting = status === "submitted" && messages.at(-1)?.role === "user";

  return (
    <Conversation className="min-h-0">
      <ConversationContent className="gap-6 p-3 sm:gap-8 sm:p-4">
        {messages.length === 0 ? (
          <ConversationEmptyState
            className="px-2"
            description="Paste text or attach a file, then extract against your schema."
            icon={<FileTextIcon className="size-8" />}
            title="Extract structured data"
          />
        ) : (
          messages.map((message) => (
            <Message className="max-w-full sm:max-w-[95%]" from={message.role} key={message.id}>
              <MessageParts
                isStreaming={status === "streaming" && message.id === lastId}
                message={message}
              />
            </Message>
          ))
        )}
        {waiting ? <Shimmer className="text-sm">Extracting…</Shimmer> : null}
      </ConversationContent>
      <ConversationScrollButton />
    </Conversation>
  );
}
