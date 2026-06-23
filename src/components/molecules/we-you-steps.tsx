import { CheckCircle2, UserCog, ArrowRight, Bot, Hand } from "lucide-react";
import { cn } from "@/lib/utils";
import { ACTION_BY_ID } from "@/mock/reference";
import type { RunbookStep } from "@/types";

export interface WeYouStepsProps {
  /** Automated steps the Resolution Center performs ("We'll handle"). */
  weSteps: RunbookStep[];
  /** Manual steps requiring the technician ("You'll need to"). */
  youSteps: RunbookStep[];
  className?: string;
}

function StepList({
  steps,
  variant,
}: {
  steps: RunbookStep[];
  variant: "we" | "you";
}) {
  const isWe = variant === "we";
  const StepIcon = isWe ? CheckCircle2 : UserCog;
  const accent = isWe ? "text-fix-guided" : "text-fix-insights";
  const heading = isWe ? "We'll handle" : "You'll need to";
  const HeadingIcon = isWe ? Bot : Hand;
  const bg = isWe ? "bg-fix-guided-tint" : "bg-fix-insights-tint";

  return (
    <div className={cn("flex flex-col gap-2.5 rounded-md p-3", bg)}>
      <h4 className={cn("flex items-center gap-1.5 text-sm font-bold", accent)}>
        <HeadingIcon aria-hidden className="size-4 shrink-0" />
        {heading}
      </h4>
      <ol className="flex flex-col gap-2">
        {steps.map((step, i) => {
          const action = step.actionId ? ACTION_BY_ID[step.actionId] : undefined;
          return (
            <li key={i} className="flex items-start gap-2 text-sm">
              <StepIcon
                aria-hidden
                className={cn("mt-0.5 size-3.5 shrink-0", accent)}
              />
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="text-card-foreground">{step.text}</span>
                {action && (
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 text-xs font-bold",
                      accent,
                    )}
                  >
                    {action.label}
                    <ArrowRight aria-hidden className="size-3 shrink-0" />
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/**
 * WeYouSteps — the explicit human-in-the-loop boundary in an Issue runbook.
 *
 * Splits the runbook into "We'll handle" (automated, fix-guided/blue,
 * CheckCircle2) and "You'll need to" (manual, fix-insights/orange, UserCog).
 * An End-to-end fix shows We-only; an Insights-only issue shows You-only; a
 * Guided fix shows both. Each side reads by icon + heading + text, not color
 * alone (M5).
 */
export function WeYouSteps({ weSteps, youSteps, className }: WeYouStepsProps) {
  const hasWe = weSteps.length > 0;
  const hasYou = youSteps.length > 0;

  return (
    <div
      className={cn(
        "grid gap-3",
        hasWe && hasYou ? "sm:grid-cols-2" : "grid-cols-1",
        className,
      )}
    >
      {hasWe && <StepList steps={weSteps} variant="we" />}
      {hasYou && <StepList steps={youSteps} variant="you" />}
    </div>
  );
}
