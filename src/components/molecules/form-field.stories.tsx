import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within } from "storybook/test";
import { FormField } from "./form-field";
import { Input } from "@/components/ui/input";

const meta = {
  title: "Molecules/FormField",
  component: FormField,
  tags: ["autodocs"],
  argTypes: {
    label: { control: "text" },
    htmlFor: { control: "text" },
    required: { control: "boolean" },
    error: { control: "text" },
    helper: { control: "text" },
    disabled: { control: "boolean" },
  },
  args: { children: null },
  parameters: { layout: "centered" },
} satisfies Meta<typeof FormField>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { label: "Appliance name", htmlFor: "fld-default" },
  render: (args) => (
    <div className="w-72">
      <FormField {...args}>
        <Input id={args.htmlFor} placeholder="SIRIS-NYC-01" />
      </FormField>
    </div>
  ),
};

export const Required: Story = {
  args: { label: "Storage pool", htmlFor: "fld-required", required: true },
  render: (args) => (
    <div className="w-72">
      <FormField {...args}>
        <Input id={args.htmlFor} placeholder="ZFS pool" />
      </FormField>
    </div>
  ),
};

export const WithHelper: Story = {
  args: {
    label: "Retention policy",
    htmlFor: "fld-helper",
    helper: "Applies to all matching assets on the next sync.",
  },
  render: (args) => (
    <div className="w-72">
      <FormField {...args}>
        <Input
          id={args.htmlFor}
          aria-describedby={`${args.htmlFor}-helper`}
          placeholder="90 days"
        />
      </FormField>
    </div>
  ),
};

export const Error: Story = {
  args: {
    label: "Admin UPN",
    htmlFor: "fld-error",
    required: true,
    error: "AADSTS90002: tenant not found.",
  },
  render: (args) => (
    <div className="w-72">
      <FormField {...args}>
        <Input
          id={args.htmlFor}
          aria-invalid
          aria-describedby={`${args.htmlFor}-error`}
          defaultValue="admin@spanningdemo.com"
        />
      </FormField>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const alert = canvas.getByRole("alert");
    await expect(alert).toHaveTextContent("AADSTS90002");
  },
};

export const Disabled: Story = {
  args: {
    label: "Locked field",
    htmlFor: "fld-disabled",
    disabled: true,
    helper: "Managed by policy — cannot be edited here.",
  },
  render: (args) => (
    <div className="w-72">
      <FormField {...args}>
        <Input id={args.htmlFor} disabled defaultValue="mothership.dtc.datto.com" />
      </FormField>
    </div>
  ),
};
