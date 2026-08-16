import { Overline } from "@/components/ui/overline";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export function AgentsPane({
  title,
  extra,
  children,
  className,
  bodyClassName,
}: {
  title: string;
  extra?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn("flex min-h-0 flex-col overflow-hidden", className)}>
      <div className="flex h-9 shrink-0 items-center justify-between gap-3 border-b border-border/50 px-3">
        <Overline>{title}</Overline>
        {extra ? <div className="min-w-0">{extra}</div> : null}
      </div>
      <div className={cn("min-h-0 flex-1 overflow-y-auto overflow-x-hidden", bodyClassName)}>{children}</div>
    </section>
  );
}
