import { cn } from "@/lib/utils";

export type StatusDotStatus = "queued" | "running" | "done" | "error";

const DOT_CLASSES: Record<StatusDotStatus, string> = {
  queued: "bg-faint/50",
  running: "bg-primary",
  done: "bg-success",
  error: "bg-destructive",
};

export function StatusDot({ status, className }: { status: StatusDotStatus; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("relative flex size-1.5 shrink-0 items-center justify-center", className)}
    >
      {status === "running" ? (
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary/70" />
      ) : null}
      <span className={cn("relative inline-flex size-full rounded-full", DOT_CLASSES[status])} />
    </span>
  );
}
