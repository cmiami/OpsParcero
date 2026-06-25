import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within, userEvent, waitFor } from "storybook/test";
import { ResolutionCenter } from "./resolution-center";
import { Toaster } from "@/components/ui/sonner";
import { getIssues, getOpenAlerts, getFleetStats } from "@/mock/query";
import { applyIssueResolution } from "@/stores/activity";

const meta = {
  title: "Organisms/ResolutionCenter",
  component: ResolutionCenter,
  tags: ["autodocs"],
  argTypes: {
    className: { control: "text" },
  },
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div className="min-h-screen bg-background">
        <Story />
        <Toaster />
      </div>
    ),
  ],
} satisfies Meta<typeof ResolutionCenter>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Default — the full Resolution Center home: stat bar → cards → charts → groups. */
export const Default: Story = {};

/** RendersSpine — the home title and the issues-by-category section both render. */
export const RendersSpine: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("heading", { name: "Resolution Center" }),
    ).toBeInTheDocument();
    await expect(
      canvas.getByRole("heading", { name: /Issues by category/i }),
    ).toBeInTheDocument();
  },
};

/**
 * FiltersBySeverity — the severity filter narrows the issue list. Toggling
 * "Critical" must drop the category groups to only those with critical issues
 * (the seed: 15 categories → 11 critical-only), proving the control is wired to
 * the canonical getIssues({ severities }) filter, not just decorative.
 */
export const FiltersBySeverity: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const countGroups = () =>
      canvasElement.querySelectorAll('[data-testid="category-group"]').length;
    const before = countGroups();
    expect(before).toBeGreaterThan(0);

    const crit = canvas.getByRole("button", {
      name: /Show only Critical issues/i,
    });
    await userEvent.click(crit);
    await waitFor(() => expect(crit).toHaveAttribute("aria-pressed", "true"));
    // Filtering to critical-only narrows the list.
    await waitFor(() => expect(countGroups()).toBeLessThan(before));

    // Clearing the filter restores the full list.
    await userEvent.click(crit);
    await waitFor(() => expect(countGroups()).toBe(before));
  },
};

/**
 * StatsOverlayDropsCounts — regression gate for #4: getFleetStats with the
 * activity store's overrides recomputes the KPI counts (not just the lists), so
 * the stat bar / cards / charts / nav badges drop in lockstep with a heal — no
 * frozen-seed contradiction. Tests the overlay-aware aggregate directly.
 */
export const StatsOverlayDropsCounts: Story = {
  play: async () => {
    const seed = getFleetStats();
    const issue = getIssues().find((i) => i.impactedAssetIds.length > 0)!;
    const assetOverrides = Object.fromEntries(
      issue.impactedAssetIds.map((id) => [
        id,
        { status: "protected" as const, resolvedAt: "2026-06-25T00:00:00Z" },
      ]),
    );
    const healed = getFleetStats(undefined, { assetOverrides });
    // The fully-healed issue is no longer counted, and the healed assets read
    // protected — counts move, not just the list.
    expect(healed.openIssues).toBeLessThan(seed.openIssues);
    expect(healed.protectedAssets).toBeGreaterThanOrEqual(seed.protectedAssets);

    // Resolving an OPEN alert drops the open-alert count by exactly one.
    const openAlert = getOpenAlerts().find((a) => a.state === "open");
    expect(openAlert).toBeDefined();
    const withAlert = getFleetStats(undefined, {
      alertOverrides: {
        [openAlert!.id]: { state: "resolved", resolvedAt: "2026-06-25T00:00:00Z" },
      },
    });
    expect(withAlert.openAlerts).toBe(seed.openAlerts - 1);
  },
};

/**
 * HealedIssueDrops — regression gate for P2-4: an issue whose every impacted
 * asset was healed this session must drop from the Resolution Center, while a
 * partially-healed issue (one asset still failing) must REMAIN. Tests the pure
 * overlay the center applies on read (hydration-gated), directly.
 */
export const HealedIssueDrops: Story = {
  play: async () => {
    const all = getIssues();
    const issue = all.find((i) => i.impactedAssetIds.length > 0);
    expect(issue).toBeDefined();
    const heal = () => ({
      status: "protected" as const,
      resolvedAt: "2026-06-24T00:00:00Z",
    });

    // Every impacted asset healed → the issue drops.
    const fullyHealed = Object.fromEntries(
      issue!.impactedAssetIds.map((id) => [id, heal()]),
    );
    expect(
      applyIssueResolution(all, fullyHealed).some((i) => i.id === issue!.id),
    ).toBe(false);

    // No relevant override → the issue stays.
    expect(
      applyIssueResolution(all, {}).some((i) => i.id === issue!.id),
    ).toBe(true);

    // Partial heal (a synthetic issue with one still-failing asset) → stays.
    const synthetic = {
      ...issue!,
      impactedAssetIds: [...issue!.impactedAssetIds, "AST-NEVER-HEALED"],
    };
    expect(
      applyIssueResolution([synthetic], fullyHealed).some(
        (i) => i.id === synthetic.id,
      ),
    ).toBe(true);
  },
};
