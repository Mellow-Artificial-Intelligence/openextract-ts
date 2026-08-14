"use client";

import { Button } from "@/components/ui/button";
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
import {
  PRESETS,
  PRESET_IDS,
  STYLES,
  STYLE_DETAILS,
  presetIdForSpec,
  type PresetId,
  type StyleName,
} from "@/lib/presets";

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
        <Label htmlFor={htmlFor}>{title}</Label>
        <p className="text-muted-foreground text-xs">{hint}</p>
      </div>
      {children}
    </section>
  );
}

export function ExtractSettings({
  schemaSpec,
  style,
  instructions,
  onSchemaSpec,
  onStyle,
  onInstructions,
  className,
}: {
  schemaSpec: string;
  style: StyleName;
  instructions: string;
  onSchemaSpec: (spec: string) => void;
  onStyle: (style: StyleName) => void;
  onInstructions: (value: string) => void;
  className?: string;
}) {
  const preset = presetIdForSpec(schemaSpec);

  return (
    <div className={cn("flex flex-col gap-6", className)}>
      <Section
        hint="One field per line. Pick a preset or write your own."
        htmlFor="schema"
        title="Schema"
      >
        <div className="flex flex-wrap gap-1">
          {PRESET_IDS.map((id: PresetId) => (
            <Button
              key={id}
              onClick={() => onSchemaSpec(PRESETS[id].spec)}
              size="xs"
              type="button"
              variant={preset === id ? "default" : "outline"}
            >
              {PRESETS[id].label}
            </Button>
          ))}
        </div>
        <Textarea
          className="min-h-28 resize-y font-mono text-xs leading-relaxed md:min-h-36"
          id="schema"
          onChange={(event) => onSchemaSpec(event.target.value)}
          spellCheck={false}
          value={schemaSpec}
        />
      </Section>

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
