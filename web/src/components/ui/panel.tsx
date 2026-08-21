import { Overline } from "@/components/ui/overline";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

/**
 * A titled, independently scrolling column. Both the Extract and Agents
 * sections are built from these so every pane shares one header rhythm.
 */
export function Panel({
  title,
  extra,
  children,
  footer,
  className,
  bodyClassName,
}: {
  title: ReactNode;
  extra?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn("flex min-h-0 flex-col overflow-hidden", className)}>
      <header className="flex h-9 shrink-0 items-center justify-between gap-3 border-b border-border px-3">
        {typeof title === "string" ? <Overline>{title}</Overline> : title}
        {extra ? <div className="flex min-w-0 items-center gap-2">{extra}</div> : null}
      </header>
      <div className={cn("min-h-0 flex-1 overflow-y-auto overflow-x-hidden", bodyClassName)}>
        {children}
      </div>
      {footer ? <div className="shrink-0 border-t border-border">{footer}</div> : null}
    </section>
  );
}

/** Grouped block inside a panel body. */
export function PanelSection({
  title,
  action,
  children,
  className,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("space-y-2", className)}>
      <div className="flex h-5 items-center justify-between gap-2">
        <Overline>{title}</Overline>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Centered empty state. Keeps the "nothing here yet" voice consistent. */
export function PanelEmpty({ children, icon }: { children: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex h-full min-h-40 flex-col items-center justify-center gap-2 px-6 text-center">
      {icon ? <div className="text-faint [&_svg]:size-5">{icon}</div> : null}
      <p className="max-w-56 text-balance text-muted-foreground text-xs leading-relaxed">{children}</p>
    </div>
  );
}
