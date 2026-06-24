"use client";

import * as React from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { TrendingUp, PieChart as PieIcon, BarChart3, Layers } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ClientId } from "@/types";
import { cn } from "@/lib/utils";
import { getFleetStats, getIssueCategories, type FleetStats } from "@/mock/query";

export interface IssueChartsProps {
  /** Pre-fetched stats; falls back to `getFleetStats()`. */
  stats?: FleetStats;
  /** Active tenant — scopes the by-category chart to that client's issues. */
  clientId?: ClientId;
  className?: string;
}

/**
 * Token-driven series colors. Recharts accepts any CSS color string, so
 * `var(--token)` keeps every fill/stroke bound to a design token — no raw hex
 * anywhere (M1). These reference the chart/fix/product/status token families.
 */
const C = {
  open: "var(--critical)",
  resolved: "var(--success)",
  grid: "var(--border)",
  axis: "var(--muted-foreground)",
  product: {
    bcdr: "var(--product-bcdr)",
    saas: "var(--product-saas)",
    endpoint: "var(--product-endpoint)",
  },
  fix: {
    full: "var(--fix-endtoend)",
    partial: "var(--fix-guided)",
    insights: "var(--fix-insights)",
    unknown: "var(--fix-unknown)",
  },
  category: [
    "var(--chart-1)",
    "var(--chart-2)",
    "var(--chart-3)",
    "var(--chart-4)",
    "var(--chart-5)",
  ],
} as const;

const PRODUCT_LABEL: Record<string, string> = {
  bcdr: "Datto BCDR",
  saas: "SaaS",
  endpoint: "Endpoint v2",
};

/** A titled chart panel with an icon header and a legend slot. */
function ChartCard({
  title,
  icon: Icon,
  legend,
  children,
  className,
}: {
  title: string;
  icon: LucideIcon;
  legend?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  // Recharts' ResponsiveContainer measures its parent; during the static
  // prerender there is no layout, so it would paint a 0/-1-sized chart and warn.
  // Render the chart only after mount, reserving the box so layout is stable.
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  return (
    <section
      className={cn(
        "flex flex-col gap-2 rounded-lg border border-border bg-card p-4",
        className,
      )}
    >
      <h3 className="flex items-center gap-1.5 text-sm font-bold text-card-foreground">
        <Icon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
        {title}
      </h3>
      <div className="h-40 w-full">{mounted ? children : null}</div>
      {legend && (
        <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {legend}
        </ul>
      )}
    </section>
  );
}

/** A swatch + label legend item — color is paired with text, never color-only (M5). */
function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <li className="flex items-center gap-1.5">
      <span
        aria-hidden
        className="size-2.5 shrink-0 rounded-full"
        style={{ backgroundColor: color }}
      />
      {label}
    </li>
  );
}

/** Deterministic 7-point open-vs-resolved trend derived from current counts (no RNG). */
function buildTrend(open: number, resolved: number) {
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  return days.map((day, i) => ({
    day,
    // A smooth, seeded ramp toward the current values — stable across renders.
    open: Math.max(0, Math.round(open * (0.6 + i * 0.07))),
    resolved: Math.max(0, Math.round(resolved * (0.4 + i * 0.1))),
  }));
}

/**
 * IssueCharts — the analytics row on the Resolution Center home (design §9).
 *
 * Four Recharts panels: issue trend (open vs resolved line), by-product donut,
 * by-category bar, and fix-classification donut. Every series color is a design
 * token via `var(--…)`, soft gridlines, no heavy axes. Each panel carries a
 * text legend so the data is readable without relying on color (M5).
 */
export function IssueCharts({ stats, clientId, className }: IssueChartsProps) {
  const s = stats ?? getFleetStats();

  const trend = React.useMemo(
    () => buildTrend(s.openIssues, s.resolvedToday + 6),
    [s.openIssues, s.resolvedToday],
  );

  const productData = React.useMemo(
    () =>
      s.perProduct
        .map((p) => ({
          key: p.bucket,
          name: PRODUCT_LABEL[p.bucket] ?? p.bucket,
          value: p.openIssues,
          color: C.product[p.bucket],
        }))
        .filter((d) => d.value > 0),
    [s.perProduct],
  );

  const fixData = React.useMemo(
    () =>
      [
        { name: "End-to-end", value: s.endToEndFixable, color: C.fix.full },
        { name: "Guided", value: s.guidedFixable, color: C.fix.partial },
        { name: "Insights only", value: s.insightsOnly, color: C.fix.insights },
      ].filter((d) => d.value > 0),
    [s.endToEndFixable, s.guidedFixable, s.insightsOnly],
  );

  const categoryData = React.useMemo(() => {
    const cats = getIssueCategories(clientId);
    return cats.slice(0, 5).map((c, i) => ({
      name: c.category,
      value: c.totalIssues,
      color: C.category[i % C.category.length],
    }));
  }, [clientId]);

  // Recharts contentStyle — token-driven, no raw px (M1). (The chart axis ticks
  // below stay numeric because Recharts requires a number for tick fontSize.)
  const tooltipStyle: React.CSSProperties = {
    backgroundColor: "var(--popover)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-md)",
    fontSize: "var(--text-2xs)",
    color: "var(--foreground)",
  };

  return (
    <div className={cn("grid gap-3 lg:grid-cols-2 xl:grid-cols-4", className)}>
      {/* Trend */}
      <ChartCard
        title="Issue trend"
        icon={TrendingUp}
        legend={
          <>
            <LegendItem color={C.open} label="Open" />
            <LegendItem color={C.resolved} label="Resolved" />
          </>
        }
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={trend} margin={{ top: 4, right: 4, bottom: 0, left: -24 }}>
            <CartesianGrid stroke={C.grid} strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="day"
              tick={{ fontSize: 10, fill: C.axis }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tick={{ fontSize: 10, fill: C.axis }}
              tickLine={false}
              axisLine={false}
              width={36}
            />
            <Tooltip contentStyle={tooltipStyle} />
            <Line
              type="monotone"
              dataKey="open"
              stroke={C.open}
              strokeWidth={2}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="resolved"
              stroke={C.resolved}
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* By product (donut) */}
      <ChartCard
        title="By product"
        icon={PieIcon}
        legend={productData.map((d) => (
          <LegendItem key={d.key} color={d.color} label={`${d.name} (${d.value})`} />
        ))}
      >
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Tooltip contentStyle={tooltipStyle} />
            <Pie
              data={productData}
              dataKey="value"
              nameKey="name"
              innerRadius="55%"
              outerRadius="80%"
              paddingAngle={2}
              stroke="var(--card)"
            >
              {productData.map((d) => (
                <Cell key={d.key} fill={d.color} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* By category (bar) */}
      <ChartCard
        title="By category"
        icon={BarChart3}
        legend={
          <li className="text-faint-foreground">Top {categoryData.length} categories</li>
        }
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={categoryData}
            layout="vertical"
            margin={{ top: 0, right: 8, bottom: 0, left: 0 }}
          >
            <CartesianGrid stroke={C.grid} strokeDasharray="3 3" horizontal={false} />
            <XAxis type="number" hide />
            <YAxis
              type="category"
              dataKey="name"
              tick={{ fontSize: 9, fill: C.axis }}
              tickLine={false}
              axisLine={false}
              width={96}
            />
            <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "var(--subtle)" }} />
            <Bar dataKey="value" radius={[0, 4, 4, 0]}>
              {categoryData.map((d) => (
                <Cell key={d.name} fill={d.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Fix classification (donut) */}
      <ChartCard
        title="Fix classification"
        icon={Layers}
        legend={fixData.map((d) => (
          <LegendItem key={d.name} color={d.color} label={`${d.name} (${d.value})`} />
        ))}
      >
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Tooltip contentStyle={tooltipStyle} />
            <Pie
              data={fixData}
              dataKey="value"
              nameKey="name"
              innerRadius="55%"
              outerRadius="80%"
              paddingAngle={2}
              stroke="var(--card)"
            >
              {fixData.map((d) => (
                <Cell key={d.name} fill={d.color} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}
