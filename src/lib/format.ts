/**
 * @/lib/format — deterministic, pure formatters.
 *
 * No `Date.now()` / `new Date()` at module scope or during render (BUILD-CONTRACT
 * §4). Relative time is computed against a fixed `NOW` so stories/screenshots are
 * reproducible. All functions are pure and side-effect free.
 */

import type { ISODateTime } from "@/types";

/** The frozen "current time" for the mock (matches today's seed date). */
export const NOW: ISODateTime = "2026-06-22T14:00:00Z";

const SEC = 1000;
const MIN = 60 * SEC;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const MONTH = 30 * DAY;
const YEAR = 365 * DAY;

/**
 * Compact relative time, e.g. "2h ago", "3d ago", "just now", "in 5m".
 * Deterministic: compares `iso` against `now` (default `NOW`), never wall-clock.
 */
export function relativeTime(iso: ISODateTime, now: ISODateTime = NOW): string {
  const then = Date.parse(iso);
  const ref = Date.parse(now);
  if (Number.isNaN(then) || Number.isNaN(ref)) return "—";

  const diff = ref - then; // positive = in the past
  const future = diff < 0;
  const abs = Math.abs(diff);

  let value: number;
  let unit: string;
  if (abs < 45 * SEC) return "just now";
  if (abs < MIN) {
    value = Math.round(abs / SEC);
    unit = "s";
  } else if (abs < HOUR) {
    value = Math.round(abs / MIN);
    unit = "m";
  } else if (abs < DAY) {
    value = Math.round(abs / HOUR);
    unit = "h";
  } else if (abs < WEEK) {
    value = Math.round(abs / DAY);
    unit = "d";
  } else if (abs < MONTH) {
    value = Math.round(abs / WEEK);
    unit = "w";
  } else if (abs < YEAR) {
    value = Math.round(abs / MONTH);
    unit = "mo";
  } else {
    value = Math.round(abs / YEAR);
    unit = "y";
  }

  return future ? `in ${value}${unit}` : `${value}${unit} ago`;
}

const BYTE_UNITS = ["B", "KB", "MB", "GB", "TB", "PB"] as const;

/**
 * Human byte size with one decimal where it matters: "1.2 TB", "412 GB", "8.0 TB".
 * Uses binary 1024 steps (matches storage/ZFS reporting). Negative → "0 B".
 */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  let value = bytes;
  let i = 0;
  while (value >= 1024 && i < BYTE_UNITS.length - 1) {
    value /= 1024;
    i += 1;
  }
  // Bytes/KB show no decimal; larger units show one.
  const digits = i <= 1 ? 0 : 1;
  return `${value.toFixed(digits)} ${BYTE_UNITS[i]}`;
}

/**
 * Percent with optional precision: formatPercent(0.781) → "78%",
 * formatPercent(78.1, { fromRatio: false, digits: 1 }) → "78.1%".
 * Accepts a 0..1 ratio by default, or a raw 0..100 value via `fromRatio: false`.
 */
export function formatPercent(
  value: number,
  opts: { fromRatio?: boolean; digits?: number } = {},
): string {
  const { fromRatio = value <= 1 && value >= 0, digits = 0 } = opts;
  if (!Number.isFinite(value)) return "—";
  const pct = fromRatio ? value * 100 : value;
  return `${pct.toFixed(digits)}%`;
}

/**
 * Duration from seconds → compact "2h 5m", "45s", "3m 20s", "1d 4h".
 * Shows at most the two largest non-zero units.
 */
export function formatDurationSec(totalSec: number): string {
  if (!Number.isFinite(totalSec) || totalSec < 0) return "—";
  const s = Math.round(totalSec);
  if (s === 0) return "0s";

  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;

  const parts: string[] = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (mins) parts.push(`${mins}m`);
  if (secs) parts.push(`${secs}s`);

  return parts.slice(0, 2).join(" ");
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/**
 * Absolute timestamp, stable across locales: "22 Jun 2026, 14:00".
 * Renders in UTC to stay deterministic (no host-timezone drift in screenshots).
 */
export function formatDateTime(iso: ISODateTime): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return "—";
  const d = new Date(ms);
  const day = d.getUTCDate();
  const month = MONTHS[d.getUTCMonth()];
  const year = d.getUTCFullYear();
  const hh = pad2(d.getUTCHours());
  const mm = pad2(d.getUTCMinutes());
  return `${day} ${month} ${year}, ${hh}:${mm}`;
}
