import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Cloud, Server, HardDrive } from "lucide-react";

import { ToggleGroup, ToggleGroupItem } from "./toggle-group";

const meta = {
  title: "Atoms/ToggleGroup",
  component: ToggleGroup,
  tags: ["autodocs"],
  argTypes: {
    type: { control: "select", options: ["single", "multiple"] },
    size: { control: "select", options: ["sm", "default", "lg"] },
  },
  args: { type: "single" },
  parameters: { layout: "centered" },
} satisfies Meta<typeof ToggleGroup>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Single: Story = {
  render: () => (
    <ToggleGroup type="single" defaultValue="bcdr">
      <ToggleGroupItem value="saas" aria-label="SaaS">
        <Cloud aria-hidden />
        SaaS
      </ToggleGroupItem>
      <ToggleGroupItem value="bcdr" aria-label="BCDR">
        <Server aria-hidden />
        BCDR
      </ToggleGroupItem>
      <ToggleGroupItem value="endpoint" aria-label="Endpoint">
        <HardDrive aria-hidden />
        Endpoint
      </ToggleGroupItem>
    </ToggleGroup>
  ),
};

export const Multiple: Story = {
  render: () => (
    <ToggleGroup type="multiple" defaultValue={["failed"]} size="sm">
      <ToggleGroupItem value="failed">Failed</ToggleGroupItem>
      <ToggleGroupItem value="warning">Warning</ToggleGroupItem>
      <ToggleGroupItem value="protected">Protected</ToggleGroupItem>
    </ToggleGroup>
  ),
};
