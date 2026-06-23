"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import {
  PanelLeft,
  Bell,
  ScanLine,
  Wrench,
  Sun,
  Moon,
  Monitor,
} from "lucide-react";

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
 * `bg-primary` / `text-primary-foreground`, `h-14`. Left: sidebar toggle +
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
  className,
}: TopBarProps) {
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const hasUnread = notificationCount > 0;

  return (
    <header
      className={cn(
        "flex h-14 items-center gap-3 bg-primary px-3 text-primary-foreground",
        className,
      )}
    >
      <Button
        variant="ghost"
        size="icon"
        aria-label="Toggle navigation"
        onClick={toggleSidebar}
        className="text-primary-foreground hover:bg-primary-foreground/15 hover:text-primary-foreground"
      >
        <PanelLeft className="size-5" aria-hidden />
      </Button>

      <Breadcrumb className="min-w-0">
        <BreadcrumbList className="text-primary-foreground/70">
          {breadcrumb.map((crumb, i) => {
            const last = i === breadcrumb.length - 1;
            return (
              <React.Fragment key={`${crumb.label}-${i}`}>
                <BreadcrumbItem>
                  {last || !crumb.href ? (
                    <BreadcrumbPage className="text-primary-foreground">
                      {crumb.label}
                    </BreadcrumbPage>
                  ) : (
                    <BreadcrumbLink
                      href={crumb.href}
                      className="text-primary-foreground/70 hover:text-primary-foreground"
                    >
                      {crumb.label}
                    </BreadcrumbLink>
                  )}
                </BreadcrumbItem>
                {!last && (
                  <BreadcrumbSeparator className="text-primary-foreground/50" />
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
          className="hidden items-center gap-2 rounded-md border border-primary-foreground/25 bg-primary-foreground/10 px-2.5 py-1.5 text-sm text-primary-foreground/80 transition-colors hover:bg-primary-foreground/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-foreground/50 md:flex"
        >
          <ScanLine className="size-4" aria-hidden />
          <span>Search…</span>
          <kbd className="rounded-sm border border-primary-foreground/30 px-1.5 py-0.5 font-mono text-[10px] font-bold">
            f
          </kbd>
        </button>

        <Button
          variant="ghost"
          size="sm"
          className="hidden gap-1.5 border border-primary-foreground/25 bg-primary-foreground/10 text-primary-foreground hover:bg-primary-foreground/20 hover:text-primary-foreground lg:inline-flex"
        >
          <ScanLine className="size-4" aria-hidden />
          Scan now
        </Button>

        <Button
          variant="ghost"
          size="sm"
          className="hidden gap-1.5 border border-primary-foreground/25 bg-primary-foreground/10 text-primary-foreground hover:bg-primary-foreground/20 hover:text-primary-foreground lg:inline-flex"
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
          className="relative text-primary-foreground hover:bg-primary-foreground/15 hover:text-primary-foreground"
        >
          <Bell className="size-5" aria-hidden />
          {hasUnread && (
            <span className="absolute right-1 top-1 inline-flex min-w-4 items-center justify-center rounded-full bg-critical px-1 text-[10px] font-bold tabular-nums leading-none text-critical-foreground">
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
              className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-foreground/50"
            >
              <Avatar className="size-8 border border-primary-foreground/30">
                {user.avatarUrl ? (
                  <AvatarImage src={user.avatarUrl} alt="" />
                ) : null}
                <AvatarFallback className="bg-primary-strong text-xs font-bold text-primary-foreground">
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
          className="text-primary-foreground hover:bg-primary-foreground/15 hover:text-primary-foreground"
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
