"use client";

import * as React from "react";
import {
  ShoppingCart,
  Server,
  Rocket,
  BookmarkPlus,
  Trash2,
  Loader2,
  PackageOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { PlaybookStepCard } from "@/components/molecules/playbook-step-card";
import { ApplyScopeControl } from "@/components/molecules/apply-scope-control";
import { useActionCart } from "@/stores/action-cart";
import { useUserPlaybooks } from "@/stores/playbooks";
import { ACTION_BY_ID } from "@/mock/reference";
import { runChain, type ChainStepInput } from "@/mock/runner";
import { makeUid } from "@/stores/uid";
import type { ActionScope, EntityRef, Playbook, PlaybookStep } from "@/types";
import { toast } from "sonner";

export interface ActionCartProps {
  /** Render the cart inline (no Sheet wrapper) — used by stories/docs. */
  inline?: boolean;
  /** Controls the trigger label count badge in trigger mode. */
  className?: string;
}

/**
 * ActionCart — the "intent" plane: an assembled remediation chain + its targets.
 *
 * A Sheet bound to the `action-cart` Zustand store. Lists the ordered steps
 * (PlaybookStepCard, reorderable + removable), the target asset set, the default
 * apply-scope (ApplyScopeControl), and the two terminal actions: "Save as
 * playbook" (writes the user-playbooks store) and "Dispatch" (runs the simulated
 * chain runner + toasts the outcome). Empty / one / many / mixed-scope /
 * ready-to-run states all render. "use client".
 */
export function ActionCart({ inline, className }: ActionCartProps) {
  const targets = useActionCart((s) => s.targets);
  const steps = useActionCart((s) => s.steps);
  const defaultScope = useActionCart((s) => s.defaultScope);
  const removeStep = useActionCart((s) => s.removeStep);
  const reorder = useActionCart((s) => s.reorder);
  const setDefaultScope = useActionCart((s) => s.setDefaultScope);
  const clear = useActionCart((s) => s.clear);
  const addPlaybook = useUserPlaybooks((s) => s.addPlaybook);

  const [dispatching, setDispatching] = React.useState(false);

  const mixedScopes =
    new Set([defaultScope, ...steps.map((s) => s.scope)]).size > 1;
  const ready = steps.length > 0;

  function dispatch() {
    if (!ready) return;
    setDispatching(true);
    const resolved: ChainStepInput[] = steps.flatMap((s) => {
      const action = ACTION_BY_ID[s.actionId];
      return action ? [{ action, params: s.params }] : [];
    });
    const refs: EntityRef[] = targets.length
      ? targets.map((id) => ({ kind: "asset" as const, id }))
      : [{ kind: "asset" as const, id: "preview-asset" }];
    window.setTimeout(() => {
      const outcome = runChain(resolved, refs, defaultScope as ActionScope);
      setDispatching(false);
      if (outcome.state === "awaiting-approval") {
        toast.warning("Chain paused for approval", {
          description: outcome.resultSummary,
        });
      } else if (outcome.state === "failed") {
        toast.error("Chain failed", { description: outcome.resultSummary });
      } else {
        toast.success("Chain dispatched", { description: outcome.resultSummary });
        clear();
      }
    }, 700);
  }

  function saveAsPlaybook() {
    if (!ready) return;
    const pbSteps: PlaybookStep[] = steps.map((s) => ({
      actionId: s.actionId,
      params: s.params,
      runIf: "always",
      haltOnFailure: false,
    }));
    const pb: Playbook = {
      id: makeUid("pb"),
      orgId: "org-acme",
      name: `Untitled playbook (${steps.length} step${steps.length === 1 ? "" : "s"})`,
      description: "Saved from the action cart.",
      steps: pbSteps,
      defaultScope,
      createdBy: "u-current",
    };
    addPlaybook(pb);
    toast.success("Saved as playbook", { description: pb.name });
  }

  const body = (
    <div className="flex h-full flex-col">
      {!ready ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-12 text-center">
          <PackageOpen aria-hidden className="size-8 text-faint-foreground" />
          <p className="text-sm font-bold text-card-foreground">Your cart is empty</p>
          <p className="text-xs text-muted-foreground">
            Add a suggested fix or build a chain to assemble a remediation here.
          </p>
        </div>
      ) : (
        <ScrollArea className="flex-1">
          <div className="flex flex-col gap-4 px-1 py-1">
            {/* Targets */}
            <div className="flex flex-col gap-1.5">
              <span className="text-2xs font-bold uppercase tracking-eyebrow text-faint-foreground">
                Targets
              </span>
              {targets.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No targets selected — applies to this asset at dispatch.
                </p>
              ) : (
                <ul className="flex flex-wrap gap-1.5">
                  {targets.map((id) => (
                    <li
                      key={id}
                      className="inline-flex items-center gap-1 rounded-full border border-border bg-subtle px-2 py-0.5 font-mono text-xs text-muted-foreground"
                    >
                      <Server aria-hidden className="size-3 shrink-0" />
                      {id}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Steps */}
            <div className="flex flex-col gap-2">
              <span className="text-2xs font-bold uppercase tracking-eyebrow text-faint-foreground">
                Steps ({steps.length})
              </span>
              {steps.map((s, i) => (
                <PlaybookStepCard
                  key={s.uid}
                  step={{
                    actionId: s.actionId,
                    params: s.params,
                    runIf: "always",
                    haltOnFailure: false,
                  }}
                  index={i}
                  onRemove={() => removeStep(s.uid)}
                  onMoveUp={i > 0 ? () => reorder(i, i - 1) : undefined}
                  onMoveDown={
                    i < steps.length - 1 ? () => reorder(i, i + 1) : undefined
                  }
                />
              ))}
            </div>

            <Separator />

            {/* Default scope */}
            <div className="flex flex-col gap-2">
              <span className="text-2xs font-bold uppercase tracking-eyebrow text-faint-foreground">
                Default apply scope
              </span>
              <ApplyScopeControl
                value={defaultScope}
                onChange={setDefaultScope}
                matchCount={targets.length || undefined}
                disabled={dispatching}
              />
              {mixedScopes && (
                <p className="text-xs text-muted-foreground">
                  Steps override the default scope individually.
                </p>
              )}
            </div>
          </div>
        </ScrollArea>
      )}
    </div>
  );

  const actions = (
    <div className="flex w-full flex-col gap-2">
      <Button
        variant="default"
        disabled={!ready || dispatching}
        onClick={dispatch}
        className="w-full"
      >
        {dispatching ? (
          <Loader2 aria-hidden className="size-4 animate-spin" />
        ) : (
          <Rocket aria-hidden className="size-4" />
        )}
        Dispatch
        {ready && ` ${steps.length} step${steps.length === 1 ? "" : "s"}`}
      </Button>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={!ready || dispatching}
          onClick={saveAsPlaybook}
          className="flex-1"
        >
          <BookmarkPlus aria-hidden className="size-4" />
          Save as playbook
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={!ready || dispatching}
          onClick={clear}
          aria-label="Clear cart"
        >
          <Trash2 aria-hidden className="size-4" />
        </Button>
      </div>
    </div>
  );

  if (inline) {
    return (
      <div
        className={cn(
          "flex max-h-[40rem] w-full max-w-md flex-col gap-3 rounded-lg border border-border bg-card p-4",
          className,
        )}
      >
        <h3 className="flex items-center gap-1.5 text-base font-bold text-card-foreground">
          <ShoppingCart aria-hidden className="size-4 shrink-0 text-primary" />
          Action cart
        </h3>
        {body}
        {actions}
      </div>
    );
  }

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className={className}>
          <ShoppingCart aria-hidden className="size-4" />
          Action cart
          {ready && (
            <span className="ml-0.5 inline-flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-2xs font-bold leading-none text-primary-foreground">
              {steps.length}
            </span>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent className="flex w-full flex-col gap-4 sm:max-w-md">
        <SheetHeader className="gap-1">
          <SheetTitle className="flex items-center gap-1.5">
            <ShoppingCart aria-hidden className="size-4 shrink-0 text-primary" />
            Action cart
          </SheetTitle>
          <SheetDescription>
            The remediation chain you are assembling — dispatch it once, or save it
            as a reusable playbook.
          </SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-hidden px-4">{body}</div>
        <SheetFooter>{actions}</SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
