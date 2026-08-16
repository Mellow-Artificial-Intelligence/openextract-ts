"use client";

import { CodingAgentSettings } from "@/components/coding-agent-settings";
import { ModelPicker } from "@/components/model-picker";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { codingKind, specForModel, type AgentSpec } from "@/lib/harness";
import {
  GATEWAY_MODELS,
  MODELS,
  SWARM_SIZES,
  isCodingAgentId,
  type SwarmSize,
} from "@/lib/models";
import { GATEWAY_STYLES, STYLE_DETAILS, type StyleName } from "@/lib/presets";

function Section({
  title,
  hint,
  htmlFor,
  children,
}: {
  title: string;
  hint: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <div className="space-y-0.5">
        <Label className="font-mono text-sm" htmlFor={htmlFor}>
          {title}
        </Label>
        <p className="text-muted-foreground text-xs">{hint}</p>
      </div>
      {children}
    </section>
  );
}

function Toggle({
  id,
  checked,
  title,
  hint,
  onChange,
}: {
  id: string;
  checked: boolean;
  title: string;
  hint: string;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2" htmlFor={id}>
      <Checkbox checked={checked} id={id} onCheckedChange={(value) => onChange(value === true)} />
      <span className="space-y-0.5">
        <span className="block font-mono text-sm">{title}</span>
        <span className="block text-muted-foreground text-xs">{hint}</span>
      </span>
    </label>
  );
}

export function ExtractSettings({
  style,
  instructions,
  agents,
  team,
  sandbox,
  workflow,
  onStyle,
  onInstructions,
  onAgents,
  onMember,
  onSandbox,
  onWorkflow,
  className,
}: {
  style: StyleName;
  instructions: string;
  agents: SwarmSize;
  team: AgentSpec[];
  sandbox: boolean;
  workflow: boolean;
  onStyle: (style: StyleName) => void;
  onInstructions: (value: string) => void;
  onAgents: (value: SwarmSize) => void;
  onMember: (index: number, spec: AgentSpec) => void;
  onSandbox: (value: boolean) => void;
  onWorkflow: (value: boolean) => void;
  className?: string;
}) {
  const pool = sandbox ? MODELS : GATEWAY_MODELS;
  const gatewayStyle = style === "sandbox" ? "direct" : style;
  const solo = team[0];
  const soloKind = solo ? codingKind(solo.id) : null;
  return (
    <div className={cn("flex flex-col gap-6", className)}>
      <Section
        hint="Specialists extract this source in parallel, then unique rows are merged."
        htmlFor="agents"
        title="Team"
      >
        <Select onValueChange={(value) => onAgents(Number(value) as SwarmSize)} value={String(agents)}>
          <SelectTrigger className="w-full" id="agents">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SWARM_SIZES.map((count) => (
              <SelectItem key={count} value={String(count)}>
                {count === 1 ? "1 specialist" : `${count} specialists`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Section>

      {agents > 1 ? (
        <Section
          hint="Mix gateway models with Claude Code or Codex. Each member runs independently."
          htmlFor="agent-model-0"
          title="Members"
        >
          <ol className="space-y-4">
            {team.map((spec, index) => {
              const kind = codingKind(spec.id);
              return (
                <li className="space-y-2" key={`agent-${index}`}>
                  <div className="flex items-center gap-2">
                    <span className="w-5 shrink-0 font-mono text-[11px] text-muted-foreground">{index + 1}</span>
                    <ModelPicker
                      models={pool}
                      onSelect={(model) => onMember(index, specForModel(model, spec))}
                      triggerId={index === 0 ? "agent-model-0" : undefined}
                      value={spec.id}
                    />
                    {isCodingAgentId(spec.id) ? (
                      <span className="shrink-0 font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
                        Sandbox
                      </span>
                    ) : null}
                  </div>
                  {kind && spec.coding ? (
                    <div className="pl-7">
                      <CodingAgentSettings
                        idPrefix={`agent-${index}`}
                        kind={kind}
                        onChange={(coding) => onMember(index, { ...spec, coding })}
                        settings={spec.coding}
                      />
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ol>
        </Section>
      ) : soloKind && solo?.coding ? (
        <Section
          hint="Harness options for this coding agent. The runtime still runs in a Vercel Sandbox."
          htmlFor="agent-0-model"
          title={soloKind === "codex" ? "Codex" : "Claude Code"}
        >
          <CodingAgentSettings
            idPrefix="agent-0"
            kind={soloKind}
            onChange={(coding) => onMember(0, { ...solo, coding })}
            settings={solo.coding}
          />
        </Section>
      ) : null}

      <Section hint="How this team runs." htmlFor="workflow" title="Runtime">
        <div className="space-y-3">
          <Toggle
            checked={workflow}
            hint="Durable Vercel Workflow. Long tool loops survive deploys."
            id="workflow"
            onChange={onWorkflow}
            title="Workflows"
          />
          <Toggle
            checked={sandbox}
            hint="Claude Code and Codex can join as callable specialists in a Vercel Sandbox."
            id="sandbox"
            onChange={onSandbox}
            title="Sandboxes"
          />
        </div>
      </Section>

      <Section
        hint="How gateway models inspect the source. Coding agents always use a sandbox."
        htmlFor="style"
        title="Style"
      >
        <Select onValueChange={(value) => onStyle(value as StyleName)} value={gatewayStyle}>
          <SelectTrigger className="w-full" id="style">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {GATEWAY_STYLES.map((name) => (
              <SelectItem key={name} value={name}>
                {STYLE_DETAILS[name].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-muted-foreground text-xs">{STYLE_DETAILS[gatewayStyle].description}</p>
      </Section>

      <Section
        hint="Optional guidance applied to every specialist."
        htmlFor="instructions"
        title="Instructions"
      >
        <Textarea
          className="min-h-20 resize-y text-sm"
          id="instructions"
          onChange={(event) => onInstructions(event.target.value)}
          placeholder="e.g. Use ISO dates and leave unknown fields null."
          value={instructions}
        />
      </Section>
    </div>
  );
}
