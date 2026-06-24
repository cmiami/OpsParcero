import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within } from "storybook/test";
import { PageShell } from "./page-shell";
import { Button } from "@/components/ui/button";

const meta = {
  title: "Templates/PageShell",
  component: PageShell,
  tags: ["autodocs"],
  parameters: { layout: "fullscreen" },
  argTypes: {
    title: { control: "text" },
    description: { control: "text" },
    scroll: { control: "boolean" },
    actions: { table: { disable: true } },
    children: { table: { disable: true } },
  },
  decorators: [
    (Story) => (
      <div className="h-[28rem] bg-background">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof PageShell>;
export default meta;
type Story = StoryObj<typeof meta>;

const Filler = () => (
  <div className="rounded-lg border border-dashed border-border bg-card p-6 text-sm text-muted-foreground">
    Page content region — organisms (tables, charts, panels) render here.
  </div>
);

/** Default — title + description above the content region. */
export const Default: Story = {
  args: {
    title: "Run history & audit",
    description:
      "What ran, on which assets, with what outcome — and the immutable who-did-what-when.",
    children: <Filler />,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("heading", { name: "Run history & audit" }),
    ).toBeInTheDocument();
  },
};

/** WithActions — a right-aligned header slot (e.g. export / new). */
export const WithActions: Story = {
  args: {
    title: "Reports",
    description: "Recurring-failure trends, SLA/RPO compliance, automation coverage.",
    actions: (
      <Button size="sm" variant="outline">
        Export
      </Button>
    ),
    children: <Filler />,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("button", { name: "Export" }),
    ).toBeInTheDocument();
  },
};

/** TitleOnly — no description (a dense surface). */
export const TitleOnly: Story = {
  args: { title: "Alerts", children: <Filler /> },
};

/** Scrolling — a long, free-flowing page scrolls its content region. */
export const Scrolling: Story = {
  args: {
    title: "Reports",
    description: "Scroll the content region.",
    scroll: true,
    contentClassName: "space-y-4",
    children: (
      <>
        {Array.from({ length: 8 }, (_, i) => (
          <Filler key={i} />
        ))}
      </>
    ),
  },
};
