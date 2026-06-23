import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import {
  ShieldCheck,
  AlertTriangle,
  XCircle,
  OctagonAlert,
  PauseCircle,
  RefreshCw,
  CloudOff,
  WifiOff,
  Server,
  HardDrive,
  Database,
  Cloud,
  Shield,
  History,
  RotateCcw,
  Camera,
  Building2,
  Monitor,
  Play,
  StopCircle,
  Undo2,
  Check,
  Plus,
  Trash2,
  Pencil,
  Copy,
  Download,
  Upload,
  Link,
  ExternalLink,
  Settings,
  Filter,
  Columns3,
  Search,
  ChevronDown,
  ChevronRight,
  X,
  Menu,
  MoreHorizontal,
  MoreVertical,
  Bell,
  User,
  LogOut,
  Moon,
  Sun,
  type LucideIcon,
} from "lucide-react";

/**
 * Foundations / Icons — the in-use lucide set, grouped by role and rendered at
 * 16px (the product's default line-icon size). Icons inherit `currentColor`, so
 * color comes from the surrounding text token (M1). The spinning RefreshCw demo
 * shows the syncing affordance via `animate-spin`.
 */

type Entry = { name: string; Icon: LucideIcon };
type Group = { title: string; icons: Entry[] };

const GROUPS: Group[] = [
  {
    title: "Status",
    icons: [
      { name: "ShieldCheck", Icon: ShieldCheck },
      { name: "AlertTriangle", Icon: AlertTriangle },
      { name: "XCircle", Icon: XCircle },
      { name: "OctagonAlert", Icon: OctagonAlert },
      { name: "PauseCircle", Icon: PauseCircle },
      { name: "RefreshCw", Icon: RefreshCw },
      { name: "CloudOff", Icon: CloudOff },
      { name: "WifiOff", Icon: WifiOff },
    ],
  },
  {
    title: "Domain",
    icons: [
      { name: "Server", Icon: Server },
      { name: "HardDrive", Icon: HardDrive },
      { name: "Database", Icon: Database },
      { name: "Cloud", Icon: Cloud },
      { name: "Shield", Icon: Shield },
      { name: "History", Icon: History },
      { name: "RotateCcw", Icon: RotateCcw },
      { name: "Camera", Icon: Camera },
      { name: "Building2", Icon: Building2 },
      { name: "Monitor", Icon: Monitor },
    ],
  },
  {
    title: "Actions",
    icons: [
      { name: "Play", Icon: Play },
      { name: "StopCircle", Icon: StopCircle },
      { name: "Undo2", Icon: Undo2 },
      { name: "Check", Icon: Check },
      { name: "Plus", Icon: Plus },
      { name: "Trash2", Icon: Trash2 },
      { name: "Pencil", Icon: Pencil },
      { name: "Copy", Icon: Copy },
      { name: "Download", Icon: Download },
      { name: "Upload", Icon: Upload },
      { name: "Link", Icon: Link },
      { name: "ExternalLink", Icon: ExternalLink },
      { name: "Settings", Icon: Settings },
      { name: "Filter", Icon: Filter },
      { name: "Columns3", Icon: Columns3 },
      { name: "Search", Icon: Search },
    ],
  },
  {
    title: "Chrome",
    icons: [
      { name: "ChevronDown", Icon: ChevronDown },
      { name: "ChevronRight", Icon: ChevronRight },
      { name: "X", Icon: X },
      { name: "Menu", Icon: Menu },
      { name: "MoreHorizontal", Icon: MoreHorizontal },
      { name: "MoreVertical", Icon: MoreVertical },
      { name: "Bell", Icon: Bell },
      { name: "User", Icon: User },
      { name: "LogOut", Icon: LogOut },
      { name: "Moon", Icon: Moon },
      { name: "Sun", Icon: Sun },
    ],
  },
];

function Icons() {
  return (
    <div className="flex flex-col gap-8 p-4">
      {GROUPS.map((group) => (
        <section key={group.title} className="flex flex-col gap-3">
          <h3 className="text-[10px] font-bold uppercase tracking-[0.07em] text-faint-foreground">
            {group.title}
          </h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {group.icons.map(({ name, Icon }) => (
              <div
                key={name}
                className="flex items-center gap-3 rounded-md border border-border bg-card px-3 py-2"
              >
                <Icon className="size-4 shrink-0 text-card-foreground" aria-hidden="true" />
                <span className="truncate font-mono text-xs text-muted-foreground">
                  {name}
                </span>
              </div>
            ))}
          </div>
        </section>
      ))}

      <section className="flex flex-col gap-3">
        <h3 className="text-[10px] font-bold uppercase tracking-[0.07em] text-faint-foreground">
          Spin demo (syncing affordance)
        </h3>
        <div className="flex w-fit items-center gap-3 rounded-md border border-border bg-status-syncing-tint px-3 py-2">
          <RefreshCw className="size-4 animate-spin text-status-syncing" aria-hidden="true" />
          <span className="text-sm text-card-foreground">
            Syncing — <code className="font-mono">RefreshCw</code> +{" "}
            <code className="font-mono">animate-spin</code>
          </span>
        </div>
      </section>
    </div>
  );
}

const meta: Meta = {
  title: "Foundations/Icons",
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
    controls: { disable: true },
  },
};

export default meta;
type Story = StoryObj;

export const Set: Story = {
  render: () => <Icons />,
};
