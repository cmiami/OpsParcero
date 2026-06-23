import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within, userEvent } from "storybook/test";
import { RefreshCw, Trash2, Plus } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable, type BulkAction, type DataTableProps } from "./data-table";
import { selectionColumn } from "./columns";
import { MonoLabel } from "@/components/atoms/mono-label";
import { StatusBadge } from "@/components/atoms/status-badge";
import type { AssetStatus } from "@/types";

// ── Deterministic fixtures (BUILD-CONTRACT §4 — no Date.now / Math.random) ──
interface DemoRow {
  id: string;
  host: string;
  client: string;
  status: AssetStatus;
  seats: number;
}

const ROWS: DemoRow[] = [
  { id: "a1", host: "ACME-DC01", client: "Acme Dental Group", status: "failed", seats: 42 },
  { id: "a2", host: "btru-fs1", client: "Back The Rack Up", status: "warning", seats: 18 },
  { id: "a3", host: "NWND-SQL02", client: "Northwind Traders", status: "syncing", seats: 7 },
  { id: "a4", host: "CONTOSO-FS1", client: "Contoso Health", status: "protected", seats: 96 },
  { id: "a5", host: "NOR-FIPS-APP", client: "Norwalk FIPS", status: "offline", seats: 12 },
  { id: "a6", host: "btru-hv2022", client: "Back The Rack Up", status: "paused", seats: 4 },
];

const COLUMNS: ColumnDef<DemoRow>[] = [
  selectionColumn<DemoRow>(),
  {
    accessorKey: "host",
    header: "Asset",
    meta: { label: "Asset" },
    cell: ({ row }) => <MonoLabel>{row.original.host}</MonoLabel>,
  },
  {
    accessorKey: "client",
    header: "Client",
    meta: { label: "Client" },
  },
  {
    accessorKey: "status",
    header: "Status",
    meta: { label: "Status" },
    cell: ({ row }) => <StatusBadge state={row.original.status} size="sm" />,
  },
  {
    accessorKey: "seats",
    header: "Seats",
    meta: { label: "Seats", numeric: true },
  },
];

const BULK_ACTIONS: BulkAction<DemoRow>[] = [
  { id: "retry", label: "Retry", icon: RefreshCw, onClick: () => {} },
  { id: "cart", label: "Add to cart", icon: Plus, onClick: () => {} },
  { id: "remove", label: "Remove", icon: Trash2, destructive: true, onClick: () => {} },
];

const meta = {
  title: "Organisms/DataTable",
  component: DataTable,
  tags: ["autodocs"],
  argTypes: {
    density: { control: "inline-radio", options: ["default", "compact"] },
    enableSelection: { control: "boolean" },
    stickyFirstColumn: { control: "boolean" },
    columnPicker: { control: "boolean" },
    isLoading: { control: "boolean" },
    error: { control: "text" },
    data: { control: false },
    columns: { control: false },
  },
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof DataTable>;
export default meta;
type Story = StoryObj<DataTableProps<DemoRow>>;

export const Default: Story = {
  args: {
    columns: COLUMNS,
    data: ROWS,
    caption: "Demo assets",
  },
};

export const Empty: Story = {
  args: {
    columns: COLUMNS,
    data: [],
    emptyTitle: "No assets match these filters",
    emptyHint: "Try clearing a filter or widening the date range.",
  },
};

export const Loading: Story = {
  args: {
    columns: COLUMNS,
    data: [],
    isLoading: true,
    loadingRows: 6,
  },
};

export const Error: Story = {
  args: {
    columns: COLUMNS,
    data: [],
    error: "The fleet service timed out. Filters and selection are preserved.",
    onRetry: () => {},
  },
};

export const WithRowSelected: Story = {
  args: {
    columns: COLUMNS,
    data: ROWS,
    enableSelection: true,
    bulkActions: BULK_ACTIONS,
    caption: "Demo assets",
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const checkbox = canvas.getByLabelText("Select row 1");
    await userEvent.click(checkbox);
    const toolbar = await canvas.findByRole("toolbar", { name: "bulk actions" });
    await expect(toolbar).toBeInTheDocument();
    await expect(within(toolbar).getByText("1 selected")).toBeInTheDocument();
  },
};

export const SortedBySeverity: Story = {
  args: {
    columns: COLUMNS,
    data: ROWS,
    defaultSort: [{ id: "status", desc: false }],
    caption: "Demo assets sorted by status",
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const sortBtn = canvas.getByRole("button", { name: /Seats/ });
    await userEvent.click(sortBtn);
    const header = sortBtn.closest("th");
    await expect(header).toHaveAttribute("aria-sort", "ascending");
  },
};

export const CompactDensity: Story = {
  args: {
    columns: COLUMNS,
    data: ROWS,
    density: "compact",
    caption: "Demo assets (compact)",
  },
};

export const ColumnPickerOpen: Story = {
  args: {
    columns: COLUMNS,
    data: ROWS,
    columnPicker: true,
    caption: "Demo assets",
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Columns" }));
  },
};

export const StickyFirstColumn: Story = {
  args: {
    columns: COLUMNS,
    data: ROWS,
    enableSelection: true,
    stickyFirstColumn: true,
    bulkActions: BULK_ACTIONS,
    caption: "Demo assets",
  },
};
