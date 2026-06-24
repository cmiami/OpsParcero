import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, within, userEvent } from "storybook/test";
import * as React from "react";
import { ApplyScopeControl } from "./apply-scope-control";
import type { ActionScope } from "@/types";

const meta = {
  title: "Molecules/ApplyScopeControl",
  component: ApplyScopeControl,
  tags: ["autodocs"],
  argTypes: {
    value: {
      control: "radio",
      options: ["once", "all-matching", "always"],
    },
    matchCount: { control: { type: "number" } },
    disabled: { control: "boolean" },
    onChange: { table: { disable: true } },
  },
  parameters: { layout: "centered" },
} satisfies Meta<typeof ApplyScopeControl>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Controlled wrapper so the radio reflects clicks in stories. */
function Controlled({
  initial,
  matchCount,
  disabled,
}: {
  initial: ActionScope;
  matchCount?: number;
  disabled?: boolean;
}) {
  const [value, setValue] = React.useState<ActionScope>(initial);
  return (
    <div className="w-80">
      <ApplyScopeControl
        value={value}
        onChange={setValue}
        matchCount={matchCount}
        disabled={disabled}
      />
    </div>
  );
}

export const Once: Story = {
  args: { value: "once", matchCount: 14, onChange: fn() },
  render: () => <Controlled initial="once" matchCount={14} />,
};

export const AllMatching: Story = {
  args: { value: "all-matching", matchCount: 14, onChange: fn() },
  render: () => <Controlled initial="all-matching" matchCount={14} />,
};

export const Always: Story = {
  args: { value: "always", matchCount: 14, onChange: fn() },
  render: () => <Controlled initial="always" matchCount={14} />,
};

export const Disabled: Story = {
  args: { value: "once", matchCount: 14, disabled: true, onChange: fn() },
  render: () => <Controlled initial="once" matchCount={14} disabled />,
};

export const SelectScope: Story = {
  args: { value: "once", matchCount: 14, onChange: fn() },
  render: () => <Controlled initial="once" matchCount={14} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const always = canvas.getByLabelText(/Always auto-fix/i);
    await userEvent.click(always);
    await expect(
      canvas.getByText(/runs automatically going forward/i),
    ).toBeInTheDocument();
  },
};
