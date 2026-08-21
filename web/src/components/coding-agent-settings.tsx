"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CLAUDE_CODE_MODELS,
  CODEX_MODELS,
  REASONING_EFFORTS,
  sanitizeCodingModel,
  type CodingKind,
  type CodingSettings,
} from "@/lib/harness";

export function CodingAgentSettings({
  kind,
  settings,
  idPrefix,
  onChange,
  compact = false,
}: {
  kind: CodingKind;
  settings: CodingSettings;
  idPrefix: string;
  onChange: (next: CodingSettings) => void;
  compact?: boolean;
}) {
  const models = kind === "codex" ? CODEX_MODELS : CLAUDE_CODE_MODELS;
  const listId = `${idPrefix}-models`;
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      <div className="space-y-1 sm:col-span-2">
        <Label className="text-xs" htmlFor={`${idPrefix}-model`}>
          Model
        </Label>
        <Input
          id={`${idPrefix}-model`}
          list={listId}
          onChange={(event) =>
            onChange({ ...settings, model: sanitizeCodingModel(kind, event.target.value) })
          }
          placeholder={kind === "codex" ? "gpt-5.5" : "claude-sonnet-4-6"}
          value={settings.model}
        />
        <datalist id={listId}>
          {models.map((id) => (
            <option key={id} value={id} />
          ))}
        </datalist>
        {compact ? null : (
          <p className="text-muted-foreground text-[11px]">
            {kind === "codex"
              ? "Passed to createCodex({ model }). OpenAI or gateway ids are accepted."
              : "Passed to createClaudeCode({ model }). Anthropic or gateway ids are accepted."}
          </p>
        )}
      </div>
      {kind === "codex" ? (
        <div className="space-y-1">
          <Label className="text-xs" htmlFor={`${idPrefix}-effort`}>
            Reasoning
          </Label>
          <Select
            onValueChange={(value) =>
              onChange({ ...settings, reasoningEffort: value as CodingSettings["reasoningEffort"] })
            }
            value={settings.reasoningEffort}
          >
            <SelectTrigger className="w-full" id={`${idPrefix}-effort`} size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {REASONING_EFFORTS.map((effort) => (
                <SelectItem key={effort} value={effort}>
                  {effort}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : (
        <div className="space-y-1">
          <Label className="text-xs" htmlFor={`${idPrefix}-turns`}>
            Max turns
          </Label>
          <Input
            id={`${idPrefix}-turns`}
            max={80}
            min={1}
            onChange={(event) =>
              onChange({
                ...settings,
                maxTurns: Math.min(80, Math.max(1, Number(event.target.value) || 1)),
              })
            }
            type="number"
            value={settings.maxTurns}
          />
        </div>
      )}
    </div>
  );
}
