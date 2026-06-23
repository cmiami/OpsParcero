"use client";

import * as React from "react";
import {
  Cpu,
  HardDriveDownload,
  Check,
  CircleSlash,
  Gauge,
  CircleDollarSign,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ModelInfo, FixModelRef } from "@/lib/fix-client";

export interface ModelPickerProps {
  /** Models offered (from `client.listModels()`; Sim returns just Mock). */
  models: ModelInfo[];
  /** Currently-selected planning/execution model. */
  value: FixModelRef;
  /** Fired when the planning/execution model changes. */
  onChange: (model: FixModelRef) => void;
  /** Optional cheaper/local model for triage + verify (the split). */
  triageValue?: FixModelRef;
  /** Enabling this prop renders the optional triage-vs-planning split picker. */
  onTriageChange?: (model: FixModelRef) => void;
  /**
   * Model ids that are currently unavailable (e.g. a real provider missing its
   * key). They render disabled with an "unavailable" affordance — never silently
   * dropped, so the technician understands why they can't pick them.
   */
  unavailableIds?: string[];
  /** Disable the whole control (e.g. while a run is executing). */
  disabled?: boolean;
  className?: string;
}

const keyOf = (m: FixModelRef) => `${m.provider}:${m.model}`;
const refOf = (m: ModelInfo): FixModelRef => ({
  provider: m.provider,
  model: m.id,
});

function formatContext(tokens: number): string {
  if (tokens >= 1000) return `${Math.round(tokens / 1000)}K ctx`;
  return `${tokens} ctx`;
}

function formatCost(m: ModelInfo): string | null {
  if (m.local) return "Free · runs locally";
  if (m.costPer1kIn == null && m.costPer1kOut == null) return null;
  const parts: string[] = [];
  if (m.costPer1kIn != null) parts.push(`$${m.costPer1kIn.toFixed(3)}/1K in`);
  if (m.costPer1kOut != null)
    parts.push(`$${m.costPer1kOut.toFixed(3)}/1K out`);
  return parts.join(" · ");
}

/** A single option row — label, badges (local/free), context window, cost. */
function ModelOptionRow({
  model,
  unavailable,
}: {
  model: ModelInfo;
  unavailable: boolean;
}) {
  const cost = formatCost(model);
  return (
    <span className="flex min-w-0 flex-col gap-0.5 py-0.5">
      <span className="flex items-center gap-1.5">
        <span className="truncate text-sm font-bold text-foreground">
          {model.label}
        </span>
        {model.local && (
          <span className="inline-flex items-center gap-1 rounded-full bg-success-tint px-1.5 py-0.5 text-[10px] font-bold leading-none text-success">
            <HardDriveDownload aria-hidden className="size-2.5 shrink-0" />
            Local
          </span>
        )}
        {unavailable && (
          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-bold leading-none text-muted-foreground">
            <CircleSlash aria-hidden className="size-2.5 shrink-0" />
            Unavailable
          </span>
        )}
      </span>
      <span className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <Gauge aria-hidden className="size-3 shrink-0" />
          {formatContext(model.contextWindow)}
        </span>
        {cost && (
          <span className="inline-flex items-center gap-1">
            <CircleDollarSign aria-hidden className="size-3 shrink-0" />
            {cost}
          </span>
        )}
      </span>
    </span>
  );
}

function SingleModelSelect({
  id,
  label,
  Icon,
  models,
  value,
  onChange,
  unavailable,
  disabled,
}: {
  id: string;
  label: string;
  Icon: typeof Cpu;
  models: ModelInfo[];
  value: FixModelRef;
  onChange: (m: FixModelRef) => void;
  unavailable: Set<string>;
  disabled?: boolean;
}) {
  const byKey = React.useMemo(() => {
    const map = new Map<string, ModelInfo>();
    for (const m of models) map.set(keyOf(refOf(m)), m);
    return map;
  }, [models]);

  const selected = byKey.get(keyOf(value));

  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={id}
        className="flex items-center gap-1.5 text-xs font-bold text-foreground"
      >
        <Icon aria-hidden className="size-3.5 shrink-0 text-primary" />
        {label}
      </label>
      <Select
        value={selected ? keyOf(refOf(selected)) : undefined}
        onValueChange={(k) => {
          const m = byKey.get(k);
          if (m) onChange(refOf(m));
        }}
        disabled={disabled}
      >
        <SelectTrigger id={id} className="h-auto min-h-9 py-1.5">
          <SelectValue placeholder="Choose a model">
            {selected ? (
              <span className="flex items-center gap-1.5">
                <span className="truncate text-sm font-bold text-foreground">
                  {selected.label}
                </span>
                {selected.local && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-success-tint px-1.5 py-0.5 text-[10px] font-bold leading-none text-success">
                    <HardDriveDownload aria-hidden className="size-2.5" />
                    Local
                  </span>
                )}
              </span>
            ) : null}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectLabel>Available models</SelectLabel>
            {models.map((m) => {
              const k = keyOf(refOf(m));
              const isUnavailable = unavailable.has(m.id);
              return (
                <SelectItem
                  key={k}
                  value={k}
                  disabled={isUnavailable}
                  className="py-1"
                >
                  <ModelOptionRow model={m} unavailable={isUnavailable} />
                </SelectItem>
              );
            })}
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  );
}

/**
 * ModelPicker — choose the provider + model that drives a fix run.
 *
 * Shows each model's label, context window, cost, and a "Local"/"Free" badge;
 * unavailable models render disabled with an explicit affordance rather than
 * vanishing (M5 — never color-only, always icon + text). The Mock model is
 * always offered (the offline default). When `onTriageChange` is supplied it
 * renders the optional triage-vs-planning split, letting a cheaper/local model
 * handle triage + verification while a stronger model plans the remediation.
 *
 * Blue/primary register only — this control appears on both the Guided (blue)
 * and AI (purple) surfaces, so it stays neutral and never asserts purple itself.
 */
export function ModelPicker({
  models,
  value,
  onChange,
  triageValue,
  onTriageChange,
  unavailableIds,
  disabled,
  className,
}: ModelPickerProps) {
  const unavailable = React.useMemo(
    () => new Set(unavailableIds ?? []),
    [unavailableIds],
  );
  const split = !!onTriageChange;

  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-md border border-border bg-surface p-3",
        className,
      )}
    >
      <SingleModelSelect
        id="model-picker-planning"
        label={split ? "Planning + execution model" : "Model"}
        Icon={Cpu}
        models={models}
        value={value}
        onChange={onChange}
        unavailable={unavailable}
        disabled={disabled}
      />
      {split && triageValue && (
        <SingleModelSelect
          id="model-picker-triage"
          label="Triage + verification model"
          Icon={Check}
          models={models}
          value={triageValue}
          onChange={onTriageChange}
          unavailable={unavailable}
          disabled={disabled}
        />
      )}
      {split && (
        <p className="text-[11px] text-muted-foreground">
          A cheaper or local model can triage and verify while a stronger model
          plans the remediation.
        </p>
      )}
    </div>
  );
}
