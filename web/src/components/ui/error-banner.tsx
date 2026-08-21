import { cn } from "@/lib/utils";
import { TriangleAlertIcon } from "lucide-react";
import type { ReactNode } from "react";

export function ErrorBanner({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-md border border-destructive/25 bg-destructive/8 px-2.5 py-2 text-destructive text-sm",
        className,
      )}
      role="alert"
    >
      <TriangleAlertIcon aria-hidden className="mt-px size-3.5 shrink-0" />
      <span className="min-w-0 flex-1 leading-snug">{children}</span>
    </div>
  );
}
