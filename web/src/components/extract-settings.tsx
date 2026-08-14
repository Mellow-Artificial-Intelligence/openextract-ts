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
  onStyle,
  onInstructions,
  className,
}: {
  style: StyleName;
  instructions: string;
  onStyle: (style: StyleName) => void;
  onInstructions: (value: string) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-6", className)}>
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
