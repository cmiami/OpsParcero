"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { AppSidebar } from "@/components/organisms/shell/app-sidebar";
import { TopBar } from "@/components/organisms/shell/top-bar";
import { CommandPalette } from "@/components/organisms/shell/command-palette";
import { ActionCart } from "@/components/organisms/automation/action-cart";
import { activeNavItem } from "@/config/nav";
import { useUiStore } from "@/stores/ui";

/**
 * Console shell — the persistent app frame (white left nav + Kaseya-blue topbar
 * + global command palette + action cart). A route group layout, so it never
 * remounts on navigation: cart, sidebar, and tenant context survive route changes.
 */
export default function ConsoleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [cmdOpen, setCmdOpen] = React.useState(false);
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const active = activeNavItem(pathname);

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setCmdOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const breadcrumb = active
    ? [
        { label: "Resolution Center", href: "/resolution" },
        { label: active.label, href: active.href },
      ]
    : [{ label: "Resolution Center", href: "/resolution" }];

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      <AppSidebar activeHref={active?.href ?? pathname} collapsed={collapsed} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar breadcrumb={breadcrumb} onSearch={() => setCmdOpen(true)} />
        <main className="min-h-0 flex-1 overflow-auto">{children}</main>
      </div>
      <CommandPalette open={cmdOpen} onOpenChange={setCmdOpen} />
      <div className="fixed bottom-4 right-4 z-50">
        <ActionCart />
      </div>
    </div>
  );
}
