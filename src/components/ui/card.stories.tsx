import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "./card";

const meta = {
  title: "Atoms/Card",
  component: Card,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
} satisfies Meta<typeof Card>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Card className="w-80">
      <CardHeader>
        <CardTitle>SIRIS-NYC-01</CardTitle>
        <CardDescription>Model S5-4 · 8.0 TB ZFS pool</CardDescription>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        Last screenshot verification passed 12 minutes ago. Inverse Chain is
        healthy across all protected agents.
      </CardContent>
    </Card>
  ),
};

export const WithFooter: Story = {
  render: () => (
    <Card className="w-80">
      <CardHeader>
        <CardTitle>Offsite Sync</CardTitle>
        <CardDescription>btru-fs1 → mothership.dtc.datto.com</CardDescription>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        412 GB queued at 25 Mbps. Estimated completion in 3 hours.
      </CardContent>
      <CardFooter className="text-xs text-faint-foreground">
        Updated 5 minutes ago
      </CardFooter>
    </Card>
  ),
};

export const TitleOnly: Story = {
  render: () => (
    <Card className="w-80">
      <CardHeader>
        <CardTitle>Recovery Launchpad</CardTitle>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        Target: datto-cloud
      </CardContent>
    </Card>
  ),
};
