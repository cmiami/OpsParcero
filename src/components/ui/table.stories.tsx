import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { ShieldCheck, AlertTriangle, XCircle } from "lucide-react";

import {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
} from "./table";

const meta = {
  title: "Atoms/Table",
  component: Table,
  tags: ["autodocs"],
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof Table>;
export default meta;
type Story = StoryObj<typeof meta>;

const rows = [
  {
    host: "btru-fs1",
    appliance: "SIRIS-NYC-01",
    size: "1.2 TB",
    icon: ShieldCheck,
    label: "Protected",
    dot: "bg-status-protected",
    text: "text-status-protected",
  },
  {
    host: "btru-hv2022",
    appliance: "SIRIS-NYC-01",
    size: "8.0 TB",
    icon: AlertTriangle,
    label: "Warning",
    dot: "bg-status-warning",
    text: "text-status-warning",
  },
  {
    host: "ACME-DC01",
    appliance: "ALTO",
    size: "412 GB",
    icon: XCircle,
    label: "Failed",
    dot: "bg-status-failed",
    text: "text-status-failed",
  },
];

export const Default: Story = {
  render: () => (
    <div className="p-6">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Host</TableHead>
            <TableHead>Appliance</TableHead>
            <TableHead>Protected Size</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => {
            const Icon = r.icon;
            return (
              <TableRow key={r.host}>
                <TableCell className="font-mono">{r.host}</TableCell>
                <TableCell className="font-mono text-muted-foreground">
                  {r.appliance}
                </TableCell>
                <TableCell className="font-mono">{r.size}</TableCell>
                <TableCell>
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      className={`size-2 rounded-full ${r.dot}`}
                      aria-hidden
                    />
                    <Icon className={`size-3.5 ${r.text}`} aria-hidden />
                    <span className={`text-xs font-medium ${r.text}`}>
                      {r.label}
                    </span>
                  </span>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell colSpan={2} className="text-xs">
              3 protected assets
            </TableCell>
            <TableCell colSpan={2} className="font-mono text-xs">
              9.6 TB total
            </TableCell>
          </TableRow>
        </TableFooter>
        <TableCaption>Protected assets on appliance SIRIS-NYC-01.</TableCaption>
      </Table>
    </div>
  ),
};
