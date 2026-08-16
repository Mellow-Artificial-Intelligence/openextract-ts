"use client";

import { CodingAgentSettings } from "@/components/coding-agent-settings";
import { ModelPicker } from "@/components/model-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { codingKind } from "@/lib/harness";
import { isCodingAgentId } from "@/lib/models";
import { GATEWAY_STYLES, STYLE_DETAILS } from "@/lib/presets";
import { setAgentModel, type SystemAgent } from "@/lib/agent-system";
import type { CookbookModel } from "@/lib/cookbook-catalog";
import { Trash2Icon } from "lucide-react";

export function SystemAgentCard({
  index,
  agent,
  models,
  disabled,
  onChange,
  onRemove,
  canRemove,
}: {
  index: number;
  agent: SystemAgent;
  models: readonly CookbookModel[];
  disabled?: boolean;
  onChange: (agent: SystemAgent) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  const kind = codingKind(agent.id);
  return (
    <li className="space-y-2 border border-border/60 p-2">
      <div className="flex items-center gap-2">
        <span className="w-4 shrink-0 font-mono text-[11px] text-muted-foreground">{index + 1}</span>
        <Input
          aria-label={`Agent ${index + 1} role`}
          className="h-7"
          disabled={disabled}
          onChange={(event) => onChange({ ...agent, role: event.target.value.slice(0, 40) })}
          value={agent.role}
        />
        {canRemove ? (
          <Button
            aria-label={`Remove ${agent.role}`}
            disabled={disabled}
            onClick={onRemove}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <Trash2Icon />
          </Button>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <ModelPicker
          disabled={disabled}
          models={models}
          onSelect={(id) => onChange(setAgentModel(agent, id))}
          triggerClassName="min-w-0 flex-1"
          value={agent.id}
        />
        {kind ? (
          <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">Sandbox</span>
        ) : (
          <Select
            disabled={disabled}
            onValueChange={(value) => onChange({ ...agent, style: value as SystemAgent["style"] })}
            value={agent.style}
          >
            <SelectTrigger className="w-[7.5rem]" size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {GATEWAY_STYLES.map((style) => (
                <SelectItem key={style} value={style}>
                  {STYLE_DETAILS[style].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
      {kind && agent.coding ? (
        <CodingAgentSettings
          idPrefix={`system-agent-${index}`}
          kind={kind}
          onChange={(coding) => onChange({ ...agent, coding })}
          settings={agent.coding}
        />
      ) : null}
      <Textarea
        className="min-h-16 resize-y text-xs"
        disabled={disabled}
        onChange={(event) => onChange({ ...agent, instructions: event.target.value.slice(0, 4_000) })}
        placeholder={
          isCodingAgentId(agent.id)
            ? "What this coding agent should extract…"
            : "What this specialist should look for…"
        }
        value={agent.instructions}
      />
    </li>
  );
}
