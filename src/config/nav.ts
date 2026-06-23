/**
 * @/config/nav — typed navigation IA.
 *
 * Single source of truth for the sidebar, breadcrumbs, and command palette.
 * Each item carries its lucide icon and owning section so every surface stays
 * in sync. Routes mirror the App Router structure under src/app.
 */

import {
  LifeBuoy,
  Server,
  DatabaseBackup,
  Bell,
  Workflow,
  ShieldCheck,
  CheckSquare,
  History,
  Settings,
  type LucideIcon,
} from "lucide-react";

export type NavSectionId = "resolution" | "automation" | "settings";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  section: NavSectionId;
  /** Optional one-line hint for command palette / tooltips. */
  description?: string;
}

export interface NavSection {
  id: NavSectionId;
  label: string;
  items: NavItem[];
}

export const NAV: NavSection[] = [
  {
    id: "resolution",
    label: "Resolution",
    items: [
      {
        label: "Resolution Center",
        href: "/resolution",
        icon: LifeBuoy,
        section: "resolution",
        description: "Issues grouped by category — see why and fix once or forever",
      },
      {
        label: "Fleet",
        href: "/fleet",
        icon: Server,
        section: "resolution",
        description: "Every protected asset across SaaS, BCDR, and Endpoint",
      },
      {
        label: "Backups",
        href: "/backups",
        icon: DatabaseBackup,
        section: "resolution",
        description: "Backup runs, recovery points, and screenshot verification",
      },
      {
        label: "Alerts",
        href: "/alerts",
        icon: Bell,
        section: "resolution",
        description: "Triage queue of open alerts and incidents",
      },
    ],
  },
  {
    id: "automation",
    label: "Automation",
    items: [
      {
        label: "Playbooks",
        href: "/automation/playbooks",
        icon: Workflow,
        section: "automation",
        description: "Saved chains of remediation actions",
      },
      {
        label: "Policies",
        href: "/automation/policies",
        icon: ShieldCheck,
        section: "automation",
        description: "Apply-always auto-remediation rules",
      },
      {
        label: "Approvals",
        href: "/automation/approvals",
        icon: CheckSquare,
        section: "automation",
        description: "Pending approvals for destructive or over-threshold actions",
      },
      {
        label: "Run history",
        href: "/automation/runs",
        icon: History,
        section: "automation",
        description: "Audit trail of action and chain runs",
      },
    ],
  },
  {
    id: "settings",
    label: "Settings",
    items: [
      {
        label: "Settings",
        href: "/settings",
        icon: Settings,
        section: "settings",
        description: "Org, users, branding, and preferences",
      },
    ],
  },
];

/** Flat list of every nav item, in section order. */
export const NAV_ITEMS: NavItem[] = NAV.flatMap((s) => s.items);

/** Resolve the nav item whose href best matches a pathname (for active state). */
export function activeNavItem(pathname: string): NavItem | undefined {
  // Prefer the longest matching href so "/automation/runs" beats "/automation".
  let best: NavItem | undefined;
  for (const item of NAV_ITEMS) {
    const matches =
      pathname === item.href || pathname.startsWith(`${item.href}/`);
    if (matches && (!best || item.href.length > best.href.length)) {
      best = item;
    }
  }
  // Treat the app root as the Resolution Center.
  if (!best && (pathname === "/" || pathname === "")) {
    return NAV_ITEMS.find((i) => i.href === "/resolution");
  }
  return best;
}
