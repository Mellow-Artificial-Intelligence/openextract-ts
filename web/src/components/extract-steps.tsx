"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";

export const FLOW_STEPS = ["describe", "schema", "extract"] as const;
export type FlowStep = (typeof FLOW_STEPS)[number];

export const STEP_META: Record<FlowStep, { n: number; label: string; hint: string }> = {
  describe: { n: 1, label: "Describe", hint: "What should the table contain?" },
  schema: { n: 2, label: "Schema", hint: "Edit columns, then continue." },
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
  const meta = STEP_META[step];
  const canPrev = index > 0;
  const canNext =
    (step === "describe" && schemaReady) || (step === "schema" && extractReady);

  const go = (next: FlowStep) => {
    if (next === "describe") onStep(next);
    if (next === "schema" && schemaReady) onStep(next);
    if (next === "extract" && extractReady) onStep(next);
  };

  return (
    <nav aria-label="Extraction steps" className="shrink-0 border-b border-black/5">
      <div className="flex items-center gap-2 px-3 py-2 sm:hidden">
        <Button
          aria-label="Previous step"
          disabled={!canPrev}
          onClick={() => go(FLOW_STEPS[index - 1]!)}
          size="icon"
          type="button"
          variant="outline"
        >
          <ChevronLeftIcon />
        </Button>
        <div className="min-w-0 flex-1 text-center">
          <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
            Step {meta.n} of {FLOW_STEPS.length}
          </p>
          <p className="truncate font-medium text-sm">{meta.label}</p>
        </div>
        <Button
          aria-label="Next step"
          disabled={!canNext}
          onClick={() => go(FLOW_STEPS[index + 1]!)}
          size="icon"
          type="button"
          variant="outline"
        >
          <ChevronRightIcon />
        </Button>
      </div>

      <ol className="hidden grid-cols-3 sm:grid">
        {FLOW_STEPS.map((id, i) => {
          const item = STEP_META[id];
          const current = id === step;
          const locked =
            !current &&
            ((id === "schema" && !schemaReady) || (id === "extract" && !extractReady));
          return (
            <li className="border-black/5 not-last:border-r" key={id}>
              <button
                className={cn(
                  "flex w-full items-center gap-2 px-4 py-2.5 text-left transition-colors",
                  current ? "bg-muted/60" : "hover:bg-muted/40",
                  locked && "pointer-events-none opacity-40",
                )}
                disabled={locked}
                onClick={() => go(id)}
                type="button"
              >
                <span
                  className={cn(
                    "flex size-5 shrink-0 items-center justify-center font-mono text-[10px]",
                    current ? "bg-foreground text-background" : "border border-black/15 text-muted-foreground",
                  )}
                >
                  {item.n}
                </span>
                <span className="min-w-0">
                  <span className="block font-medium text-sm">{item.label}</span>
                  <span className="hidden truncate text-muted-foreground text-xs md:block">
                    {item.hint}
                  </span>
                </span>
                {i < FLOW_STEPS.length - 1 ? <span className="sr-only">then</span> : null}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
