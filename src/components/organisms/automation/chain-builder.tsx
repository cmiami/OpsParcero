"use client";

import * as React from "react";
import { Plus, BookmarkPlus, Workflow, ListPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import { PlaybookStepCard } from "@/components/molecules/playbook-step-card";
import { ApplyScopeControl } from "@/components/molecules/apply-scope-control";
import { ACTION_CATALOG, ACTION_BY_ID } from "@/mock/reference";
import { useUserPlaybooks } from "@/stores/playbooks";
import { makeUid } from "@/stores/uid";
import type { ActionScope, Playbook, PlaybookStep } from "@/types";
import { toast } from "sonner";

export interface ChainBuilderProps {
  /** Initial ordered steps (controlled-from-props seed). */
  steps?: PlaybookStep[];
  /** Default apply scope for the chain. */
  defaultScope?: ActionScope;
  /** Fired with the saved playbook when "Save as playbook" is clicked. */
  onSave?: (playbook: Playbook) => void;
  className?: string;
}

/** Group the catalog by action category for the two-bucket step picker. */
const ACTION_GROUPS = (() => {
  const remediation = ACTION_CATALOG.filter((a) => a.outcome === "self-heal");
  const diagnostic = ACTION_CATALOG.filter((a) => a.outcome === "guidance-only");
  const notification = ACTION_CATALOG.filter((a) => a.outcome === "opens-ticket");
  return { remediation, diagnostic, notification };
})();

/**
 * ChainBuilder — assemble an ordered remediation chain into a saved playbook.
 *
 * An ordered PlaybookStepCard list with up/down reorder (no drag-and-drop dep —
 * keyboard-operable buttons), an "Add step" picker (a Command palette over the
 * grouped ACTION_CATALOG), a default-scope control, and "Save as playbook" which
 * writes the user-playbooks store and toasts. Empty / single / multi /
 * with-approval-gate states all render. "use client".
 */
export function ChainBuilder({
  steps: stepsProp,
  defaultScope: defaultScopeProp = "once",
  onSave,
  className,
}: ChainBuilderProps) {
  const [steps, setSteps] = React.useState<PlaybookStep[]>(stepsProp ?? []);
  const [scope, setScope] = React.useState<ActionScope>(defaultScopeProp);
  const [name, setName] = React.useState("");
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const addPlaybook = useUserPlaybooks((s) => s.addPlaybook);

  function addStep(actionId: string) {
    setSteps((prev) => [
      ...prev,
      { actionId, params: {}, runIf: "always", haltOnFailure: false },
    ]);
    setPickerOpen(false);
  }

  function removeStep(i: number) {
    setSteps((prev) => prev.filter((_, idx) => idx !== i));
  }

  function move(from: number, to: number) {
    setSteps((prev) => {
      if (to < 0 || to >= prev.length) return prev;
      const next = prev.slice();
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }

  function save() {
    if (steps.length === 0) return;
    const pb: Playbook = {
      id: makeUid("pb"),
      orgId: "org-acme",
      name: name.trim() || `Untitled playbook (${steps.length} steps)`,
      description: "Built in the chain builder.",
      steps,
      defaultScope: scope,
      createdBy: "u-current",
    };
    addPlaybook(pb);
    onSave?.(pb);
    toast.success("Saved as playbook", { description: pb.name });
  }

  return (
    <section
      aria-label="Chain builder"
      className={cn(
        "flex w-full max-w-xl flex-col gap-4 rounded-lg border border-border bg-card p-4",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-1.5 text-base font-bold text-card-foreground">
          <Workflow aria-hidden className="size-4 shrink-0 text-primary" />
          Chain builder
        </h3>
        <span className="text-xs text-muted-foreground tabular-nums">
          {steps.length} step{steps.length === 1 ? "" : "s"}
        </span>
      </div>

      {/* Steps */}
      {steps.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border bg-surface px-6 py-10 text-center">
          <ListPlus aria-hidden className="size-7 text-faint-foreground" />
          <p className="text-sm font-bold text-card-foreground">No steps yet</p>
          <p className="text-xs text-muted-foreground">
            Add a diagnostic, remediation, or notification action to begin the chain.
          </p>
        </div>
      ) : (
        <ol className="flex flex-col gap-2">
          {steps.map((step, i) => (
            <li key={`${step.actionId}-${i}`}>
              <PlaybookStepCard
                step={step}
                index={i}
                actionLabel={ACTION_BY_ID[step.actionId]?.label}
                onRemove={() => removeStep(i)}
                onMoveUp={i > 0 ? () => move(i, i - 1) : undefined}
                onMoveDown={i < steps.length - 1 ? () => move(i, i + 1) : undefined}
              />
            </li>
          ))}
        </ol>
      )}

      {/* Add step */}
      <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="self-start">
            <Plus aria-hidden className="size-4" />
            Add step
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-0" align="start">
          <Command>
            <CommandInput placeholder="Search actions…" />
            <CommandList>
              <CommandEmpty>No actions match.</CommandEmpty>
              <CommandGroup heading="Remediation">
                {ACTION_GROUPS.remediation.slice(0, 12).map((a) => (
                  <CommandItem
                    key={a.id}
                    value={`${a.label} ${a.id}`}
                    onSelect={() => addStep(a.id)}
                  >
                    {a.label}
                  </CommandItem>
                ))}
              </CommandGroup>
              <CommandGroup heading="Diagnostic">
                {ACTION_GROUPS.diagnostic.slice(0, 12).map((a) => (
                  <CommandItem
                    key={a.id}
                    value={`${a.label} ${a.id}`}
                    onSelect={() => addStep(a.id)}
                  >
                    {a.label}
                  </CommandItem>
                ))}
              </CommandGroup>
              <CommandGroup heading="Notification">
                {ACTION_GROUPS.notification.slice(0, 8).map((a) => (
                  <CommandItem
                    key={a.id}
                    value={`${a.label} ${a.id}`}
                    onSelect={() => addStep(a.id)}
                  >
                    {a.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      <Separator />

      {/* Scope + save */}
      <div className="flex flex-col gap-2">
        <span className="text-2xs font-bold uppercase tracking-eyebrow text-faint-foreground">
          Default apply scope
        </span>
        <ApplyScopeControl value={scope} onChange={setScope} />
      </div>

      <div className="flex flex-col gap-2">
        <label
          htmlFor="chain-name"
          className="text-2xs font-bold uppercase tracking-eyebrow text-faint-foreground"
        >
          Playbook name
        </label>
        <Input
          id="chain-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. VSS Reset + Retry"
        />
        <Button
          variant="default"
          disabled={steps.length === 0}
          onClick={save}
          className="self-start"
        >
          <BookmarkPlus aria-hidden className="size-4" />
          Save as playbook
        </Button>
      </div>
    </section>
  );
}
