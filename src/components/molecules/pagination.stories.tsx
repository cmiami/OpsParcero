import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within, userEvent, fn } from "storybook/test";
import { useState } from "react";
import { Pagination } from "./pagination";

const meta = {
  title: "Molecules/Pagination",
  component: Pagination,
  tags: ["autodocs"],
  argTypes: {
    page: { control: { type: "number", min: 1 } },
    pageCount: { control: { type: "number", min: 1 } },
    onPageChange: { control: false },
  },
  parameters: { layout: "centered" },
} satisfies Meta<typeof Pagination>;
export default meta;
type Story = StoryObj<typeof meta>;

export const FirstPage: Story = {
  args: { page: 1, pageCount: 12, onPageChange: fn() },
};

export const MidPage: Story = {
  args: { page: 6, pageCount: 12, onPageChange: fn() },
};

export const LastPage: Story = {
  args: { page: 12, pageCount: 12, onPageChange: fn() },
};

export const SinglePage: Story = {
  args: { page: 1, pageCount: 1, onPageChange: fn() },
};

export const Interactive: Story = {
  args: { page: 1, pageCount: 8, onPageChange: fn() },
  render: (args) => {
    const Live = () => {
      const [page, setPage] = useState(args.page);
      return <Pagination page={page} pageCount={args.pageCount} onPageChange={setPage} />;
    };
    return <Live />;
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Next page" }));
    await expect(
      canvas.getByRole("button", { name: "Page 2" }),
    ).toHaveAttribute("aria-current", "page");
  },
};
