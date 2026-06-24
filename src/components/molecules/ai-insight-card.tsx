import { Sparkles, Search, Lightbulb } from "lucide-react";
import { cn } from "@/lib/utils";
import { AiBadge } from "@/components/atoms/ai-badge";
import type { AiInsight } from "@/types";

export interface AiInsightCardProps {
  /** The AI-generated insight (root cause + recommendation + confidence). */
  insight: AiInsight;
  className?: string;
}

/**
 * AiInsightCard — the purple AI-assist surface attached to an Issue.
 *
 * The ONLY place purple (`ai*` tokens) appears in a molecule (M4). Surfaces the
 * AI's root-cause analysis, recommendation, and confidence. Labeled "AI insight"
 * with the Sparkles marker so the AI provenance is explicit. Confidence is shown
 * as a percentage with text, not color-coded.
 */
export function AiInsightCard({ insight, className }: AiInsightCardProps) {
  return (
    <section
      aria-label="AI insight"
      className={cn(
        "flex flex-col gap-3 rounded-lg border border-ai-accent bg-ai-tint p-4",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-sm font-bold text-ai">
          <Sparkles aria-hidden className="size-4 shrink-0" />
          AI insight
        </span>
        <AiBadge>{insight.confidencePct}% confidence</AiBadge>
      </div>

      <dl className="flex flex-col gap-3">
        <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5">
          <Search
            aria-hidden
            className="row-span-2 mt-0.5 size-3.5 shrink-0 text-ai"
          />
          <dt className="text-2xs font-bold uppercase tracking-eyebrow text-ai">
            Root cause
          </dt>
          <dd className="min-w-0 text-sm text-card-foreground">
            {insight.rootCause}
          </dd>
        </div>

        <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5">
          <Lightbulb
            aria-hidden
            className="row-span-2 mt-0.5 size-3.5 shrink-0 text-ai"
          />
          <dt className="text-2xs font-bold uppercase tracking-eyebrow text-ai">
            Recommendation
          </dt>
          <dd className="min-w-0 text-sm text-card-foreground">
            {insight.recommendation}
          </dd>
        </div>
      </dl>

      {insight.classificationRationale && (
        <p className="text-xs italic text-muted-foreground">
          {insight.classificationRationale}
        </p>
      )}
    </section>
  );
}
