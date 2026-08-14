"use client";

import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { MessageResponse } from "@/components/ai-elements/message";
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/ai-elements/reasoning";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { ExtractionResult } from "@/components/extraction-result";
import { splitExtraction } from "@/lib/extraction";
import type { ChatStatus, UIMessage } from "ai";
import { FileTextIcon } from "lucide-react";
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

function EmptyResult() {
  return (
    <div className="flex size-full flex-col items-center justify-center gap-3 p-8 text-center">
      <div className="flex size-11 items-center justify-center rounded-xl border bg-muted/40">
        <FileTextIcon className="size-5 text-muted-foreground" />
      </div>
      <div className="space-y-1">
        <h2 className="font-medium text-base">No extraction yet</h2>
        <p className="mx-auto max-w-sm text-muted-foreground text-sm">
          Paste a source or attach a file, then extract. Results replace the previous run.
        </p>
      </div>
    </div>
  );
}

export function ExtractOutput({
  message,
  status,
}: {
  message: UIMessage | undefined;
  status: ChatStatus;
}) {
  const waiting = status === "submitted" && message?.role !== "assistant";
  const streaming = status === "streaming";

  return (
    <Conversation className="min-h-0">
      <ConversationContent className="mx-auto w-full max-w-3xl gap-4 p-3 sm:p-6">
        {waiting ? <Shimmer className="text-sm">Extracting…</Shimmer> : null}
        {!message && !waiting ? (
          <EmptyResult />
        ) : (
          message?.parts.map((part, index) => {
            if (part.type === "reasoning") {
              return (
                <Reasoning isStreaming={streaming} key={`${message.id}-${index}`}>
                  <ReasoningTrigger />
                  <ReasoningContent>{part.text}</ReasoningContent>
                </Reasoning>
              );
            }
            if (part.type === "text") {
              return (
                <AssistantText
                  isStreaming={streaming}
                  key={`${message.id}-${index}`}
                  text={part.text}
                />
              );
            }
            return null;
          })
        )}
      </ConversationContent>
      <ConversationScrollButton />
    </Conversation>
  );
}
