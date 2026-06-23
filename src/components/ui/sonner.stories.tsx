import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { toast } from "sonner";

import { Toaster } from "./sonner";

const meta = {
  title: "Atoms/Sonner",
  component: Toaster,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
} satisfies Meta<typeof Toaster>;
export default meta;
type Story = StoryObj<typeof meta>;

const TriggerButton = ({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) => (
  <button
    type="button"
    onClick={onClick}
    className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
  >
    {children}
  </button>
);

export const Success: Story = {
  render: () => (
    <div className="flex flex-col items-center gap-3">
      <TriggerButton
        onClick={() =>
          toast.success("Force Diff Merge queued", {
            description: "btru-hv2022 · SIRIS-NYC-01",
          })
        }
      >
        Run end-to-end fix
      </TriggerButton>
      <Toaster />
    </div>
  ),
};

export const Variants: Story = {
  render: () => (
    <div className="flex flex-col items-center gap-2">
      <TriggerButton
        onClick={() => toast.success("Screenshot verification passed")}
      >
        Success
      </TriggerButton>
      <TriggerButton
        onClick={() =>
          toast.error("Backup failed", { description: "VSS writer timeout" })
        }
      >
        Error
      </TriggerButton>
      <TriggerButton
        onClick={() =>
          toast.warning("OAuth token expiring for admin@spanningdemo.com")
        }
      >
        Warning
      </TriggerButton>
      <TriggerButton
        onClick={() =>
          toast.info("Microsoft 365 service incident in progress")
        }
      >
        Info
      </TriggerButton>
      <Toaster />
    </div>
  ),
};
