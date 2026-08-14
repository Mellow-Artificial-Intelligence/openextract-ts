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
import { PRESETS, PRESET_IDS, STYLES, type PresetId, type StyleName } from "@/lib/presets";
import { Button } from "@/components/ui/button";

export function ExtractSettings({
  schemaSpec,
  style,
  instructions,
  onSchemaSpec,
  onStyle,
  onInstructions,
}: {
  schemaSpec: string;
  style: StyleName;
  instructions: string;
  onSchemaSpec: (spec: string) => void;
  onStyle: (style: StyleName) => void;
  onInstructions: (value: string) => void;
}) {
  const preset = PRESET_IDS.find((id) => PRESETS[id].spec === schemaSpec.trim()) ?? "custom";

  return (
    <aside className="flex w-full shrink-0 flex-col gap-4 border-border border-b p-4 md:h-full md:w-72 md:overflow-y-auto md:border-r md:border-b-0">
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
          className="min-h-32 font-mono text-xs"
          onChange={(event) => onSchemaSpec(event.target.value)}
          spellCheck={false}
          value={schemaSpec}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="style">Style</Label>
        <Select onValueChange={(value) => onStyle(value as StyleName)} value={style}>
          <SelectTrigger id="style">
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
    </aside>
  );
}
