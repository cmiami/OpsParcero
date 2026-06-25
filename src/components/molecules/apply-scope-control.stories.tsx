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
  allowedScopes,
}: {
  initial: ActionScope;
  matchCount?: number;
  disabled?: boolean;
  allowedScopes?: ActionScope[];
}) {
  const [value, setValue] = React.useState<ActionScope>(initial);
  return (
    <div className="w-80">
      <ApplyScopeControl
        value={value}
        onChange={setValue}
        matchCount={matchCount}
        disabled={disabled}
        allowedScopes={allowedScopes}
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

/**
 * RestrictedToOnceAndAlways — a single-asset surface (engine console) passes
 * allowedScopes to drop "all-matching" it can't fan out across, so it never
 * promises a blast radius it won't deliver (#3).
 */
export const RestrictedToOnceAndAlways: Story = {
  args: { value: "once", matchCount: 14, onChange: fn() },
  render: () => (
    <Controlled initial="once" matchCount={14} allowedScopes={["once", "always"]} />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(canvas.getByLabelText(/Fix this once/i)).toBeInTheDocument();
    expect(canvas.getByLabelText(/Always auto-fix/i)).toBeInTheDocument();
    expect(canvas.queryByLabelText(/Apply to all matching/i)).toBeNull();
  },
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
