"use client";

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
import { PromptInputButton } from "@/components/ai-elements/prompt-input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { isCodingAgentId } from "@/lib/models";
import { CheckIcon } from "lucide-react";
import { useState } from "react";

export interface ModelOption<Id extends string = string> {
  id: Id;
  name: string;
  provider: string;
}

export function ModelPicker<Id extends string>({
  models,
  value,
  onSelect,
  disabled = false,
  trigger = "outline",
  triggerClassName,
  triggerId,
}: {
  models: readonly ModelOption<Id>[];
  value: string;
  onSelect: (id: Id) => void;
  disabled?: boolean;
  trigger?: "outline" | "prompt";
  triggerClassName?: string;
  triggerId?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = models.find((model) => model.id === value) ?? models[0];
  if (!selected) return null;
  const gateway = models.filter((item) => !isCodingAgentId(item.id));
  const sandbox = models.filter((item) => isCodingAgentId(item.id));
  const groups = sandbox.length
    ? [
        { heading: "AI Gateway", items: gateway },
        { heading: "Sandbox", items: sandbox },
      ]
    : [{ heading: "AI Gateway", items: models }];
  return (
    <ModelSelector onOpenChange={setOpen} open={open}>
      <ModelSelectorTrigger asChild>
        {trigger === "prompt" ? (
          <PromptInputButton
            className={cn("max-w-[min(100%,14rem)] min-w-0 gap-1.5 overflow-hidden", triggerClassName)}
            disabled={disabled}
            id={triggerId}
            size="sm"
          >
            <ModelSelectorLogo provider={selected.provider} />
            <ModelSelectorName>{selected.name}</ModelSelectorName>
          </PromptInputButton>
        ) : (
          <Button
            className={cn("w-full justify-start", triggerClassName)}
            disabled={disabled}
            id={triggerId}
            size="sm"
            type="button"
            variant="outline"
          >
            <ModelSelectorLogo provider={selected.provider} />
            <ModelSelectorName>{selected.name}</ModelSelectorName>
          </Button>
        )}
      </ModelSelectorTrigger>
      <ModelSelectorContent className="w-[calc(100vw-2rem)] max-w-md">
        <ModelSelectorInput placeholder="Search models…" />
        <ModelSelectorList>
          <ModelSelectorEmpty>No models found.</ModelSelectorEmpty>
          {groups.map((group) => (
            <ModelSelectorGroup heading={group.heading} key={group.heading}>
              {group.items.map((item) => (
                <ModelSelectorItem
                  key={item.id}
                  onSelect={() => {
                    onSelect(item.id);
                    setOpen(false);
                  }}
                  value={item.id}
                >
                  <ModelSelectorLogo provider={item.provider} />
                  <ModelSelectorName>{item.name}</ModelSelectorName>
                  {value === item.id ? <CheckIcon className="ml-auto size-4" /> : null}
                </ModelSelectorItem>
              ))}
            </ModelSelectorGroup>
          ))}
        </ModelSelectorList>
      </ModelSelectorContent>
    </ModelSelector>
  );
}
