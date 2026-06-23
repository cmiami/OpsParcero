import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within, userEvent } from "storybook/test";

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "./select";

const meta = {
  title: "Atoms/Select",
  component: Select,
  tags: ["autodocs"],
  argTypes: {
    disabled: { control: "boolean" },
    defaultValue: { control: "text" },
  },
  parameters: { layout: "centered" },
} satisfies Meta<typeof Select>;
export default meta;
type Story = StoryObj<typeof meta>;

const Appliances = (args: React.ComponentProps<typeof Select>) => (
  <Select {...args}>
    <SelectTrigger className="w-60" aria-label="Select appliance">
      <SelectValue placeholder="Select an appliance…" />
    </SelectTrigger>
    <SelectContent>
      <SelectGroup>
        <SelectLabel>SIRIS</SelectLabel>
        <SelectItem value="siris-nyc-01">SIRIS-NYC-01</SelectItem>
        <SelectItem value="siris-nyc-02">SIRIS-NYC-02</SelectItem>
      </SelectGroup>
      <SelectSeparator />
      <SelectGroup>
        <SelectLabel>ALTO</SelectLabel>
        <SelectItem value="alto-s5">ALTO (model S5-4)</SelectItem>
      </SelectGroup>
    </SelectContent>
  </Select>
);

export const Default: Story = { render: (args) => <Appliances {...args} /> };

export const WithDefaultValue: Story = {
  render: (args) => <Appliances {...args} defaultValue="siris-nyc-01" />,
};

export const Disabled: Story = {
  render: (args) => <Appliances {...args} disabled />,
};

export const OpenInteraction: Story = {
  render: (args) => <Appliances {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole("combobox", { name: "Select appliance" });
    await userEvent.click(trigger);
    const option = await within(document.body).findByRole("option", {
      name: "ALTO (model S5-4)",
    });
    await expect(option).toBeInTheDocument();
    await userEvent.click(option);
    await expect(trigger).toHaveTextContent("ALTO (model S5-4)");
  },
};
