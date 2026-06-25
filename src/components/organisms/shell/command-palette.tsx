"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Server, LifeBuoy, Workflow, ArrowRight, ShieldCheck } from "lucide-react";

import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
} from "@/components/ui/command";
import { StatusBadge } from "@/components/atoms/status-badge";
import { SeverityBadge } from "@/components/atoms/severity-badge";
import {
  getAssets,
  getAssetsForClient,
  getIssues,
  getPlaybooks,
  getPolicies,
} from "@/mock/query";
import { useActiveClientId } from "@/stores/use-active-client";
import {
  useActivity,
  applyOverrides,
  applyIssueResolution,
} from "@/stores/activity";
import { useUserPlaybooks } from "@/stores/playbooks";
import { usePolicies } from "@/stores/automation-policies";
import { useHasHydrated } from "@/stores/use-has-hydrated";
import { NAV_ITEMS } from "@/config/nav";

export interface CommandPaletteProps {
  /** Controlled open state. When omitted, the palette self-manages and listens for ⌘K / f. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

/**
 * CommandPalette — the global ⌘K / `f` launcher.
 *
 * A `CommandDialog` (cmdk) that searches across navigation, assets, issues, and
 * playbooks pulled from the mock query layer, grouped and keyboard-navigable.
 * Selecting a result navigates and closes. The component is controllable; when
 * uncontrolled it binds ⌘K (and `f` outside inputs) to toggle itself.
 */
export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const router = useRouter();
  const [internalOpen, setInternalOpen] = React.useState(false);

  const isControlled = open !== undefined;
  const isOpen = isControlled ? open : internalOpen;

  const setOpen = React.useCallback(
    (next: boolean) => {
      if (!isControlled) setInternalOpen(next);
      onOpenChange?.(next);
    },
    [isControlled, onOpenChange],
  );

  React.useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const inField =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable;

      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen(!isOpen);
        return;
      }
      if (e.key === "f" && !inField && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        setOpen(true);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isOpen, setOpen]);

  // Scope to the active tenant, overlay this session's heals, and include the
  // user's own playbooks + policies — so the launcher matches the rest of the app
  // instead of a frozen, all-tenant seed slice (#13). cmdk filters on each item's
  // `value`, so the rendered set just needs to be the right corpus.
  const clientId = useActiveClientId();
  const activityHydrated = useHasHydrated(useActivity);
  const assetOverrides = useActivity((s) => s.assetOverrides);
  const pbHydrated = useHasHydrated(useUserPlaybooks);
  const userPlaybooks = useUserPlaybooks((s) => s.userPlaybooks);
  const polHydrated = useHasHydrated(usePolicies);
  const userPolicies = usePolicies((s) => s.policies);

  const assets = React.useMemo(() => {
    const base = clientId
      ? getAssetsForClient(clientId).slice(0, 8)
      : getAssets({}, undefined, 0, 8).items;
    return activityHydrated ? applyOverrides(base, assetOverrides) : base;
  }, [clientId, activityHydrated, assetOverrides]);
  const issues = React.useMemo(() => {
    const base = getIssues(clientId ? { clientIds: [clientId] } : {});
    return activityHydrated ? applyIssueResolution(base, assetOverrides) : base;
  }, [clientId, activityHydrated, assetOverrides]);
  const playbooks = React.useMemo(
    () => [...(pbHydrated ? userPlaybooks : []), ...getPlaybooks()],
    [pbHydrated, userPlaybooks],
  );
  const policies = React.useMemo(
    () => [...(polHydrated ? userPolicies : []), ...getPolicies()],
    [polHydrated, userPolicies],
  );

  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  return (
    <CommandDialog
      open={isOpen}
      onOpenChange={setOpen}
      title="Command palette"
      description="Search assets, issues, playbooks, and navigation"
    >
      <CommandInput placeholder="Search assets, issues, playbooks…" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        <CommandGroup heading="Navigation">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <CommandItem
                key={item.href}
                value={`nav ${item.label} ${item.description ?? ""}`}
                onSelect={() => go(item.href)}
              >
                <Icon className="text-muted-foreground" aria-hidden />
                <span className="font-medium">{item.label}</span>
                {item.description ? (
                  <span className="truncate text-xs text-muted-foreground">
                    {item.description}
                  </span>
                ) : null}
                <CommandShortcut>
                  <ArrowRight className="size-3.5" aria-hidden />
                </CommandShortcut>
              </CommandItem>
            );
          })}
        </CommandGroup>

        <CommandGroup heading="Assets">
          {assets.map((asset) => (
            <CommandItem
              key={asset.id}
              value={`asset ${asset.displayName} ${asset.id}`}
              onSelect={() => go(`/fleet/${asset.id}`)}
            >
              <Server className="text-muted-foreground" aria-hidden />
              <span className="truncate font-mono text-xs">{asset.displayName}</span>
              <span className="ml-auto">
                <StatusBadge state={asset.status} size="sm" />
              </span>
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandGroup heading="Issues">
          {issues.map((issue) => (
            <CommandItem
              key={issue.id}
              value={`issue ${issue.title} ${issue.detail}`}
              onSelect={() => go(`/resolution?issue=${issue.id}`)}
            >
              <LifeBuoy className="text-muted-foreground" aria-hidden />
              <span className="truncate">{issue.title}</span>
              <span className="ml-auto">
                <SeverityBadge severity={issue.severity} />
              </span>
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandGroup heading="Playbooks">
          {playbooks.map((pb) => (
            <CommandItem
              key={pb.id}
              value={`playbook ${pb.name} ${pb.description}`}
              onSelect={() => go(`/automation/playbooks?pb=${pb.id}`)}
            >
              <Workflow className="text-muted-foreground" aria-hidden />
              <span className="truncate font-medium">{pb.name}</span>
              <span className="ml-auto text-xs text-muted-foreground">
                {pb.steps.length} steps
              </span>
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandGroup heading="Policies">
          {policies.map((pol) => (
            <CommandItem
              key={pol.id}
              value={`policy ${pol.name}`}
              onSelect={() => go("/automation/policies")}
            >
              <ShieldCheck className="text-muted-foreground" aria-hidden />
              <span className="truncate font-medium">{pol.name}</span>
              <span className="ml-auto text-xs text-muted-foreground">
                {pol.enabled ? "Enabled" : "Paused"}
              </span>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
