"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import {
  PanelLeft,
  Menu,
  Bell,
  ScanLine,
  Wrench,
  Sun,
  Moon,
  Monitor,
} from "lucide-react";

import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/stores/ui";
import { Button } from "@/components/ui/button";
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu";

export interface BreadcrumbCrumb {
  label: string;
  href?: string;
}

export interface TopBarUser {
  name: string;
  email?: string;
  avatarUrl?: string;
}

export interface TopBarProps {
  /** Ordered breadcrumb trail; the last entry renders as the current page. */
  breadcrumb?: BreadcrumbCrumb[];
  user?: TopBarUser;
  /** Unread notification count (badge hidden at 0). */
  notificationCount?: number;
  /** Opens the global command palette / search overlay. */
  onSearch?: () => void;
  /** Opens the mobile navigation drawer (rendered only below `md`). */
  onMenu?: () => void;
  /** Re-scan the fleet for new failures. Defaults to a toast acknowledgement. */
  onScan?: () => void;
  /** Auto-fix every end-to-end-fixable issue. Defaults to a toast acknowledgement. */
  onFixAll?: () => void;
  className?: string;
}

const DEFAULT_USER: TopBarUser = {
  name: "Avery Tan",
  email: "avery.tan@spanningdemo.com",
};

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/**
 * TopBar — the Kaseya-blue application top bar (M4).
 *
 * `bg-primary` / `text-topbar-foreground`, `h-14`. Left: sidebar toggle +
 * breadcrumb. Right: a search affordance that opens the command palette, the
 * "Scan now" and "End-to-end fix all" translucent action buttons, a
 * notifications bell with an optional count, a theme toggle (next-themes), and
 * the user avatar menu.
 */
export function TopBar({
  breadcrumb = [],
  user = DEFAULT_USER,
  notificationCount = 0,
  onSearch,
  onMenu,
  onScan,
  onFixAll,
  className,
}: TopBarProps) {
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const hasUnread = notificationCount > 0;

  // The two action buttons are functional everywhere: a host can supply real
  // handlers, otherwise they give an honest acknowledgement (front-end mock).
  const handleScan =
    onScan ??
    (() =>
      toast("Scan started", {
        description: "Re-checking the fleet for new failures…",
      }));
  const handleFixAll =
    onFixAll ??
    (() =>
      toast("End-to-end fix queued", {
        description: "Auto-fixing every end-to-end-fixable issue across the fleet.",
      }));

  return (
    <header
      className={cn(
        "flex h-14 items-center gap-3 bg-topbar px-3 text-topbar-foreground",
        className,
      )}
    >
      {/* Mobile: open the off-canvas nav drawer. */}
      <Button
        variant="ghost"
        size="icon"
        aria-label="Open navigation menu"
        onClick={onMenu}
        className="text-topbar-foreground hover:bg-topbar-foreground/15 hover:text-topbar-foreground md:hidden"
      >
        <Menu className="size-5" aria-hidden />
      </Button>
      {/* Desktop: collapse / expand the persistent rail. */}
      <Button
        variant="ghost"
        size="icon"
        aria-label="Toggle navigation"
        onClick={toggleSidebar}
        className="hidden text-topbar-foreground hover:bg-topbar-foreground/15 hover:text-topbar-foreground md:inline-flex"
      >
        <PanelLeft className="size-5" aria-hidden />
      </Button>

      <Breadcrumb className="min-w-0">
        <BreadcrumbList className="text-topbar-foreground">
          {breadcrumb.map((crumb, i) => {
            const last = i === breadcrumb.length - 1;
            return (
              <React.Fragment key={`${crumb.label}-${i}`}>
                <BreadcrumbItem>
                  {last || !crumb.href ? (
                    <BreadcrumbPage className="text-topbar-foreground">
                      {crumb.label}
                    </BreadcrumbPage>
                  ) : (
                    <BreadcrumbLink
                      href={crumb.href}
                      className="font-medium text-topbar-foreground hover:underline"
                    >
                      {crumb.label}
                    </BreadcrumbLink>
                  )}
                </BreadcrumbItem>
                {!last && (
                  <BreadcrumbSeparator className="text-topbar-foreground/50" />
                )}
              </React.Fragment>
            );
          })}
        </BreadcrumbList>
      </Breadcrumb>

      <div className="ml-auto flex items-center gap-2">
        {/* Search → command palette */}
        <button
          type="button"
          onClick={onSearch}
          aria-label="Search (open command palette)"
          aria-keyshortcuts="f Meta+K"
          className="hidden items-center gap-2 rounded-md border border-topbar-foreground/40 px-2.5 py-1.5 text-sm text-topbar-foreground transition-colors hover:bg-topbar-foreground/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-topbar-foreground/60 md:flex"
        >
          <ScanLine className="size-4" aria-hidden />
          <span>Search…</span>
          <kbd className="rounded-sm border border-topbar-foreground/30 px-1.5 py-0.5 font-mono text-2xs font-bold">
            f
          </kbd>
        </button>

        <Button
          variant="ghost"
          size="sm"
          onClick={handleScan}
          className="hidden gap-1.5 border border-topbar-foreground/40 text-topbar-foreground hover:bg-topbar-foreground/15 hover:text-topbar-foreground lg:inline-flex"
        >
          <ScanLine className="size-4" aria-hidden />
          Scan now
        </Button>

        <Button
          variant="ghost"
          size="sm"
          onClick={handleFixAll}
          className="hidden gap-1.5 border border-topbar-foreground/40 text-topbar-foreground hover:bg-topbar-foreground/15 hover:text-topbar-foreground lg:inline-flex"
        >
          <Wrench className="size-4" aria-hidden />
          End-to-end fix all
        </Button>

        {/* Notifications */}
        <Button
          variant="ghost"
          size="icon"
          aria-label={
            hasUnread
              ? `Notifications, ${notificationCount} unread`
              : "Notifications"
          }
          className="relative text-topbar-foreground hover:bg-topbar-foreground/15 hover:text-topbar-foreground"
        >
          <Bell className="size-5" aria-hidden />
          {hasUnread && (
            <span className="absolute right-1 top-1 inline-flex min-w-4 items-center justify-center rounded-full bg-critical px-1 text-2xs font-bold tabular-nums leading-none text-critical-foreground">
              {notificationCount}
            </span>
          )}
        </Button>

        <ThemeToggle />

        {/* User menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={`Account: ${user.name}`}
              className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-topbar-foreground/50"
            >
              <Avatar className="size-8 border border-topbar-foreground/30">
                {user.avatarUrl ? (
                  <AvatarImage src={user.avatarUrl} alt="" />
                ) : null}
                <AvatarFallback className="bg-primary-strong text-xs font-bold text-topbar-foreground">
                  {initials(user.name)}
                </AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="flex flex-col">
              <span className="font-bold">{user.name}</span>
              {user.email ? (
                <span className="font-normal text-muted-foreground">
                  {user.email}
                </span>
              ) : null}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem>Profile</DropdownMenuItem>
            <DropdownMenuItem>Preferences</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem>Sign out</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

/** Light / Dark / System theme selector, backed by next-themes. */
function ThemeToggle() {
  const { theme = "system", setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Change theme"
          className="text-topbar-foreground hover:bg-topbar-foreground/15 hover:text-topbar-foreground"
        >
          {mounted && theme === "dark" ? (
            <Moon className="size-5" aria-hidden />
          ) : mounted && theme === "system" ? (
            <Monitor className="size-5" aria-hidden />
          ) : (
            <Sun className="size-5" aria-hidden />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Theme</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
          <DropdownMenuRadioItem value="light">
            <Sun className="size-4" aria-hidden />
            Light
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">
            <Moon className="size-4" aria-hidden />
            Dark
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system">
            <Monitor className="size-4" aria-hidden />
            System
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
