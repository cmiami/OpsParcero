/**
 * Transcript rendering — turns a stream of FixTranscriptTurns into a readable,
 * color-coded terminal transcript. Used live by `fix` (via runSession's onTurn
 * hook) and after-the-fact by `replay`. One function per turn so both paths share
 * exactly the same formatting.
 */
import type { FixTranscriptTurn, FixSession, FixState } from "../types";
import type { ToolResult, StateDiff } from "../tools/types";
import { c, indent } from "./term";

const STATE_COLOR: Partial<Record<FixState, (s: string) => string>> = {
  triaging: c.cyan,
  planning: c.cyan,
  "awaiting-approval": c.yellow,
  executing: c.blue,
  verifying: c.blue,
  succeeded: c.green,
  partial: c.yellow,
  failed: c.red,
  escalated: c.red,
  halted: c.red,
};

function fmtState(state: FixState): string {
  return (STATE_COLOR[state] ?? c.gray)(state);
}

function fmtDiff(diff: StateDiff): string {
  const keys = new Set([
    ...Object.keys(diff.before ?? {}),
    ...Object.keys(diff.after ?? {}),
  ]);
  const lines: string[] = [];
  for (const k of keys) {
    const before = JSON.stringify(diff.before?.[k]);
    const after = JSON.stringify(diff.after?.[k]);
    if (before === after) {
      lines.push(`${c.gray(k)}: ${c.dim(after)}`);
    } else {
      lines.push(`${c.gray(k)}: ${c.red(before)} ${c.dim("→")} ${c.green(after)}`);
    }
  }
  if (diff.note) lines.push(c.dim(`(${diff.note})`));
  return lines.join("\n");
}

function fmtResult(r: ToolResult): string {
  const parts: string[] = [];
  if (r.output) parts.push(r.output);
  if (r.diff) parts.push(c.bold("diff:") + "\n" + indent(fmtDiff(r.diff), 2));
  if (r.opensTicket) parts.push(c.yellow(`ticket opened: ${r.opensTicket}`));
  return parts.join("\n");
}

/** Render exactly one transcript turn to a single (possibly multi-line) string. */
export function renderTurn(t: FixTranscriptTurn): string {
  switch (t.kind) {
    case "status": {
      const label = t.state ? fmtState(t.state) : c.gray("·");
      return `${c.gray("◆")} ${label} ${c.dim(t.text ?? "")}`.trimEnd();
    }
    case "model":
      return `${c.magenta("🤖 model")} ${t.text ?? ""}`;
    case "tool_call": {
      const tc = t.toolCall;
      if (!tc) return c.cyan("→ tool call");
      const input = JSON.stringify(tc.input ?? {});
      return (
        `${c.cyan("→ tool")} ${c.bold(tc.name)}\n` +
        indent(`${c.dim("input:")} ${input}`, 4)
      );
    }
    case "tool_result":
      return t.toolResult
        ? indent(fmtResult(t.toolResult), 4)
        : c.dim("    (no result)");
    case "observation": {
      const head = `${c.yellow("…")} ${t.text ?? ""}`;
      const body = t.toolResult?.diff
        ? "\n" + indent(fmtDiff(t.toolResult.diff), 4)
        : "";
      return head + body;
    }
    case "approval":
      return `${c.yellow("⚖ approval")} ${t.text ?? ""}`;
    case "verification": {
      const head = `${c.green("✓ result")} ${t.text ?? ""}`;
      const body = t.toolResult ? "\n" + indent(fmtResult(t.toolResult), 4) : "";
      return head + body;
    }
    default:
      return c.dim(t.text ?? "");
  }
}

/** Print a turn (live streaming sink for `fix`'s onTurn). */
export function printTurn(t: FixTranscriptTurn): void {
  process.stdout.write(renderTurn(t) + "\n");
}

/** Print the full transcript of a (completed or saved) session. */
export function printTranscript(turns: FixTranscriptTurn[]): void {
  for (const t of turns) printTurn(t);
}

/** Print the terminal summary block for a finished session. */
export function printSummary(session: FixSession): void {
  const r = session.result;
  const usage = session.usage;
  const line = "─".repeat(56);
  process.stdout.write("\n" + c.gray(line) + "\n");
  process.stdout.write(
    `${c.bold("session")} ${session.id}  ${c.dim("mode")}=${session.mode}  ${c.dim("scope")}=${session.scope}\n`,
  );
  process.stdout.write(
    `${c.bold("model")}  ${session.model.provider}:${session.model.model}\n`,
  );
  process.stdout.write(`${c.bold("state")}  ${fmtState(session.state)}\n`);
  if (r) process.stdout.write(`${c.bold("result")} ${r.summary}\n`);
  process.stdout.write(
    c.dim(
      `usage  steps=${usage.steps} toolCalls=${usage.toolCalls} ` +
        `tokens=${usage.inputTokens + usage.outputTokens} ` +
        `(in ${usage.inputTokens} / out ${usage.outputTokens})\n`,
    ),
  );
  if (r?.actionRunIds.length) {
    process.stdout.write(c.dim(`runs   ${r.actionRunIds.join(", ")}\n`));
  }
  process.stdout.write(c.gray(line) + "\n");
}

/** Whether a final state should map to exit code 0 (success/partial) vs 1. */
export function isSuccessState(state: FixState): boolean {
  return state === "succeeded" || state === "partial";
}
