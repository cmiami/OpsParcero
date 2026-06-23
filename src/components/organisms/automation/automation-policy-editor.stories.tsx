import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within, userEvent } from "storybook/test";
import { AutomationPolicyEditor } from "./automation-policy-editor";
import { Toaster } from "@/components/ui/sonner";
import { getPolicies } from "@/mock/query";
import type { AutomationPolicy } from "@/types";

const seeded = getPolicies();
const enabledPolicy: AutomationPolicy | undefined = seeded.find((p) => p.enabled) ?? seeded[0];
const disabledPolicy: AutomationPolicy | undefined =
  seeded.find((p) => !p.enabled) ?? seeded[0];

const meta = {
  title: "Organisms/AutomationPolicyEditor",
  component: AutomationPolicyEditor,
  tags: ["autodocs"],
  argTypes: {
    matchCount: { control: { type: "number" } },
    policy: { table: { disable: true } },
  },
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div className="p-6">
        <Story />
        <Toaster />
      </div>
    ),
  ],
} satisfies Meta<typeof AutomationPolicyEditor>;
export default meta;
type Story = StoryObj<typeof meta>;

/** New — authoring a fresh policy from scratch. */
export const New: Story = {
  args: { matchCount: 22 },
};

/** Editing — an existing enabled policy with stats. */
export const Editing: Story = {
  args: { policy: enabledPolicy, matchCount: 22 },
};

/** AlwaysForwardWarning — the open-ended blast-radius warning is always shown. */
export const AlwaysForwardWarning: Story = {
  args: { matchCount: 140 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByText(/open-ended blast radius/i),
    ).toBeInTheDocument();
  },
};

/** Disabled — a paused policy; kill-switch reads "Paused". */
export const Disabled: Story = {
  args: { policy: disabledPolicy, matchCount: 22 },
};

/** ToggleKillSwitch — flipping the kill-switch announces a status change. */
export const ToggleKillSwitch: Story = {
  args: { matchCount: 22 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const killSwitch = canvas.getByRole("switch", { name: /Kill-switch/i });
    await userEvent.click(killSwitch);
    await expect(killSwitch).toBeChecked();
  },
};
