/**
 * Tiny zero-dep ANSI helper for the CLI's pretty-printed transcript. Colors are
 * suppressed when stdout is not a TTY or when NO_COLOR is set (https://no-color.org),
 * so piping `fix … > transcript.txt` yields clean, grep-able output.
 */
const enabled =
  process.env.NO_COLOR === undefined && process.stdout.isTTY === true;

type Wrap = (s: string) => string;
const code = (open: number, close: number): Wrap =>
  enabled ? (s: string) => `[${open}m${s}[${close}m` : (s: string) => s;

export const c = {
  bold: code(1, 22),
  dim: code(2, 22),
  red: code(31, 39),
  green: code(32, 39),
  yellow: code(33, 39),
  blue: code(34, 39),
  magenta: code(35, 39),
  cyan: code(36, 39),
  gray: code(90, 39),
};

/** Indent every line of a (possibly multi-line) block by `n` spaces. */
export function indent(text: string, n = 4): string {
  const pad = " ".repeat(n);
  return text
    .split("\n")
    .map((l) => (l.length ? pad + l : l))
    .join("\n");
}
