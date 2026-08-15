"use client";

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
import { ModelSelectorLogo } from "@/components/ai-elements/model-selector";
import { MODELS, SWARM_SIZES, type ModelId, type SwarmSize } from "@/lib/models";
import { STYLES, STYLE_DETAILS, type StyleName } from "@/lib/presets";

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

export function ExtractSettings({
  style,
  instructions,
  agents,
  agentModels,
  onStyle,
  onInstructions,
  onAgents,
  onAgentModel,
  className,
}: {
  style: StyleName;
  instructions: string;
  agents: SwarmSize;
  agentModels: ModelId[];
  onStyle: (style: StyleName) => void;
  onInstructions: (value: string) => void;
  onAgents: (value: SwarmSize) => void;
  onAgentModel: (index: number, model: ModelId) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-6", className)}>
      <Section
        hint="How many agents extract this source in parallel. 1 is a single pass."
        htmlFor="agents"
        title="Agents"
      >
        <Select
          onValueChange={(value) => onAgents(Number(value) as SwarmSize)}
          value={String(agents)}
        >
          <SelectTrigger className="w-full" id="agents">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SWARM_SIZES.map((count) => (
              <SelectItem key={count} value={String(count)}>
                {count === 1 ? "1 agent" : `${count} agents`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Section>

      {agents > 1 ? (
        <Section
          hint="Attach a model to each agent. Agents can share a model or use different ones."
          htmlFor="agent-model-0"
          title="Agent models"
        >
          <ol className="space-y-2">
            {agentModels.map((id, index) => (
              <li className="flex items-center gap-2" key={`agent-${index}`}>
                <span className="w-5 shrink-0 font-mono text-[11px] text-muted-foreground">
                  {index + 1}
                </span>
                <Select onValueChange={(value) => onAgentModel(index, value as ModelId)} value={id}>
                  <SelectTrigger className="w-full" id={index === 0 ? "agent-model-0" : undefined}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MODELS.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        <span className="flex items-center gap-2">
                          <ModelSelectorLogo provider={item.provider} />
                          {item.name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </li>
            ))}
          </ol>
        </Section>
      ) : null}

      <Section hint="How the model works through the source." htmlFor="style" title="Style">
        <Select onValueChange={(value) => onStyle(value as StyleName)} value={style}>
          <SelectTrigger className="w-full" id="style">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STYLES.map((name) => (
              <SelectItem key={name} value={name}>
                {STYLE_DETAILS[name].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-muted-foreground text-xs">{STYLE_DETAILS[style].description}</p>
      </Section>

      <Section
        hint="Optional guidance applied to every extraction."
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
