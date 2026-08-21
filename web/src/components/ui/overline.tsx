import { cn } from "@/lib/utils";
import type { ComponentProps } from "react";

/** Section label. Small, uppercase, wide-tracked — the quietest text in the UI. */
export function Overline({
  as: Tag = "p",
  className,
  ...props
}: ComponentProps<"p"> & { as?: "p" | "span" | "div" }) {
  return (
    <Tag
      className={cn(
        "font-medium text-[10px] text-faint uppercase tracking-[0.08em] leading-none",
        className,
      )}
      {...props}
    />
  );
}
