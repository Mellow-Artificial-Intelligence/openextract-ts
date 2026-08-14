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
import { PRESETS, PRESET_IDS, STYLES, type PresetId, type StyleName } from "@/lib/presets";

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
  const preset = PRESET_IDS.find((id) => PRESETS[id].spec === schemaSpec.trim()) ?? "custom";

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <div className="space-y-2">
        <Label>Schema</Label>
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
          className="min-h-24 font-mono text-xs md:min-h-32"
          onChange={(event) => onSchemaSpec(event.target.value)}
          spellCheck={false}
          value={schemaSpec}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="style">Style</Label>
        <Select onValueChange={(value) => onStyle(value as StyleName)} value={style}>
          <SelectTrigger className="w-full" id="style">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STYLES.map((name) => (
              <SelectItem key={name} value={name}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="instructions">Instructions</Label>
        <Textarea
          id="instructions"
          onChange={(event) => onInstructions(event.target.value)}
          placeholder="Optional extraction guidance"
          value={instructions}
        />
      </div>
    </div>
  );
}
