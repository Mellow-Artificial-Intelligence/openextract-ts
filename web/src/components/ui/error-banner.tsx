import { cn } from "@/lib/utils";
import { TriangleAlertIcon } from "lucide-react";
import type { ReactNode } from "react";

export function ErrorBanner({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={cn(
        "flex items-start gap-2 border border-destructive/30 bg-destructive/10 px-3 py-2 text-destructive text-sm",
        className,
      )}
      role="alert"
    >
      <TriangleAlertIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
      <span className="min-w-0 flex-1">{children}</span>
    </div>
  );
}
