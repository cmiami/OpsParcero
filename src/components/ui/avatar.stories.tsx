import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { Avatar, AvatarImage, AvatarFallback } from "./avatar";

const meta = {
  title: "Atoms/Avatar",
  component: Avatar,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
} satisfies Meta<typeof Avatar>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Fallback: Story = {
  render: () => (
    <Avatar>
      <AvatarImage src="/broken.png" alt="J. Doe" />
      <AvatarFallback>JD</AvatarFallback>
    </Avatar>
  ),
};

export const Large: Story = {
  render: () => (
    <Avatar className="size-12">
      <AvatarFallback>AC</AvatarFallback>
    </Avatar>
  ),
};

export const Group: Story = {
  render: () => (
    <div className="flex -space-x-2">
      {["JD", "AC", "NW"].map((i) => (
        <Avatar key={i} className="ring-2 ring-card">
          <AvatarFallback>{i}</AvatarFallback>
        </Avatar>
      ))}
    </div>
  ),
};
