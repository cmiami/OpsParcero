import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within, userEvent } from "storybook/test";
import { MonoLabel } from "./mono-label";

const meta = {
  title: "Atoms/MonoLabel",
  component: MonoLabel,
  tags: ["autodocs"],
  argTypes: {
    children: { control: "text" },
    copyable: { control: "boolean" },
    title: { control: "text" },
  },
  parameters: { layout: "centered" },
} satisfies Meta<typeof MonoLabel>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Host: Story = { args: { children: "btru-hv2022" } };

export const ErrorCode: Story = { args: { children: "0x0000007B" } };

export const Size: Story = { args: { children: "8.0 TB" } };

export const Copyable: Story = {
  args: { children: "00D5x000001", copyable: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const btn = canvas.getByRole("button", { name: "Copy" });
    await expect(btn).toBeInTheDocument();
    await userEvent.click(btn);
  },
};

export const Truncated: Story = {
  args: {
    children: "ACME-TERMINALSRV01",
    title: "ACME-TERMINALSRV01 (hostname > 15 chars → cosmetic screenshot case)",
    copyable: true,
    className: "max-w-36",
  },
};

export const Gallery: Story = {
  args: { children: "btru-fs1" },
  render: () => (
    <div className="flex flex-wrap items-center gap-2">
      <MonoLabel>NWND-SQL02</MonoLabel>
      <MonoLabel>AADSTS500014</MonoLabel>
      <MonoLabel>stop 0x7B</MonoLabel>
      <MonoLabel>3260</MonoLabel>
      <MonoLabel copyable>sf-org-prod</MonoLabel>
    </div>
  ),
};
