import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within, userEvent } from "storybook/test";

import { RadioGroup, RadioGroupItem } from "./radio-group";
import { Label } from "./label";

const meta = {
  title: "Atoms/RadioGroup",
  component: RadioGroup,
  tags: ["autodocs"],
  argTypes: {
    disabled: { control: "boolean" },
    defaultValue: { control: "text" },
  },
  parameters: { layout: "centered" },
} satisfies Meta<typeof RadioGroup>;
export default meta;
type Story = StoryObj<typeof meta>;

const RecoveryTargets = (args: React.ComponentProps<typeof RadioGroup>) => (
  <RadioGroup defaultValue="local-device" aria-label="Recovery target" {...args}>
    <div className="flex items-center gap-2">
      <RadioGroupItem value="local-device" id="t-local" />
      <Label htmlFor="t-local">Local device (SIRIS-NYC-01)</Label>
    </div>
    <div className="flex items-center gap-2">
      <RadioGroupItem value="datto-cloud" id="t-cloud" />
      <Label htmlFor="t-cloud">Datto Cloud</Label>
    </div>
  </RadioGroup>
);

export const Default: Story = { render: (args) => <RecoveryTargets {...args} /> };

export const Disabled: Story = {
  render: (args) => <RecoveryTargets {...args} disabled />,
};

export const SelectInteraction: Story = {
  render: (args) => <RecoveryTargets {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const cloud = canvas.getByRole("radio", { name: "Datto Cloud" });
    await expect(cloud).not.toBeChecked();
    await userEvent.click(cloud);
    await expect(cloud).toBeChecked();
  },
};
