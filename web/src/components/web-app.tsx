"use client";

import { AgentsApp } from "@/components/agents-app";
import { AppSidebar } from "@/components/app-sidebar";
import { CommandMenu } from "@/components/command-menu";
import { ExtractApp } from "@/components/extract-app";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { SECTIONS, type PresetRequest, type SectionId } from "@/lib/sections";
import { useCallback, useEffect, useRef, useState } from "react";

/** What the shell hands every section. Sections render their own topbar with it. */
export interface ShellProps {
  onMenu: () => void;
  onCommand: () => void;
  preset: PresetRequest | null;
  onPresetApplied: (id: string | null) => void;
  registerRun: (run: (() => void) | null) => void;
}

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT"
  );
}

export function WebApp() {
  const [section, setSection] = useState<SectionId>("extract");
  const [navOpen, setNavOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [preset, setPreset] = useState<PresetRequest | null>(null);
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const [canRun, setCanRun] = useState(false);
  const runRef = useRef<(() => void) | null>(null);

  const registerRun = useCallback((run: (() => void) | null) => {
    runRef.current = run;
    setCanRun(Boolean(run));
  }, []);

  const requestPreset = useCallback((id: string) => {
    setPreset({ id, nonce: Date.now() });
    setActivePreset(id);
    setNavOpen(false);
  }, []);

  const goToSection = useCallback((next: SectionId) => {
    setSection(next);
    setActivePreset(null);
    setNavOpen(false);
    runRef.current = null;
    setCanRun(false);
  }, []);

  const runActive = useCallback(() => runRef.current?.(), []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const meta = event.metaKey || event.ctrlKey;
      if (meta && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen((open) => !open);
        return;
      }
      if (meta && event.key === "Enter") {
        event.preventDefault();
        runRef.current?.();
        return;
      }
      if (meta || event.altKey || isTypingTarget(event.target)) return;
      const index = Number.parseInt(event.key, 10) - 1;
      const target = SECTIONS[index];
      if (target) {
        event.preventDefault();
        goToSection(target.id);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [goToSection]);

  const shell: ShellProps = {
    onMenu: () => setNavOpen(true),
    onCommand: () => setCommandOpen(true),
    preset,
    onPresetApplied: setActivePreset,
    registerRun,
  };

  const sidebar = (
    <AppSidebar
      activePreset={activePreset}
      onPreset={requestPreset}
      onSection={goToSection}
      section={section}
    />
  );

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      <aside className="hidden w-60 shrink-0 border-r border-border lg:block">{sidebar}</aside>

      <Sheet onOpenChange={setNavOpen} open={navOpen}>
        <SheetContent className="w-64 gap-0 p-0" side="left">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SheetDescription className="sr-only">
            Switch between the Extract and Agents playgrounds.
          </SheetDescription>
          {sidebar}
        </SheetContent>
      </Sheet>

      <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {section === "extract" ? <ExtractApp shell={shell} /> : <AgentsApp shell={shell} />}
      </main>

      <CommandMenu
        canRun={canRun}
        onOpenChange={setCommandOpen}
        onPreset={requestPreset}
        onRun={runActive}
        onSection={goToSection}
        open={commandOpen}
        section={section}
      />
    </div>
  );
}
