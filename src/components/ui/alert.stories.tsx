import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Info, OctagonAlert, AlertTriangle, CheckCircle2 } from "lucide-react";

import { Alert, AlertTitle, AlertDescription } from "./alert";

const meta = {
  title: "Atoms/Alert",
  component: Alert,
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: "select",
      options: ["default", "info", "destructive", "warning", "success"],
    },
  },
  parameters: { layout: "centered" },
} satisfies Meta<typeof Alert>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Alert className="w-96">
      <Info aria-hidden />
      <AlertTitle>Outage awareness</AlertTitle>
      <AlertDescription>
        Microsoft 365 is reporting a service incident. Some Spanning backups may
        be delayed.
      </AlertDescription>
    </Alert>
  ),
};

export const Destructive: Story = {
  render: () => (
    <Alert variant="destructive" className="w-96">
      <OctagonAlert aria-hidden />
      <AlertTitle>Backup failed on btru-hv2022</AlertTitle>
      <AlertDescription>
        VSS writer timeout (stop 0x7B). Force Diff Merge to recover the latest
        recovery point.
      </AlertDescription>
    </Alert>
  ),
};

export const Warning: Story = {
  render: () => (
    <Alert variant="warning" className="w-96">
      <AlertTriangle aria-hidden />
      <AlertTitle>OAuth token expiring</AlertTitle>
      <AlertDescription>
        admin@spanningdemo.com needs re-authorization within 3 days.
      </AlertDescription>
    </Alert>
  ),
};

export const Success: Story = {
  render: () => (
    <Alert variant="success" className="w-96">
      <CheckCircle2 aria-hidden />
      <AlertTitle>Screenshot verification passed</AlertTitle>
      <AlertDescription>
        btru-fs1 booted cleanly in the Datto Cloud.
      </AlertDescription>
    </Alert>
  ),
};
