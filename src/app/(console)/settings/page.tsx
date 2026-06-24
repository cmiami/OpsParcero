"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { useUiStore } from "@/stores/ui";
import { Button } from "@/components/ui/button";
import { PageShell } from "@/components/templates/page-shell";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";

const THEMES = ["light", "dark", "system"] as const;
const DENSITIES = ["comfortable", "compact"] as const;

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const density = useUiStore((s) => s.density);
  const setDensity = useUiStore((s) => s.setDensity);
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  function resetDemo() {
    Object.keys(localStorage)
      .filter((k) => k.startsWith("dcc"))
      .forEach((k) => localStorage.removeItem(k));
    toast.success("Demo state reset", {
      description: "Reloading with fresh seeded data…",
    });
    window.setTimeout(() => window.location.reload(), 600);
  }

  return (
    <PageShell
      title="Settings"
      description="Appearance, table density, and demo-state controls."
      scroll
    >
      <div className="mx-auto max-w-3xl space-y-6">
        <Card>
        <CardHeader>
          <CardTitle className="text-sm">Appearance</CardTitle>
          <CardDescription>Theme for the console shell.</CardDescription>
        </CardHeader>
        <CardContent className="flex gap-2">
          {THEMES.map((t) => (
            <Button
              key={t}
              variant={mounted && theme === t ? "default" : "outline"}
              size="sm"
              onClick={() => setTheme(t)}
              className="capitalize"
            >
              {t}
            </Button>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Density</CardTitle>
          <CardDescription>Row height for dense tables.</CardDescription>
        </CardHeader>
        <CardContent className="flex gap-2">
          {DENSITIES.map((d) => (
            <Button
              key={d}
              variant={mounted && density === d ? "default" : "outline"}
              size="sm"
              onClick={() => setDensity(d)}
              className="capitalize"
            >
              {d}
            </Button>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Demo state</CardTitle>
          <CardDescription>
            Clears saved cart, playbooks, policies, and views, then reseeds.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="destructive" size="sm" onClick={resetDemo}>
            Reset demo state
          </Button>
        </CardContent>
      </Card>
      </div>
    </PageShell>
  );
}
