import { cn } from "@/lib/utils";
import type { ComponentProps } from "react";

/** Shortcut chip. `keys` are rendered verbatim, so pass "⌘" / "⇧" already resolved. */
export function Kbd({ keys, className, ...props }: ComponentProps<"kbd"> & { keys: string[] }) {
  return (
    <kbd
      className={cn(
        "pointer-events-none inline-flex select-none items-center gap-0.5 font-sans text-[10px] text-faint",
        className,
      )}
      {...props}
    >
      {keys.map((key) => (
        <span
          className="flex h-[15px] min-w-[15px] items-center justify-center rounded-[3px] border border-border bg-muted px-1 leading-none"
          key={key}
        >
          {key}
        </span>
      ))}
    </kbd>
  );
}
