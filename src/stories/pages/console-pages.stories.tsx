import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within } from "storybook/test";
import { PageShell } from "@/components/templates/page-shell";
import { AssetTable } from "@/components/organisms/data-table/asset-table";
import { AlertTriageList } from "@/components/organisms/triage/alert-triage-list";
import { RunHistoryTable } from "@/components/organisms/data-table/run-history-table";
import { AuditLog } from "@/components/organisms/audit-log";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Toaster } from "@/components/ui/sonner";
import { useActivity } from "@/stores/activity";

/**
 * Pages — full route compositions (the PageShell TEMPLATE filled with organisms +
 * seeded mock data), the top of the atomic-design hierarchy. These mirror what
 * the `(console)` routes render, so the page frame is verifiable in Storybook
 * (incl. axe) without the Next runtime. (Surfaces that read URL state via nuqs —
 * the Resolution Center home — keep their own organism stories.)
 */
const meta = {
  title: "Pages/Console",
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => {
      // Hermetic: clear any runtime overlays a sibling story left in the shared
      // activity store, so the default-query surfaces here read the seed.
      useActivity.setState({
        runs: [],
        audit: [],
        assetOverrides: {},
        alertOverrides: {},
      });
      return (
        <div className="h-screen bg-background">
          <Story />
          <Toaster />
        </div>
      );
    },
  ],
} satisfies Meta;
export default meta;
type Story = StoryObj;

/** Backups — the fleet asset table inside the page shell. */
export const Backups: Story = {
  render: () => (
    <PageShell
      title="Backups & protection"
      description="Last-good recency and the last 10 attempts for every protected asset."
    >
      <AssetTable />
    </PageShell>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("heading", { name: "Backups & protection" }),
    ).toBeInTheDocument();
  },
};

/** Alerts — the triage queue grouped by category. */
export const Alerts: Story = {
  render: () => (
    <PageShell
      title="Alerts"
      description="Deduped and grouped by root cause — cosmetic noise sorts below real failures."
    >
      <AlertTriageList groupBy="category" />
    </PageShell>
  ),
};

/** Run history & audit — the immutable run feed + audit trail (tabbed). */
export const RunHistory: Story = {
  render: () => (
    <PageShell
      title="Run history & audit"
      description="What ran, on which assets, with what outcome — and the immutable who-did-what-when."
    >
      <Tabs defaultValue="runs" className="flex h-full flex-col gap-4">
        <TabsList>
          <TabsTrigger value="runs">Run history</TabsTrigger>
          <TabsTrigger value="audit">Audit trail</TabsTrigger>
        </TabsList>
        <TabsContent value="runs" className="min-h-0 flex-1">
          <RunHistoryTable />
        </TabsContent>
        <TabsContent value="audit" className="min-h-0 flex-1">
          <AuditLog />
        </TabsContent>
      </Tabs>
    </PageShell>
  ),
};
