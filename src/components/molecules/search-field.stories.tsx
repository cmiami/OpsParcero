import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within, userEvent } from "storybook/test";
import { useState } from "react";
import { SearchField } from "./search-field";

const meta = {
  title: "Molecules/SearchField",
  component: SearchField,
  tags: ["autodocs"],
  argTypes: {
    placeholder: { control: "text" },
    shortcut: { control: "text" },
    value: { control: false },
    onChange: { control: false },
  },
  parameters: { layout: "centered" },
} satisfies Meta<typeof SearchField>;
export default meta;
type Story = StoryObj<typeof meta>;

function Controlled(props: Partial<React.ComponentProps<typeof SearchField>>) {
  const [value, setValue] = useState(props.value ?? "");
  return (
    <div className="w-80">
      <SearchField
        {...props}
        value={value}
        onChange={setValue}
        placeholder={props.placeholder ?? "Search assets, jobs, playbooks…"}
      />
    </div>
  );
}

export const Empty: Story = {
  args: { value: "", onChange: () => {} },
  render: (args) => <Controlled {...args} />,
};

export const Typing: Story = {
  args: { value: "btru-fs1", onChange: () => {} },
  render: (args) => <Controlled {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const box = canvas.getByRole("searchbox");
    await userEvent.clear(box);
    await userEvent.type(box, "SIRIS-NYC-01");
    await expect(box).toHaveValue("SIRIS-NYC-01");
  },
};

export const WithShortcut: Story = {
  args: { value: "", onChange: () => {}, shortcut: "⌘K" },
  render: (args) => <Controlled {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("⌘K")).toBeInTheDocument();
  },
};
