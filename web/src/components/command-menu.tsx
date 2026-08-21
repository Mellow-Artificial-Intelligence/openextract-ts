"use client";

import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { useTheme } from "@/components/theme";
import { DOCS_URL, GITHUB_URL } from "@/components/app-sidebar";
import { SECTIONS, presetsFor, type SectionId } from "@/lib/sections";
import {
  BookOpenIcon,
  LayersIcon,
  MonitorIcon,
  MoonIcon,
  PlayIcon,
  SunIcon,
  TableIcon,
} from "lucide-react";
import type { ComponentType } from "react";

const SECTION_ICONS: Record<SectionId, ComponentType<{ className?: string }>> = {
  extract: TableIcon,
  agents: LayersIcon,
};

export function CommandMenu({
  open,
  onOpenChange,
  section,
  onSection,
  onPreset,
  onRun,
  canRun,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  section: SectionId;
  onSection: (section: SectionId) => void;
  onPreset: (id: string) => void;
  onRun: () => void;
  canRun: boolean;
}) {
  const { setTheme } = useTheme();
  const presets = presetsFor(section);

  const run = (action: () => void) => {
    onOpenChange(false);
    action();
  };

  return (
    <CommandDialog onOpenChange={onOpenChange} open={open}>
      <Command>
        <CommandInput placeholder="Search sections, examples, and actions…" />
        <CommandList>
          <CommandEmpty>No matches.</CommandEmpty>

          {canRun ? (
            <CommandGroup heading="Actions">
              <CommandItem onSelect={() => run(onRun)} value="run extract">
                <PlayIcon />
                Run {section === "agents" ? "system" : "extraction"}
                <CommandShortcut>⌘↵</CommandShortcut>
              </CommandItem>
            </CommandGroup>
          ) : null}

          <CommandGroup heading="Go to">
            {SECTIONS.map((item, index) => {
              const Icon = SECTION_ICONS[item.id];
              return (
                <CommandItem
                  key={item.id}
                  onSelect={() => run(() => onSection(item.id))}
                  value={`${item.label} ${item.blurb}`}
                >
                  <Icon />
                  <span className="shrink-0">{item.label}</span>
                  <span className="min-w-0 truncate text-faint text-xs">{item.blurb}</span>
                  <CommandShortcut>{index + 1}</CommandShortcut>
                </CommandItem>
              );
            })}
          </CommandGroup>

          <CommandSeparator />

          <CommandGroup heading={section === "agents" ? "Systems" : "Examples"}>
            {presets.map((preset) => (
              <CommandItem
                key={preset.id}
                onSelect={() => run(() => onPreset(preset.id))}
                value={`${preset.label} ${preset.blurb}`}
              >
                <span className="shrink-0">{preset.label}</span>
                <span className="min-w-0 truncate text-faint text-xs">{preset.blurb}</span>
              </CommandItem>
            ))}
          </CommandGroup>

          <CommandSeparator />

          <CommandGroup heading="Theme">
            <CommandItem onSelect={() => run(() => setTheme("dark"))} value="theme dark">
              <MoonIcon />
              Dark
            </CommandItem>
            <CommandItem onSelect={() => run(() => setTheme("light"))} value="theme light">
              <SunIcon />
              Light
            </CommandItem>
            <CommandItem onSelect={() => run(() => setTheme("system"))} value="theme system">
              <MonitorIcon />
              System
            </CommandItem>
          </CommandGroup>

          <CommandGroup heading="Reference">
            <CommandItem
              onSelect={() => run(() => window.open(DOCS_URL, "_blank", "noreferrer"))}
              value="api reference docs"
            >
              <BookOpenIcon />
              API reference
            </CommandItem>
            <CommandItem
              onSelect={() => run(() => window.open(GITHUB_URL, "_blank", "noreferrer"))}
              value="github repository source"
            >
              <BookOpenIcon />
              GitHub repository
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
