"use client";

import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { cn } from "@/lib/utils";
import { PanelLeftIcon, SearchIcon } from "lucide-react";
import type { ReactNode } from "react";

/**
 * The single header for every section. Left side names where you are,
 * right side holds the section's actions and the primary run control.
 */
export function AppTopbar({
  title,
  crumb,
  actions,
  primary,
  onMenu,
  onCommand,
}: {
  title: string;
  crumb?: string;
  actions?: ReactNode;
  primary?: ReactNode;
  onMenu: () => void;
  onCommand: () => void;
}) {
  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-background px-2 sm:px-3">
      <Button
        aria-label="Open navigation"
        className="lg:hidden"
        onClick={onMenu}
        size="icon-sm"
        type="button"
        variant="ghost"
      >
        <PanelLeftIcon />
      </Button>

      <div className="flex min-w-0 items-center gap-1.5">
        <span className="truncate font-medium text-sm">{title}</span>
        {crumb ? (
          <>
            <span aria-hidden className="text-faint">
              /
            </span>
            <span className="truncate text-muted-foreground text-sm">{crumb}</span>
          </>
        ) : null}
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        <button
          className={cn(
            "hidden h-7 items-center gap-2 rounded-lg border border-border bg-raised pr-1.5 pl-2 text-muted-foreground text-sm transition-colors duration-100 hover:border-border-strong hover:text-foreground sm:flex",
          )}
          onClick={onCommand}
          type="button"
        >
          <SearchIcon className="size-3.5" />
          <span className="pr-6">Search</span>
          <Kbd keys={["⌘", "K"]} />
        </button>
        <Button
          aria-label="Search"
          className="sm:hidden"
          onClick={onCommand}
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          <SearchIcon />
        </Button>
        {actions}
        {primary}
      </div>
    </header>
  );
}
