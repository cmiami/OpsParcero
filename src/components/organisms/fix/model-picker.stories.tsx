import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, within, waitFor } from "storybook/test";
import * as React from "react";
import { ModelPicker } from "./model-picker";
import type { ModelInfo, FixModelRef } from "@/lib/fix-client";

const MOCK: ModelInfo = {
  id: "mock-fixer-1",
  provider: "mock",
  label: "Mock Fixer (deterministic)",
  contextWindow: 200_000,
  supportsTools: true,
  local: true,
};

const CLOUD_STRONG: ModelInfo = {
  id: "fix-pro-200k",
  provider: "anthropic",
  label: "Resolution Pro (200K)",
  contextWindow: 200_000,
  supportsTools: true,
  costPer1kIn: 0.003,
  costPer1kOut: 0.015,
};

const CLOUD_FAST: ModelInfo = {
  id: "fix-fast-128k",
  provider: "openai",
  label: "Resolution Fast (128K)",
  contextWindow: 128_000,
  supportsTools: true,
  costPer1kIn: 0.001,
  costPer1kOut: 0.004,
};

const LOCAL_OSS: ModelInfo = {
  id: "fix-local-32k",
  provider: "local",
  label: "On-prem Triager (32K)",
  contextWindow: 32_000,
  supportsTools: true,
  local: true,
};

const meta = {
  title: "Organisms/Fix/ModelPicker",
  component: ModelPicker,
  tags: ["autodocs"],
  argTypes: {
    models: { table: { disable: true } },
    value: { table: { disable: true } },
    onChange: { table: { disable: true } },
    triageValue: { table: { disable: true } },
    onTriageChange: { table: { disable: true } },
    unavailableIds: { control: "object" },
    disabled: { control: "boolean" },
  },
  parameters: { layout: "centered" },
  decorators: [
    (Story) => (
      <div className="w-80">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ModelPicker>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Controlled wrapper so selection reflects in the trigger inside stories. */
function Controlled({
  models,
  initial,
  triageInitial,
  unavailableIds,
  disabled,
}: {
  models: ModelInfo[];
  initial: FixModelRef;
  triageInitial?: FixModelRef;
  unavailableIds?: string[];
  disabled?: boolean;
}) {
  const [value, setValue] = React.useState<FixModelRef>(initial);
  const [triage, setTriage] = React.useState<FixModelRef | undefined>(
    triageInitial,
  );
  return (
    <ModelPicker
      models={models}
      value={value}
      onChange={setValue}
      triageValue={triageInitial ? triage : undefined}
      onTriageChange={triageInitial ? setTriage : undefined}
      unavailableIds={unavailableIds}
      disabled={disabled}
    />
  );
}

/** Offline default — only the deterministic Mock model is on offer. */
export const Default: Story = {
  args: {
    models: [MOCK],
    value: { provider: "mock", model: "mock-fixer-1" },
    onChange: fn(),
  },
  render: () => (
    <Controlled
      models={[MOCK]}
      initial={{ provider: "mock", model: "mock-fixer-1" }}
    />
  ),
};

/** A mixed fleet of cloud + local models (live engine). */
export const WithLocal: Story = {
  args: {
    models: [CLOUD_STRONG, CLOUD_FAST, LOCAL_OSS, MOCK],
    value: { provider: "anthropic", model: "fix-pro-200k" },
    onChange: fn(),
  },
  render: () => (
    <Controlled
      models={[CLOUD_STRONG, CLOUD_FAST, LOCAL_OSS, MOCK]}
      initial={{ provider: "anthropic", model: "fix-pro-200k" }}
    />
  ),
};

/** A model whose provider is missing its key renders disabled, not hidden. */
export const Unavailable: Story = {
  args: {
    models: [CLOUD_STRONG, CLOUD_FAST, MOCK],
    value: { provider: "openai", model: "fix-fast-128k" },
    unavailableIds: ["fix-pro-200k"],
    onChange: fn(),
  },
  render: () => (
    <Controlled
      models={[CLOUD_STRONG, CLOUD_FAST, MOCK]}
      initial={{ provider: "openai", model: "fix-fast-128k" }}
      unavailableIds={["fix-pro-200k"]}
    />
  ),
};

/** The optional triage-vs-planning split — cheaper model triages + verifies. */
export const TriageSplit: Story = {
  args: {
    models: [CLOUD_STRONG, CLOUD_FAST, LOCAL_OSS, MOCK],
    value: { provider: "anthropic", model: "fix-pro-200k" },
    triageValue: { provider: "local", model: "fix-local-32k" },
    onChange: fn(),
    onTriageChange: fn(),
  },
  render: () => (
    <Controlled
      models={[CLOUD_STRONG, CLOUD_FAST, LOCAL_OSS, MOCK]}
      initial={{ provider: "anthropic", model: "fix-pro-200k" }}
      triageInitial={{ provider: "local", model: "fix-local-32k" }}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() =>
      expect(
        canvas.getByText(/Triage \+ verification model/i),
      ).toBeInTheDocument(),
    );
    await expect(
      canvas.getByText(/Planning \+ execution model/i),
    ).toBeInTheDocument();
  },
};
