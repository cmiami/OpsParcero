/**
 * @/lib/status — status / fix / severity / product metadata.
 *
 * Single source of presentation truth for the shared status vocabulary. Maps
 * each enum value to its label, lucide icon, and the token-bound utility classes
 * (BUILD-CONTRACT §3 — never raw colors). Pure data + pure functions; no hooks,
 * so this stays a server-safe module.
 */

import {
  ShieldCheck,
  AlertTriangle,
  XCircle,
  PauseCircle,
  RefreshCw,
  CloudOff,
  CheckCircle2,
  Wrench,
  Lightbulb,
  HelpCircle,
  OctagonAlert,
  Info,
  Cloud,
  Server,
  HardDrive,
  type LucideIcon,
} from "lucide-react";
import type {
  AssetStatus,
  Severity,
  FixType,
  ProductBucket,
} from "@/types";

// ─────────────────────────────────────────────────────────────────────────────
// Asset status
// ─────────────────────────────────────────────────────────────────────────────

export interface StatusMeta {
  label: string;
  icon: LucideIcon;
  /** Solid dot color, e.g. "bg-status-failed". */
  dotClass: string;
  /** Soft tinted background, e.g. "bg-status-failed-tint". */
  tintClass: string;
  /** Text color, e.g. "text-status-failed". */
  textClass: string;
  /** Border color, e.g. "border-status-failed". */
  borderClass: string;
  /** Worst-first severity rank (failed lowest number). */
  order: number;
  /** Syncing → animate-spin the icon. */
  spin?: boolean;
}

/**
 * `order` encodes the sort rank from docs/05 §8:
 * failed > warning > offline > syncing > paused > protected.
 * Lower number = worse = sorts first.
 */
export const STATUS_META: Record<AssetStatus, StatusMeta> = {
  failed: {
    label: "Failed",
    icon: XCircle,
    dotClass: "bg-status-failed",
    tintClass: "bg-status-failed-tint",
    textClass: "text-status-failed",
    borderClass: "border-status-failed",
    order: 0,
  },
  warning: {
    label: "Warning",
    icon: AlertTriangle,
    dotClass: "bg-status-warning",
    tintClass: "bg-status-warning-tint",
    textClass: "text-status-warning",
    borderClass: "border-status-warning",
    order: 1,
  },
  offline: {
    label: "Offline",
    icon: CloudOff,
    dotClass: "bg-status-offline",
    tintClass: "bg-status-offline-tint",
    textClass: "text-status-offline",
    borderClass: "border-status-offline",
    order: 2,
  },
  syncing: {
    label: "Syncing",
    icon: RefreshCw,
    dotClass: "bg-status-syncing",
    tintClass: "bg-status-syncing-tint",
    textClass: "text-status-syncing",
    borderClass: "border-status-syncing",
    order: 3,
    spin: true,
  },
  paused: {
    label: "Paused",
    icon: PauseCircle,
    dotClass: "bg-status-paused",
    tintClass: "bg-status-paused-tint",
    textClass: "text-status-paused",
    borderClass: "border-status-paused",
    order: 4,
  },
  protected: {
    label: "Protected",
    icon: ShieldCheck,
    dotClass: "bg-status-protected",
    tintClass: "bg-status-protected-tint",
    textClass: "text-status-protected",
    borderClass: "border-status-protected",
    order: 5,
  },
};

/** Sort comparator — worst status first (failed → protected). */
export function compareStatus(a: AssetStatus, b: AssetStatus): number {
  return STATUS_META[a].order - STATUS_META[b].order;
}

/**
 * Roll a set of child statuses up to the worst REAL child state.
 * Intentional `paused` never dominates a healthy fleet, but a real `failed`
 * always wins. Empty → "protected".
 */
export function rollupStatus(children: AssetStatus[]): AssetStatus {
  if (children.length === 0) return "protected";
  let worst: AssetStatus = "protected";
  for (const c of children) {
    if (compareStatus(c, worst) < 0) worst = c;
  }
  return worst;
}

// ─────────────────────────────────────────────────────────────────────────────
// Fix classification
// ─────────────────────────────────────────────────────────────────────────────

export interface FixMeta {
  key: FixType;
  label: string;
  icon: LucideIcon;
  textClass: string;
  tintClass: string;
  /** Solid background for the primary fix CTA. */
  solidClass: string;
}

/**
 * full → "End-to-end fix" (green); partial → "Guided fix" (blue);
 * external/manual → "Insights only" (orange); unknown → "Insights only" (gray).
 */
export const FIX_META: Record<FixType, FixMeta> = {
  full: {
    key: "full",
    label: "End-to-end fix",
    icon: CheckCircle2,
    textClass: "text-fix-endtoend",
    tintClass: "bg-fix-endtoend-tint",
    solidClass: "bg-fix-endtoend text-fix-endtoend-foreground",
  },
  partial: {
    key: "partial",
    label: "Guided fix",
    icon: Wrench,
    textClass: "text-fix-guided",
    tintClass: "bg-fix-guided-tint",
    solidClass: "bg-fix-guided text-fix-guided-foreground",
  },
  external: {
    key: "external",
    label: "Insights only",
    icon: Lightbulb,
    textClass: "text-fix-insights",
    tintClass: "bg-fix-insights-tint",
    solidClass: "bg-fix-insights text-fix-insights-foreground",
  },
  manual: {
    key: "manual",
    label: "Insights only",
    icon: Lightbulb,
    textClass: "text-fix-insights",
    tintClass: "bg-fix-insights-tint",
    solidClass: "bg-fix-insights text-fix-insights-foreground",
  },
  unknown: {
    key: "unknown",
    label: "Insights only",
    icon: HelpCircle,
    textClass: "text-fix-unknown",
    tintClass: "bg-fix-unknown-tint",
    solidClass: "bg-fix-unknown text-fix-unknown-foreground",
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Severity
// ─────────────────────────────────────────────────────────────────────────────

export interface SeverityMeta {
  label: string;
  icon: LucideIcon;
  textClass: string;
  tintClass: string;
}

export const SEVERITY_META: Record<Severity, SeverityMeta> = {
  critical: {
    label: "Critical",
    icon: OctagonAlert,
    textClass: "text-critical",
    tintClass: "bg-critical-tint",
  },
  warning: {
    label: "Warning",
    icon: AlertTriangle,
    textClass: "text-warning",
    tintClass: "bg-warning-tint",
  },
  info: {
    label: "Info",
    icon: Info,
    textClass: "text-muted-foreground",
    tintClass: "bg-muted",
  },
  success: {
    label: "Healthy",
    icon: CheckCircle2,
    textClass: "text-success",
    tintClass: "bg-success-tint",
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Product bucket
// ─────────────────────────────────────────────────────────────────────────────

export interface ProductMeta {
  key: ProductBucket;
  label: string;
  icon: LucideIcon;
  textClass: string;
  /** Solid accent, e.g. "bg-product-bcdr". */
  accentClass: string;
}

export const PRODUCT_META: Record<ProductBucket, ProductMeta> = {
  saas: {
    key: "saas",
    label: "SaaS",
    icon: Cloud,
    textClass: "text-product-saas",
    accentClass: "bg-product-saas",
  },
  bcdr: {
    key: "bcdr",
    label: "Datto BCDR",
    icon: Server,
    textClass: "text-product-bcdr",
    accentClass: "bg-product-bcdr",
  },
  endpoint: {
    key: "endpoint",
    label: "Endpoint Backup",
    icon: HardDrive,
    textClass: "text-product-endpoint",
    accentClass: "bg-product-endpoint",
  },
};
