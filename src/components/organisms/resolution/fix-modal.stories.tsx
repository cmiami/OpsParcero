import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within, userEvent, waitFor, fn } from "storybook/test";
import { FixModal } from "./fix-modal";
import { Toaster } from "@/components/ui/sonner";
import { getIssues } from "@/mock/query";

const issues = getIssues();
const full = issues.find((i) => i.fixType === "full") ?? issues[0];
const partial = issues.find((i) => i.fixType === "partial") ?? issues[0];
const insights =
  issues.find((i) => i.fixType === "manual" || i.fixType === "external") ??
  issues[0];

const meta = {
  title: "Organisms/FixModal",
  component: FixModal,
  tags: ["autodocs"],
  args: { open: true, onOpenChange: fn() },
  argTypes: {
    open: { control: "boolean" },
    onOpenChange: { table: { disable: true } },
    issue: { table: { disable: true } },
  },
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <>
        <Story />
        <Toaster />
      </>
    ),
  ],
} satisfies Meta<typeof FixModal>;
export default meta;
type Story = StoryObj<typeof meta>;

/** EndToEnd — `full` fix with the once → all → always scope control. */
export const EndToEnd: Story = {
  args: { issue: full },
};

/** Guided — `partial` fix; the apply runs the automatable steps. */
export const Guided: Story = {
  args: { issue: partial },
};

/** InsightsOnly — no automatable action; degrades to a runbook hand-off. */
export const InsightsOnly: Story = {
  args: { issue: insights },
};

/** ConfirmsFix — confirming dispatches the simulated runner and toasts. */
export const ConfirmsFix: Story = {
  args: { issue: full },
  play: async () => {
    const body = within(document.body);
    const confirm = await body.findByRole("button", { name: /Confirm fix/i });
    await userEvent.click(confirm);
    await waitFor(
      async () =>
        expect(await body.findByText(/Fix applied|Fix dispatched|policy/i)).toBeInTheDocument(),
      { timeout: 3000 },
    );
  },
};
