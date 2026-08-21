"use client";

import { cn } from "@/lib/utils";
import { CheckIcon } from "lucide-react";

export const FLOW_STEPS = ["describe", "schema", "extract"] as const;
export type FlowStep = (typeof FLOW_STEPS)[number];

export const STEP_META: Record<FlowStep, { n: number; label: string; hint: string }> = {
  describe: { n: 1, label: "Describe", hint: "What should the table contain?" },
  schema: { n: 2, label: "Schema", hint: "Edit the columns, then continue." },
  extract: { n: 3, label: "Extract", hint: "Add a source and fill the rows." },
};

export function ExtractSteps({
  step,
  onStep,
  schemaReady,
  extractReady,
}: {
  step: FlowStep;
  onStep: (step: FlowStep) => void;
  schemaReady: boolean;
  extractReady: boolean;
}) {
  const index = FLOW_STEPS.indexOf(step);

  const unlocked = (id: FlowStep) =>
    id === "describe" || (id === "schema" && schemaReady) || (id === "extract" && extractReady);

  return (
    <nav aria-label="Extraction steps" className="shrink-0 border-b border-border bg-background">
      <ol className="flex items-center gap-1 overflow-x-auto px-2 py-1.5 sm:px-3">
        {FLOW_STEPS.map((id, i) => {
          const item = STEP_META[id];
          const current = id === step;
          const done = i < index;
          const locked = !current && !unlocked(id);
          return (
            <li className="flex shrink-0 items-center gap-1" key={id}>
              {i > 0 ? (
                <span
                  aria-hidden
                  className={cn("h-px w-4 shrink-0", done ? "bg-primary/40" : "bg-border")}
                />
              ) : null}
              <button
                aria-current={current ? "step" : undefined}
                className={cn(
                  "flex h-7 items-center gap-1.5 rounded-md px-2 text-sm transition-colors duration-100",
                  current
                    ? "bg-hover font-medium text-foreground"
                    : "text-muted-foreground hover:bg-hover hover:text-foreground",
                  locked && "pointer-events-none opacity-35",
                )}
                disabled={locked}
                onClick={() => unlocked(id) && onStep(id)}
                type="button"
              >
                <span
                  className={cn(
                    "flex size-4 shrink-0 items-center justify-center rounded-full border text-[9px] leading-none",
                    current
                      ? "border-primary bg-primary text-primary-foreground"
                      : done
                        ? "border-primary/40 bg-primary/15 text-primary"
                        : "border-border text-faint",
                  )}
                >
                  {done ? <CheckIcon className="size-2.5" /> : item.n}
                </span>
                {item.label}
              </button>
            </li>
          );
        })}
        <li className="ml-3 hidden min-w-0 items-center gap-3 md:flex">
          <span aria-hidden className="h-3.5 w-px shrink-0 bg-border" />
          <span className="min-w-0 truncate text-faint text-xs">{STEP_META[step].hint}</span>
        </li>
      </ol>
    </nav>
  );
}
