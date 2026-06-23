import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import {
  ShieldCheck,
  AlertTriangle,
  XCircle,
  PauseCircle,
  RefreshCw,
  CloudOff,
  CheckCircle2,
  Wrench,
  Lightbulb,
  HelpCircle,
  type LucideIcon,
} from "lucide-react";

/**
 * Foundations / Status System — the canonical health and fix-classification
 * reference. Status is NEVER color-only (M5): every state renders as a colored
 * dot + lucide icon + text label. The fleet-rollup row resolves a mixed set of
 * children to its worst real state, the way a fleet summary cell does in the app.
 */

type State =
  | "protected"
  | "warning"
  | "failed"
  | "paused"
  | "syncing"
  | "offline";

type StateMeta = {
  label: string;
  icon: LucideIcon;
  dotClass: string;
  tintClass: string;
  textClass: string;
  order: number; // worst-first rank (failed = lowest)
  spin?: boolean;
};

const STATUS: Record<State, StateMeta> = {
  failed: {
    label: "Failed",
    icon: XCircle,
    dotClass: "bg-status-failed",
    tintClass: "bg-status-failed-tint",
    textClass: "text-status-failed",
    order: 1,
  },
  warning: {
    label: "Warning",
    icon: AlertTriangle,
    dotClass: "bg-status-warning",
    tintClass: "bg-status-warning-tint",
    textClass: "text-status-warning",
    order: 2,
  },
  offline: {
    label: "Offline",
    icon: CloudOff,
    dotClass: "bg-status-offline",
    tintClass: "bg-status-offline-tint",
    textClass: "text-status-offline",
    order: 3,
  },
  syncing: {
    label: "Syncing",
    icon: RefreshCw,
    dotClass: "bg-status-syncing",
    tintClass: "bg-status-syncing-tint",
    textClass: "text-status-syncing",
    order: 4,
    spin: true,
  },
  paused: {
    label: "Paused",
    icon: PauseCircle,
    dotClass: "bg-status-paused",
    tintClass: "bg-status-paused-tint",
    textClass: "text-status-paused",
    order: 5,
  },
  protected: {
    label: "Protected",
    icon: ShieldCheck,
    dotClass: "bg-status-protected",
    tintClass: "bg-status-protected-tint",
    textClass: "text-status-protected",
    order: 6,
  },
};

const STATE_ORDER: State[] = [
  "protected",
  "warning",
  "failed",
  "paused",
  "syncing",
  "offline",
];

// Worst real child state wins (lowest order number).
function rollup(children: State[]): State {
  return children.reduce((worst, s) =>
    STATUS[s].order < STATUS[worst].order ? s : worst,
  );
}

function StatusChip({ state }: { state: State }) {
  const meta = STATUS[state];
  const Icon = meta.icon;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 ${meta.tintClass}`}
      aria-label={meta.label}
    >
      <span className={`size-2 shrink-0 rounded-full ${meta.dotClass}`} aria-hidden="true" />
      <Icon
        className={`size-3.5 shrink-0 ${meta.textClass} ${meta.spin ? "animate-spin" : ""}`}
        aria-hidden="true"
      />
      <span className={`text-xs font-medium ${meta.textClass}`}>{meta.label}</span>
    </span>
  );
}

// --- Fix classification (per BUILD-CONTRACT §4) ---

type FixKey = "full" | "partial" | "insights" | "unknown";
type FixMeta = {
  label: string;
  icon: LucideIcon;
  textClass: string;
  tintClass: string;
};

const FIX: Record<FixKey, FixMeta> = {
  full: {
    label: "End-to-end fix",
    icon: CheckCircle2,
    textClass: "text-fix-endtoend",
    tintClass: "bg-fix-endtoend-tint",
  },
  partial: {
    label: "Guided fix",
    icon: Wrench,
    textClass: "text-fix-guided",
    tintClass: "bg-fix-guided-tint",
  },
  insights: {
    label: "Insights only",
    icon: Lightbulb,
    textClass: "text-fix-insights",
    tintClass: "bg-fix-insights-tint",
  },
  unknown: {
    label: "Unknown",
    icon: HelpCircle,
    textClass: "text-fix-unknown",
    tintClass: "bg-fix-unknown-tint",
  },
};

const FIX_ORDER: FixKey[] = ["full", "partial", "insights", "unknown"];

function FixChip({ fix }: { fix: FixKey }) {
  const meta = FIX[fix];
  const Icon = meta.icon;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 ${meta.tintClass}`}
    >
      <Icon className={`size-3.5 shrink-0 ${meta.textClass}`} aria-hidden="true" />
      <span className={`text-xs font-medium ${meta.textClass}`}>{meta.label}</span>
    </span>
  );
}

// Deterministic fleet sample (no random; M6).
const FLEET: { host: string; state: State }[] = [
  { host: "btru-fs1", state: "protected" },
  { host: "btru-erp1", state: "protected" },
  { host: "btru-hv2022", state: "warning" },
  { host: "btru-dr-ubt", state: "failed" },
  { host: "NOR-FIPS-APP", state: "syncing" },
];

function StatusSystem() {
  const rolled = rollup(FLEET.map((f) => f.state));
  return (
    <div className="flex flex-col gap-8 p-4">
      <section className="flex flex-col gap-3">
        <h3 className="text-[10px] font-bold uppercase tracking-[0.07em] text-faint-foreground">
          Asset health states (dot + icon + label — never color-only)
        </h3>
        <div className="flex flex-col divide-y divide-border rounded-lg border border-border bg-card">
          {STATE_ORDER.map((s) => (
            <div
              key={s}
              className="grid grid-cols-[180px_1fr] items-center gap-3 px-4 py-2"
            >
              <StatusChip state={s} />
              <span className="font-mono text-xs text-muted-foreground">
                order {STATUS[s].order} · bg-status-{s}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="text-[10px] font-bold uppercase tracking-[0.07em] text-faint-foreground">
          Fleet rollup (worst real child state wins)
        </h3>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="mb-3 flex items-center gap-3">
            <span className="text-sm font-bold text-card-foreground">
              Back The Rack Up · SIRIS-NYC-01
            </span>
            <StatusChip state={rolled} />
            <span className="text-xs text-muted-foreground">
              {FLEET.length} protected assets
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {FLEET.map((f) => (
              <span
                key={f.host}
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-subtle px-2 py-1"
              >
                <span
                  className={`size-2 shrink-0 rounded-full ${STATUS[f.state].dotClass}`}
                  aria-hidden="true"
                />
                <span className="font-mono text-xs text-card-foreground">
                  {f.host}
                </span>
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="text-[10px] font-bold uppercase tracking-[0.07em] text-faint-foreground">
          Fix classification
        </h3>
        <div className="flex flex-wrap gap-3">
          {FIX_ORDER.map((f) => (
            <FixChip key={f} fix={f} />
          ))}
        </div>
      </section>
    </div>
  );
}

const meta: Meta = {
  title: "Foundations/Status System",
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
    controls: { disable: true },
  },
};

export default meta;
type Story = StoryObj;

export const Reference: Story = {
  render: () => <StatusSystem />,
};
