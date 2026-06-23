import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within, userEvent } from "storybook/test";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "./tabs";

const meta = {
  title: "Atoms/Tabs",
  component: Tabs,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
} satisfies Meta<typeof Tabs>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Tabs defaultValue="overview" className="w-96">
      <TabsList>
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="recovery-points">Recovery Points</TabsTrigger>
        <TabsTrigger value="history">History</TabsTrigger>
      </TabsList>
      <TabsContent value="overview" className="text-sm text-muted-foreground">
        btru-fs1 protected on SIRIS-NYC-01. Screenshot verification passing.
      </TabsContent>
      <TabsContent
        value="recovery-points"
        className="text-sm text-muted-foreground"
      >
        Latest recovery point captured 12 minutes ago (1.2 TB).
      </TabsContent>
      <TabsContent value="history" className="text-sm text-muted-foreground">
        Diff-merge completed at 03:14 UTC.
      </TabsContent>
    </Tabs>
  ),
};

export const SwitchTab: Story = {
  render: () => (
    <Tabs defaultValue="overview" className="w-96">
      <TabsList>
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="recovery-points">Recovery Points</TabsTrigger>
      </TabsList>
      <TabsContent value="overview">Overview panel</TabsContent>
      <TabsContent value="recovery-points">Recovery points panel</TabsContent>
    </Tabs>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Overview panel")).toBeVisible();
    await userEvent.click(
      canvas.getByRole("tab", { name: "Recovery Points" }),
    );
    await expect(canvas.getByText("Recovery points panel")).toBeVisible();
  },
};
