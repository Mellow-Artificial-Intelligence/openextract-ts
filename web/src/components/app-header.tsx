import Link from "next/link";
import { cn } from "@/lib/utils";

const GITHUB_URL = "https://github.com/Mellow-Artificial-Intelligence/openextract";

const NAV = [
  { href: "/", id: "extract", label: "Extract" },
  { href: "/builder", id: "builder", label: "Builder" },
] as const;

export function AppHeader({
  current,
  children,
}: {
  current: "extract" | "builder";
  children?: React.ReactNode;
}) {
  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-black/5 bg-background/80 px-3 pt-[env(safe-area-inset-top)] backdrop-blur-lg sm:h-14 sm:gap-3 sm:px-6">
      <Link className="flex shrink-0 items-center gap-2" href="/">
        <span className="flex size-7 items-center justify-center bg-foreground sm:size-8">
          <span className="font-bold font-mono text-background text-[10px] sm:text-xs">OE</span>
        </span>
        <span className="hidden font-mono text-muted-foreground text-sm sm:inline">openextract</span>
      </Link>
      <nav aria-label="App" className="flex items-center gap-1 sm:gap-2">
        {NAV.map((item) => (
          <Link
            className={cn(
              "px-1.5 font-mono text-xs transition-colors sm:px-2",
              current === item.id ? "text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
            href={item.href}
            key={item.id}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3">
        {children}
        <a
          className="font-mono text-muted-foreground text-xs transition-colors hover:text-foreground"
          href={GITHUB_URL}
          rel="noreferrer"
          target="_blank"
        >
          GitHub
        </a>
      </div>
    </header>
  );
}
