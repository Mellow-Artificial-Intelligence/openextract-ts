import { cn } from "@/lib/utils";

export type StatusDotStatus = "queued" | "running" | "done" | "error";

const DOT_CLASSES: Record<StatusDotStatus, string> = {
  queued: "bg-muted-foreground/40",
  running: "animate-pulse bg-foreground",
  done: "bg-foreground",
  error: "bg-destructive",
};

export function StatusDot({ status, className }: { status: StatusDotStatus; className?: string }) {
  return <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", DOT_CLASSES[status], className)} />;
}
