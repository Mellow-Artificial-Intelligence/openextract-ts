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
import { SWARM_SIZES, type SwarmSize } from "@/lib/models";
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
  fanoutModels,
  onStyle,
  onInstructions,
  onAgents,
  onFanoutModels,
  className,
}: {
  style: StyleName;
  instructions: string;
  agents: SwarmSize;
  fanoutModels: boolean;
  onStyle: (style: StyleName) => void;
  onInstructions: (value: string) => void;
  onAgents: (value: SwarmSize) => void;
  onFanoutModels: (value: boolean) => void;
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
          hint="Same model for every agent, or rotate through the model list."
          htmlFor="fanout"
          title="Models"
        >
          <Select
            onValueChange={(value) => onFanoutModels(value === "fanout")}
            value={fanoutModels ? "fanout" : "same"}
          >
            <SelectTrigger className="w-full" id="fanout">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="same">Selected model</SelectItem>
              <SelectItem value="fanout">Rotate all models</SelectItem>
            </SelectContent>
          </Select>
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
