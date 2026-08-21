"use client";

import { Kbd } from "@/components/ui/kbd";
import { Overline } from "@/components/ui/overline";
import { useTheme } from "@/components/theme";
import { SECTIONS, presetsFor, type SectionId } from "@/lib/sections";
import { cn } from "@/lib/utils";
import {
  BookOpenIcon,
  LayersIcon,
  MonitorIcon,
  MoonIcon,
  SunIcon,
  TableIcon,
} from "lucide-react";
import type { ComponentType } from "react";

export const GITHUB_URL = "https://github.com/Mellow-Artificial-Intelligence/openextract-ts";
export const DOCS_URL = `${GITHUB_URL}/blob/main/docs/api-reference.md`;

const SECTION_ICONS: Record<SectionId, ComponentType<{ className?: string }>> = {
  extract: TableIcon,
  agents: LayersIcon,
};

function NavItem({
  active,
  icon: Icon,
  label,
  shortcut,
  onClick,
}: {
  active: boolean;
  icon: ComponentType<{ className?: string }>;
  label: string;
  shortcut: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-current={active ? "page" : undefined}
      className={cn(
        "group flex h-7 w-full items-center gap-2 rounded-md px-2 text-sm transition-colors duration-100",
        active
          ? "bg-hover font-medium text-foreground"
          : "text-muted-foreground hover:bg-hover hover:text-foreground",
      )}
      onClick={onClick}
      type="button"
    >
      <Icon className={cn("size-3.5 shrink-0", active ? "text-primary" : "text-faint")} />
      <span className="min-w-0 flex-1 truncate text-left">{label}</span>
      <Kbd className="opacity-0 transition-opacity group-hover:opacity-100" keys={[shortcut]} />
    </button>
  );
}

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const options = [
    { id: "light", icon: SunIcon, label: "Light" },
    { id: "dark", icon: MoonIcon, label: "Dark" },
    { id: "system", icon: MonitorIcon, label: "System" },
  ] as const;
  return (
    <div
      aria-label="Theme"
      className="flex items-center gap-0.5 rounded-md border border-border bg-background p-0.5"
      role="radiogroup"
    >
      {options.map((option) => (
        <button
          aria-checked={theme === option.id}
          aria-label={option.label}
          className={cn(
            "flex size-5 items-center justify-center rounded-[3px] transition-colors duration-100",
            theme === option.id
              ? "bg-hover text-foreground"
              : "text-faint hover:text-muted-foreground",
          )}
          key={option.id}
          onClick={() => setTheme(option.id)}
          role="radio"
          type="button"
        >
          <option.icon className="size-3" />
        </button>
      ))}
    </div>
  );
}

export function AppSidebar({
  section,
  onSection,
  onPreset,
  activePreset,
}: {
  section: SectionId;
  onSection: (section: SectionId) => void;
  onPreset: (id: string) => void;
  activePreset: string | null;
}) {
  const presets = presetsFor(section);
  return (
    <div className="flex h-full min-h-0 flex-col bg-panel">
      <div className="flex h-12 shrink-0 items-center gap-2 px-3">
        <span className="flex size-5 shrink-0 items-center justify-center rounded-[5px] bg-primary text-[9px] font-bold text-primary-foreground">
          OE
        </span>
        <span className="min-w-0 truncate font-semibold text-sm tracking-[-0.01em]">openextract</span>
        <span className="ml-auto rounded-full border border-border px-1.5 py-px text-[9px] text-faint uppercase tracking-wider">
          playground
        </span>
      </div>

      <nav className="shrink-0 space-y-0.5 px-2">
        {SECTIONS.map((item, index) => (
          <NavItem
            active={section === item.id}
            icon={SECTION_ICONS[item.id]}
            key={item.id}
            label={item.label}
            onClick={() => onSection(item.id)}
            shortcut={String(index + 1)}
          />
        ))}
      </nav>

      <div className="mt-5 flex min-h-0 flex-1 flex-col px-2">
        <div className="flex h-5 shrink-0 items-center px-2">
          <Overline>{section === "agents" ? "Systems" : "Examples"}</Overline>
        </div>
        <div className="mt-1 min-h-0 flex-1 space-y-0.5 overflow-y-auto pb-2">
          {presets.map((preset) => {
            const active = activePreset === preset.id;
            return (
              <button
                className={cn(
                  "block w-full rounded-md px-2 py-1.5 text-left transition-colors duration-100",
                  active ? "bg-hover" : "hover:bg-hover",
                )}
                key={preset.id}
                onClick={() => onPreset(preset.id)}
                type="button"
              >
                <span
                  className={cn(
                    "block truncate text-sm",
                    active ? "font-medium text-foreground" : "text-muted-foreground",
                  )}
                >
                  {preset.label}
                </span>
                <span className="mt-0.5 block truncate text-[11px] text-faint">{preset.blurb}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="shrink-0 border-t border-border p-2">
        <div className="flex items-center gap-1">
          <a
            className="flex h-6 items-center gap-1.5 rounded-md px-1.5 text-[11px] text-muted-foreground transition-colors hover:bg-hover hover:text-foreground"
            href={DOCS_URL}
            rel="noreferrer"
            target="_blank"
          >
            <BookOpenIcon className="size-3" />
            Docs
          </a>
          <a
            className="flex h-6 items-center gap-1.5 rounded-md px-1.5 text-[11px] text-muted-foreground transition-colors hover:bg-hover hover:text-foreground"
            href={GITHUB_URL}
            rel="noreferrer"
            target="_blank"
          >
            <svg aria-hidden className="size-3" fill="currentColor" viewBox="0 0 16 16">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
            </svg>
            GitHub
          </a>
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </div>
      </div>
    </div>
  );
}
