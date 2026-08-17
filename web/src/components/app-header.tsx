import type { ReactNode } from "react";

export const GITHUB_URL = "https://github.com/Mellow-Artificial-Intelligence/openextract-ts";

export function AppHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border/50 bg-background/80 px-3 pt-[env(safe-area-inset-top)] backdrop-blur-lg sm:h-14 sm:gap-3 sm:px-6">
      <div className="flex min-w-0 items-center gap-2">
        <span className="flex size-7 shrink-0 items-center justify-center bg-foreground sm:size-8">
          <span className="font-bold font-mono text-[10px] text-background sm:text-xs">OE</span>
        </span>
        <span className="truncate font-mono text-sm">{title}</span>
      </div>
      <nav className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3">
        {children}
        <a
          className="font-mono text-muted-foreground text-xs transition-colors hover:text-foreground"
          href={GITHUB_URL}
          rel="noreferrer"
          target="_blank"
        >
          GitHub
        </a>
      </nav>
    </header>
  );
}
