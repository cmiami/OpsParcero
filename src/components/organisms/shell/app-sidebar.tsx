"use client";

import * as React from "react";
import Link from "next/link";
import { Check, ChevronsUpDown, ShoppingCart, ShieldCheck } from "lucide-react";

import { cn } from "@/lib/utils";
import { NAV } from "@/config/nav";
import type { AssetStatus } from "@/types";
import { rollupStatus } from "@/lib/status";
import { getClients, getOpenAlerts, getIssues } from "@/mock/query";
import { useUiStore } from "@/stores/ui";
import { useActiveClientId } from "@/stores/use-active-client";
import { useActionCart } from "@/stores/action-cart";
import {
  useActivity,
  applyAlertOverrides,
  applyIssueResolution,
} from "@/stores/activity";
import { useHasHydrated } from "@/stores/use-has-hydrated";
import { SeverityDot } from "@/components/atoms/severity-dot";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";

export interface AppSidebarProps {
  /** Active route href (drives the active-item treatment). */
  activeHref?: string;
  /** Render the icon-only rail instead of the full nav. */
  collapsed?: boolean;
  className?: string;
}

/** Per-nav-item live signal: worst child state + a count, where it makes sense. */
interface NavBadge {
  worst: AssetStatus;
  count: number;
}

/**
 * AppSidebar — the persistent WHITE left navigation (M4).
 *
 * Renders on `bg-sidebar`, which is fixed to the light Kaseya nav surface and
 * **never flips in dark mode**. Brand header, a tenant switcher (Popover +
 * Command combobox over the mock clients), the nav sections from `@/config/nav`
 * with live worst-state badges, and a cart entry at the foot whose count is
 * gated behind store hydration to avoid a mismatch.
 */
export function AppSidebar({
  activeHref,
  collapsed = false,
  className,
}: AppSidebarProps) {
  const clients = React.useMemo(() => getClients(), []);
  // The active tenant is shared, persisted state (useUiStore) so every data
  // surface can scope to it; undefined = "All tenants".
  const clientId = useActiveClientId();
  const setClientId = useUiStore((s) => s.setLastClientId);
  const [switcherOpen, setSwitcherOpen] = React.useState(false);
  const activeClient = clients.find((c) => c.id === clientId);

  const hydrated = useHasHydrated();
  const cartCount = useActionCart((s) => s.steps.length);

  // Overlay this session's heals so the nav badges shrink when alerts/issues are
  // resolved, instead of inflating the counts forever on frozen seed (#4).
  const activityHydrated = useHasHydrated(useActivity);
  const assetOverrides = useActivity((s) => s.assetOverrides);
  const alertOverrides = useActivity((s) => s.alertOverrides);

  // Live badges, derived deterministically from the mock layer (+ heal overlay).
  const badges = React.useMemo(() => {
    const map = new Map<string, NavBadge>();

    const rawAlerts = getOpenAlerts();
    const openAlerts = activityHydrated
      ? applyAlertOverrides(rawAlerts, alertOverrides).filter(
          (a) => a.state === "open" || a.state === "acknowledged",
        )
      : rawAlerts;
    if (openAlerts.length) {
      const worst = rollupStatus(
        openAlerts.map((a) =>
          a.severity === "critical" ? "failed" : "warning",
        ),
      );
      map.set("/alerts", { worst, count: openAlerts.length });
    }

    const rawIssues = getIssues();
    const issues = activityHydrated
      ? applyIssueResolution(rawIssues, assetOverrides)
      : rawIssues;
    if (issues.length) {
      const worst = rollupStatus(
        issues.map((i) => (i.severity === "critical" ? "failed" : "warning")),
      );
      map.set("/resolution", { worst, count: issues.length });
    }

    return map;
  }, [activityHydrated, alertOverrides, assetOverrides]);

  return (
    <nav
      aria-label="Main navigation"
      data-collapsed={collapsed}
      className={cn(
        "flex h-full flex-col bg-sidebar text-sidebar-foreground",
        collapsed ? "w-16" : "w-60",
        className,
      )}
    >
      {/* Brand */}
      <div
        className={cn(
          "flex h-14 items-center gap-2 border-b border-sidebar-border px-3",
          collapsed && "justify-center px-0",
        )}
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <ShieldCheck className="size-5" aria-hidden />
        </span>
        {!collapsed && (
          <span className="flex flex-col leading-tight">
            <span className="font-display text-sm font-bold tracking-tight">
              Kaseya
            </span>
            <span className="text-2xs font-bold uppercase tracking-eyebrow text-faint-foreground">
              Cyber Resilience
            </span>
          </span>
        )}
      </div>

      {/* Tenant switcher */}
      <div className={cn("border-b border-sidebar-border p-2", collapsed && "px-1.5")}>
        <Popover open={switcherOpen} onOpenChange={setSwitcherOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              role="combobox"
              aria-expanded={switcherOpen}
              aria-controls="tenant-switcher-list"
              aria-label="Switch tenant"
              className={cn(
                "flex w-full items-center gap-2 rounded-md border border-sidebar-border bg-background px-2 py-1.5 text-left text-sm transition-colors hover:bg-nav-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                collapsed && "justify-center px-0",
              )}
            >
              {activeClient ? (
                <SeverityDot state={activeClient.healthRollup.status} />
              ) : null}
              {!collapsed && (
                <>
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {activeClient?.name ?? "All tenants"}
                  </span>
                  <ChevronsUpDown
                    className="size-3.5 shrink-0 text-muted-foreground"
                    aria-hidden
                  />
                </>
              )}
            </button>
          </PopoverTrigger>
          <PopoverContent
            id="tenant-switcher-list"
            align="start"
            className="w-60 p-0"
          >
            <Command>
              <CommandInput placeholder="Find tenant…" />
              <CommandList>
                <CommandEmpty>No tenants found.</CommandEmpty>
                <CommandGroup heading="Tenants">
                  <CommandItem
                    value="All tenants"
                    onSelect={() => {
                      setClientId(undefined);
                      setSwitcherOpen(false);
                    }}
                  >
                    <span className="min-w-0 flex-1 truncate">All tenants</span>
                    {!clientId ? (
                      <Check className="size-4 text-primary" aria-hidden />
                    ) : null}
                  </CommandItem>
                  {clients.map((client) => (
                    <CommandItem
                      key={client.id}
                      value={client.name}
                      onSelect={() => {
                        setClientId(client.id);
                        setSwitcherOpen(false);
                      }}
                    >
                      <SeverityDot state={client.healthRollup.status} />
                      <span className="min-w-0 flex-1 truncate">
                        {client.name}
                      </span>
                      {client.id === clientId ? (
                        <Check className="size-4 text-primary" aria-hidden />
                      ) : null}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>

      {/* Nav sections */}
      <div className="flex-1 overflow-y-auto py-2">
        {NAV.map((section) => (
          <div key={section.id} className="mb-2">
            {!collapsed && (
              <p className="px-3 pb-1 pt-2 text-2xs font-bold uppercase tracking-eyebrow text-faint-foreground">
                {section.label}
              </p>
            )}
            <ul className="space-y-0.5 px-2">
              {section.items.map((item) => {
                const Icon = item.icon;
                const active = activeHref === item.href;
                const badge = badges.get(item.href);
                return (
                  <li key={item.href}>
                    <NavRow
                      href={item.href}
                      label={item.label}
                      icon={Icon}
                      active={active}
                      collapsed={collapsed}
                      badge={badge}
                    />
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      {/* Cart entry */}
      <div className="border-t border-sidebar-border p-2">
        <NavRow
          href="/cart"
          label="Action cart"
          icon={ShoppingCart}
          active={activeHref === "/cart"}
          collapsed={collapsed}
          countBadge={hydrated && cartCount > 0 ? cartCount : undefined}
        />
      </div>
    </nav>
  );
}

interface NavRowProps {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  active: boolean;
  collapsed: boolean;
  badge?: NavBadge;
  /** A plain numeric badge (e.g. cart count) rendered as a primary pill. */
  countBadge?: number;
}

function NavRow({
  href,
  label,
  icon: Icon,
  active,
  collapsed,
  badge,
  countBadge,
}: NavRowProps) {
  const row = (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex items-center gap-2.5 rounded-md py-1.5 pl-2.5 pr-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-sidebar-foreground hover:bg-nav-hover",
        collapsed && "justify-center px-0",
      )}
    >
      {active && (
        <span
          aria-hidden
          className="absolute inset-y-1 left-0 w-1 rounded-full bg-primary"
        />
      )}
      <Icon
        className={cn("size-4 shrink-0", active ? "text-primary" : "text-muted-foreground")}
        aria-hidden
      />
      {!collapsed && <span className="min-w-0 flex-1 truncate">{label}</span>}
      {!collapsed && badge ? (
        <span className="inline-flex items-center gap-1">
          <SeverityDot state={badge.worst} />
          <span className="tabular-nums text-xs font-bold text-muted-foreground">
            {badge.count}
          </span>
        </span>
      ) : null}
      {!collapsed && countBadge != null ? (
        <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 py-0.5 text-2xs font-bold tabular-nums text-primary-foreground">
          {countBadge}
        </span>
      ) : null}
      {collapsed && (badge || countBadge != null) ? (
        <span
          aria-hidden
          className={cn(
            "absolute right-1.5 top-1.5 size-2 rounded-full",
            countBadge != null ? "bg-primary" : "bg-critical",
          )}
        />
      ) : null}
    </Link>
  );

  if (!collapsed) return row;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{row}</TooltipTrigger>
      <TooltipContent side="right">
        {label}
        {badge ? ` · ${badge.count}` : ""}
        {countBadge != null ? ` · ${countBadge}` : ""}
      </TooltipContent>
    </Tooltip>
  );
}
