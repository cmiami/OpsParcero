"use client";

import * as React from "react";
import {
  Power,
  PowerOff,
  AlertTriangle,
  Users,
  Workflow,
  ShieldCheck,
  Eye,
  Clock,
  Save,
  Send,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { getPlaybooks, getAssets, getOrg } from "@/mock/query";
import { relativeTime } from "@/lib/format";
import { usePolicies } from "@/stores/automation-policies";
import { recordPolicyCreated, recordPolicyToggled } from "@/lib/activity-record";
import { makeUid } from "@/stores/uid";
import type { AutomationPolicy, AutomationPolicyId } from "@/types";
import { toast } from "sonner";

export interface AutomationPolicyEditorProps {
  /** Policy to edit; omit to author a new one. */
  policy?: AutomationPolicy;
  /** Override the live match count (defaults to a deterministic mock query). */
  matchCount?: number;
  className?: string;
}

type TriggerKind = "consecutive-failures" | "event-type" | "cron";

/**
 * AutomationPolicyEditor — the top of the fix-once-then-forever ladder (docs/09 §11).
 *
 * Configures a standing auto-remediation policy: a trigger (consecutive-failures
 * / event-type / cron via RadioGroup), a dynamic match filter with a live
 * preview count, a bound playbook (pins a version), gating switches
 * (requiresApproval / dryRunFirst / suppression window), and a stats +
 * kill-switch rail. The "always-forward" nature is surfaced with an explicit
 * warning since publishing is always approval-gated. New / Editing /
 * AlwaysForwardWarning / Disabled states all render. "use client".
 */
export function AutomationPolicyEditor({
  policy,
  matchCount,
  className,
}: AutomationPolicyEditorProps) {
  const playbooks = React.useMemo(() => getPlaybooks(), []);
  const liveCount = matchCount ?? getAssets().total;

  const [name, setName] = React.useState(policy?.name ?? "");
  const [trigger, setTrigger] = React.useState<TriggerKind>("consecutive-failures");
  const [failureCount, setFailureCount] = React.useState(5);
  const [boundPlaybookId, setBoundPlaybookId] = React.useState(
    policy?.action.refId ?? playbooks[0]?.id ?? "",
  );
  const [requiresApproval, setRequiresApproval] = React.useState(
    policy ? policy.approvalRule !== "never" : true,
  );
  const [dryRunFirst, setDryRunFirst] = React.useState(policy?.dryRunFirst ?? true);
  const [suppressHours, setSuppressHours] = React.useState(24);
  const [enabled, setEnabled] = React.useState(policy?.enabled ?? false);

  const stats = policy?.stats ?? { triggered: 0, succeeded: 0 };

  function save(publish: boolean) {
    if (publish) {
      // Persist a real (PAUSED) policy + audit the creation, instead of a bare
      // toast (#5). Paused because publishing standing automation is approval-
      // gated — it does not arm itself.
      const policy: AutomationPolicy = {
        id: makeUid("pol") as AutomationPolicyId,
        orgId: getOrg().id,
        name: name.trim() || "Untitled policy",
        // The editor authors a custom rule (consecutive-failures / event / cron);
        // model it as a category-scoped trigger so the standing policy is concrete.
        trigger: { kind: "category", category: "Custom rule" },
        appliesTo: {},
        action: { kind: "playbook", refId: boundPlaybookId, params: {} },
        approvalRule: requiresApproval ? "always" : "never",
        enabled: false,
        dryRunFirst,
        stats: { triggered: 0, succeeded: 0 },
      };
      usePolicies.getState().addPolicy(policy);
      recordPolicyCreated({ policyId: policy.id, policyName: policy.name });
      toast.warning("Policy published (paused, pending approval)", {
        description: `"${policy.name}" was created and recorded in Audit — enable it in Policies once an approver signs off.`,
      });
    } else {
      toast.success("Draft saved", {
        description: name.trim() || "Untitled policy",
      });
    }
  }

  return (
    <section
      aria-label="Automation policy editor"
      className={cn(
        "grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]",
        className,
      )}
    >
      {/* Editor column */}
      <div className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="policy-name" className="text-sm font-bold">
            Policy name
          </Label>
          <Input
            id="policy-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Auto Diff-Merge after 5 Screenshot Failures"
          />
        </div>

        <Separator />

        {/* Trigger */}
        <fieldset className="flex flex-col gap-2">
          <legend className="text-2xs font-bold uppercase tracking-eyebrow text-faint-foreground">
            Trigger
          </legend>
          <RadioGroup
            value={trigger}
            onValueChange={(v) => setTrigger(v as TriggerKind)}
            className="gap-2"
          >
            <div className="flex items-center gap-2">
              <RadioGroupItem id="trig-consec" value="consecutive-failures" />
              <Label htmlFor="trig-consec" className="text-sm">
                Consecutive failures
              </Label>
              {trigger === "consecutive-failures" && (
                <Input
                  type="number"
                  min={1}
                  max={20}
                  value={failureCount}
                  onChange={(e) => setFailureCount(Number(e.target.value))}
                  aria-label="Consecutive failure count"
                  className="ml-2 h-7 w-16"
                />
              )}
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem id="trig-event" value="event-type" />
              <Label htmlFor="trig-event" className="text-sm">
                Event type
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem id="trig-cron" value="cron" />
              <Label htmlFor="trig-cron" className="text-sm">
                Cron schedule
              </Label>
            </div>
          </RadioGroup>
        </fieldset>

        <Separator />

        {/* Match filter + live count */}
        <div className="flex flex-col gap-2">
          <span className="text-2xs font-bold uppercase tracking-eyebrow text-faint-foreground">
            Match filter (dynamic)
          </span>
          <p className="text-xs text-muted-foreground">
            product = BCDR · category = Screenshot · status = warning, failed
          </p>
          <div
            aria-live="polite"
            className="inline-flex items-center gap-1.5 self-start rounded-md bg-primary-tint px-2.5 py-1 text-xs font-bold text-primary-accent"
          >
            <Users aria-hidden className="size-3.5 shrink-0" />
            {liveCount} assets match · membership re-evaluated on each fire
          </div>
        </div>

        <Separator />

        {/* Bound playbook */}
        <div className="flex flex-col gap-2">
          <Label htmlFor="bound-playbook" className="text-sm font-bold">
            <span className="inline-flex items-center gap-1.5">
              <Workflow aria-hidden className="size-3.5 shrink-0 text-primary" />
              Bound playbook (pins a version)
            </span>
          </Label>
          <Select value={boundPlaybookId} onValueChange={setBoundPlaybookId}>
            <SelectTrigger id="bound-playbook">
              <SelectValue placeholder="Choose a playbook" />
            </SelectTrigger>
            <SelectContent>
              {playbooks.map((pb) => (
                <SelectItem key={pb.id} value={pb.id}>
                  {pb.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Separator />

        {/* Gating */}
        <div className="flex flex-col gap-3">
          <span className="text-2xs font-bold uppercase tracking-eyebrow text-faint-foreground">
            Gating
          </span>
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="gate-approval" className="flex items-center gap-1.5 text-sm">
              <ShieldCheck aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
              Require approval per fire
            </Label>
            <Switch
              id="gate-approval"
              checked={requiresApproval}
              onCheckedChange={setRequiresApproval}
            />
          </div>
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="gate-dryrun" className="flex items-center gap-1.5 text-sm">
              <Eye aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
              Observe-only (dry-run first)
            </Label>
            <Switch
              id="gate-dryrun"
              checked={dryRunFirst}
              onCheckedChange={setDryRunFirst}
            />
          </div>
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="gate-suppress" className="flex items-center gap-1.5 text-sm">
              <Clock aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
              Suppress within (hours)
            </Label>
            <Input
              id="gate-suppress"
              type="number"
              min={1}
              max={168}
              value={suppressHours}
              onChange={(e) => setSuppressHours(Number(e.target.value))}
              className="h-7 w-20"
            />
          </div>
        </div>

        {/* Always-forward warning */}
        <div className="flex items-start gap-2 rounded-md bg-warning-tint p-3">
          <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0 text-warning" />
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-bold text-warning">
              Standing policy — open-ended blast radius
            </span>
            <span className="text-xs text-muted-foreground">
              Publishing always requires approval. New assets matching the filter
              inherit this policy automatically.
            </span>
          </div>
        </div>

        {/* Save / publish */}
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => save(false)}>
            <Save aria-hidden className="size-4" />
            Save draft
          </Button>
          <Button variant="default" size="sm" onClick={() => save(true)}>
            <Send aria-hidden className="size-4" />
            Publish — requires approval
          </Button>
        </div>
      </div>

      {/* Stats + kill-switch rail */}
      <aside className="flex h-fit flex-col gap-4 rounded-lg border border-border bg-card p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="text-2xs font-bold uppercase tracking-eyebrow text-faint-foreground">
            Stats & kill-switch
          </span>
          <span
            role="status"
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-bold",
              enabled
                ? "bg-success-tint text-success"
                : "bg-muted text-muted-foreground",
            )}
          >
            {enabled ? (
              <Power aria-hidden className="size-3 shrink-0" />
            ) : (
              <PowerOff aria-hidden className="size-3 shrink-0" />
            )}
            {enabled ? "Enabled" : "Paused"}
          </span>
        </div>

        <dl className="grid grid-cols-2 gap-3">
          <div className="flex flex-col">
            <dt className="text-xs text-muted-foreground">Triggered</dt>
            <dd className="text-lg font-bold text-card-foreground tabular-nums">
              {stats.triggered}
            </dd>
          </div>
          <div className="flex flex-col">
            <dt className="text-xs text-muted-foreground">Succeeded</dt>
            <dd className="text-lg font-bold text-success tabular-nums">
              {stats.succeeded}
            </dd>
          </div>
        </dl>

        {stats.lastFiredAt && (
          <p className="text-xs text-muted-foreground">
            Last fired {relativeTime(stats.lastFiredAt)}
          </p>
        )}

        <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-surface p-3">
          <Label htmlFor="kill-switch" className="flex items-center gap-1.5 text-sm font-bold">
            {enabled ? (
              <Power aria-hidden className="size-3.5 shrink-0 text-success" />
            ) : (
              <PowerOff aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
            )}
            Kill-switch
          </Label>
          <Switch
            id="kill-switch"
            checked={enabled}
            onCheckedChange={(v) => {
              setEnabled(v);
              // Persist to the store + audit the flip (#16) — a kill-switch that
              // only set local state reverted on remount, never reached the
              // Policies grid badge, and left no trail. Only for a saved policy;
              // a draft's switch is just the initial-state control.
              if (policy?.id) {
                usePolicies.getState().togglePolicy(policy.id, v);
                recordPolicyToggled({
                  policyId: policy.id,
                  policyName: policy.name,
                  enabled: v,
                });
              }
              toast(v ? "Policy enabled" : "Policy paused", {
                description: v
                  ? "Will fire on matching events going forward."
                  : "Firing stopped; config and history retained.",
              });
            }}
          />
        </div>
      </aside>
    </section>
  );
}
