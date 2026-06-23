import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within } from "storybook/test";
import { ResolutionCenter } from "./resolution-center";
import { Toaster } from "@/components/ui/sonner";

const meta = {
  title: "Organisms/ResolutionCenter",
  component: ResolutionCenter,
  tags: ["autodocs"],
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div className="min-h-screen bg-background">
        <Story />
        <Toaster />
      </div>
    ),
  ],
} satisfies Meta<typeof ResolutionCenter>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Default — the full Resolution Center home: stat bar → cards → charts → groups. */
export const Default: Story = {};

/** RendersSpine — the home title and the issues-by-category section both render. */
export const RendersSpine: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("heading", { name: "Resolution Center" }),
    ).toBeInTheDocument();
    await expect(
      canvas.getByRole("heading", { name: /Issues by category/i }),
    ).toBeInTheDocument();
  },
};
