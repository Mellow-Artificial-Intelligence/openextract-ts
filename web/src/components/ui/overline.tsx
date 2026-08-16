import { cn } from "@/lib/utils";
import type { ComponentProps } from "react";

export function Overline({
  as: Tag = "p",
  className,
  ...props
}: ComponentProps<"p"> & { as?: "p" | "span" }) {
  return (
    <Tag
      className={cn("font-mono text-[10px] text-muted-foreground uppercase tracking-wider", className)}
      {...props}
    />
  );
}
