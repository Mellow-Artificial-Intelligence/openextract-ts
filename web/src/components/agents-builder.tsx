"use client";

import { SystemAgentCard } from "@/components/system-agent-card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { PanelSection } from "@/components/ui/panel";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  SYSTEM_STARTERS,
  addSystemAgent,
  dropCodingAgents,
  removeSystemAgent,
  replaceSystemAgent,
  type ExtractionSystem,
} from "@/lib/agent-system";
import { COOKBOOK_DOCS, type CookbookModel } from "@/lib/cookbook-catalog";
import { MAX_SWARM_AGENTS } from "@/lib/models";
import { cn } from "@/lib/utils";
import { PlusIcon } from "lucide-react";

export function AgentsBuilder({
  system,
  models,
  viewing,
  busy,
  onSystem,
  onStarter,
  onView,
}: {
  system: ExtractionSystem;
  models: readonly CookbookModel[];
  viewing: string | null;
  busy: boolean;
  onSystem: (update: ExtractionSystem | ((current: ExtractionSystem) => ExtractionSystem)) => void;
  onStarter: (id: string) => void;
  onView: (name: string) => void;
}) {
  const starter = SYSTEM_STARTERS.find((item) => item.id === system.starterId) ?? SYSTEM_STARTERS[4];
  return (
    <div className="space-y-5 p-3">
      <PanelSection title="System">
        <Select disabled={busy} onValueChange={onStarter} value={system.starterId}>
          <SelectTrigger className="w-full" size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SYSTEM_STARTERS.map((item) => (
              <SelectItem key={item.id} value={item.id}>
                {item.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-muted-foreground text-xs">{starter?.blurb}</p>
      </PanelSection>

      <PanelSection title="Setup">
        <div className="grid grid-cols-2 gap-2">
          <Select
            disabled={busy}
            onValueChange={(value) =>
              onSystem((current) => ({
                ...current,
                starterId: "custom",
                schema: value === "audit" ? "audit" : "invoice",
              }))
            }
            value={system.schema}
          >
            <SelectTrigger className="w-full" size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="invoice">Invoice</SelectItem>
              <SelectItem value="audit">Audit</SelectItem>
            </SelectContent>
          </Select>
          <Select
            disabled={busy}
            onValueChange={(value) =>
              onSystem((current) => ({
                ...current,
                starterId: "custom",
                reduce: value as ExtractionSystem["reduce"],
              }))
            }
            value={system.reduce}
          >
            <SelectTrigger className="w-full" size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="merge">Merge</SelectItem>
              <SelectItem value="vote">Vote</SelectItem>
              <SelectItem value="first">First</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <label className="flex cursor-pointer items-center gap-2 pt-1">
          <Checkbox
            checked={system.sandbox}
            disabled={busy}
            onCheckedChange={(value) => {
              const next = value === true;
              onSystem((current) => (next ? { ...current, sandbox: true } : dropCodingAgents(current)));
            }}
          />
          <span className="font-mono text-xs">Sandboxes</span>
        </label>
      </PanelSection>

      <PanelSection
        action={
          <Button
            disabled={busy || system.agents.length >= MAX_SWARM_AGENTS}
            onClick={() => onSystem((current) => addSystemAgent(current, models))}
            size="xs"
            type="button"
            variant="outline"
          >
            <PlusIcon />
            Add
          </Button>
        }
        title="Agents"
      >
        <ol className="space-y-2">
          {system.agents.map((agent, index) => (
            <SystemAgentCard
              agent={agent}
              canRemove={system.agents.length > 1}
              disabled={busy}
              index={index}
              key={`${agent.role}-${index}`}
              models={models}
              onChange={(next) => onSystem((current) => replaceSystemAgent(current, index, next))}
              onRemove={() => onSystem((current) => removeSystemAgent(current, index))}
            />
          ))}
        </ol>
      </PanelSection>

      <PanelSection title="Documents">
        <ul className="space-y-0.5">
          {COOKBOOK_DOCS.map((name) => {
            const checked = system.docs.includes(name);
            const active = viewing === name;
            return (
              <li className="flex items-center gap-2" key={name}>
                <Checkbox
                  checked={checked}
                  disabled={busy}
                  id={`doc-${name}`}
                  onCheckedChange={(value) => {
                    const next = value === true;
                    onSystem((current) => {
                      const has = current.docs.includes(name);
                      if (next === has) return current;
                      return {
                        ...current,
                        docs: next ? [...current.docs, name] : current.docs.filter((item) => item !== name),
                      };
                    });
                    if (next) onView(name);
                  }}
                />
                <button
                  aria-current={active ? "true" : undefined}
                  className={cn(
                    "min-w-0 flex-1 truncate py-1 text-left font-mono text-xs",
                    active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                  onClick={() => onView(name)}
                  type="button"
                >
                  {name}
                </button>
              </li>
            );
          })}
        </ul>
      </PanelSection>
    </div>
  );
}
