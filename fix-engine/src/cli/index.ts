#!/usr/bin/env node
/**
 * fix-engine CLI — drive the remediation harness from the terminal.
 *
 *   fix          [--asset <id>] [--issue <id>] --mode <guided|ai>
 *                [--provider <id>] [--model <m>] [--scope <once|all-matching|always>]
 *                [--dry-run] [--no-approve] [--budget-steps N]
 *   list-models  — every model from every available provider
 *   list-tools   — the tool catalog (name, risk, backend, approval)
 *   replay <transcript.json> — re-print a saved transcript
 *
 * The default provider is `mock`, so a bare `fix` always runs fully offline with
 * no API keys (CI-safe). Real providers activate only when their env key is set.
 */
import { parseArgs } from "node:util";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { runSession } from "../loop/session";
import { defaultRegistry } from "../tools/registry";
import { defaultProviderRegistry } from "../providers/registry";
import { DB } from "../shared/fleet";
import { DEFAULT_BUDGET } from "../loop/budget";
import type { FixMode, FixModelRef, FixSession, FixTranscriptTurn } from "../types";
import type { ProviderId } from "../providers/types";
import type { ActionScope, ProductType, ProtectedAsset } from "../domain";
import { c } from "./term";
import {
  printTurn,
  printSummary,
  printTranscript,
  isSuccessState,
} from "./render";

const PROVIDER_IDS: ProviderId[] = ["anthropic", "openai", "google", "local", "mock"];
const SCOPES: ActionScope[] = ["once", "all-matching", "always"];
const BCDR_PRODUCTS: ProductType[] = ["bcdr", "datto-cloud"];

function die(message: string, code = 1): never {
  process.stderr.write(c.red(`error: ${message}`) + "\n");
  process.exit(code);
}

function isProviderId(v: string): v is ProviderId {
  return (PROVIDER_IDS as string[]).includes(v);
}
function isScope(v: string): v is ActionScope {
  return (SCOPES as string[]).includes(v);
}

/** The default target when `--asset` is omitted: first failed BCDR asset. */
function defaultFailedBcdrAsset(): ProtectedAsset | undefined {
  return (
    DB.assets.find(
      (a) => BCDR_PRODUCTS.includes(a.productType) && a.status === "failed",
    ) ??
    DB.assets.find((a) => BCDR_PRODUCTS.includes(a.productType)) ??
    DB.assets.find((a) => a.status === "failed")
  );
}

// ── usage ────────────────────────────────────────────────────────────────────
const HELP = `fix-engine — AI remediation harness (POC, simulated targets)

Usage:
  fix [options]                         run a fix session (default command)
  list-models                           list models from available providers
  list-tools                            list the tool catalog
  replay <transcript.json>              re-print a saved transcript

fix options:
  --asset <id>        asset to remediate (default: first failed BCDR asset)
  --issue <id>        classified issue id (default: the asset's primary issue)
  --mode <m>          guided | ai                          (default: ai)
  --provider <id>     anthropic | openai | google | local | mock  (default: mock)
  --model <m>         provider-native model id (default: provider's first model)
  --scope <s>         once | all-matching | always         (default: once)
  --dry-run           safe preview — auto-REJECT every approval gate so no
                      gated/destructive action runs (the loop still shows each
                      write's dry-run diff before its gate)
  --no-approve        auto-REJECT approval gates (default: auto-approve)
  --budget-steps <N>  override the max model-step budget
  --json              also dump the final session as JSON to stdout
  -h, --help          show this help

Provider keys (env, never committed): ANTHROPIC_API_KEY, OPENAI_API_KEY
  (+OPENAI_BASE_URL), GOOGLE_API_KEY, LOCAL_BASE_URL/LOCAL_MODEL. With no keys,
  only the offline Mock provider is available — and it is the default.`;

// ── list-models ───────────────────────────────────────────────────────────────
async function cmdListModels(): Promise<number> {
  const reg = defaultProviderRegistry();
  const listings = await reg.listings();
  process.stdout.write(c.bold("Available models\n"));
  for (const p of listings) {
    const flag = p.available ? c.green("● available") : c.gray("○ unavailable (no key)");
    process.stdout.write(`\n${c.bold(p.label)} ${c.dim(`[${p.id}]`)}  ${flag}\n`);
    if (p.models.length === 0) {
      process.stdout.write(c.dim("  (no models)\n"));
      continue;
    }
    for (const m of p.models) {
      const cost =
        m.local || m.costPer1kIn === undefined
          ? c.cyan("local/free")
          : c.dim(`$${m.costPer1kIn}/$${m.costPer1kOut ?? 0} per 1k in/out`);
      const tools = m.supportsTools ? c.green("tools") : c.red("no-tools");
      process.stdout.write(
        `  ${c.bold(m.id.padEnd(22))} ${m.label.padEnd(28)} ` +
          `${c.dim(`${(m.contextWindow / 1000).toFixed(0)}K ctx`)}  ${tools}  ${cost}\n`,
      );
    }
  }
  return 0;
}

// ── list-tools ────────────────────────────────────────────────────────────────
function riskColor(risk: string): string {
  if (risk === "read") return c.green(risk);
  if (risk === "safe-write") return c.yellow(risk);
  return c.red(risk);
}
function cmdListTools(): number {
  const reg = defaultRegistry();
  const handlers = reg.list().sort((a, b) => a.spec.name.localeCompare(b.spec.name));
  process.stdout.write(c.bold(`Tool catalog (${handlers.length})\n\n`));
  for (const h of handlers) {
    const s = h.spec;
    const approval = s.requiresApproval ? c.yellow("approval-required") : c.dim("auto");
    process.stdout.write(
      `${c.bold(s.name.padEnd(26))} ${riskColor(s.risk.padEnd(12))} ` +
        `${c.dim((s.backend ?? "—").padEnd(20))} ${approval}\n`,
    );
    process.stdout.write(c.dim(`  ${s.description}\n`));
  }
  return 0;
}

// ── replay ────────────────────────────────────────────────────────────────────
function cmdReplay(file: string): number {
  if (!file) die("replay requires a path: fix-engine replay <transcript.json>");
  let raw: string;
  try {
    raw = readFileSync(resolve(file), "utf8");
  } catch (e) {
    return die(`cannot read ${file}: ${(e as Error).message}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    return die(`invalid JSON in ${file}: ${(e as Error).message}`);
  }
  // Accept either a full FixSession or a bare FixTranscriptTurn[].
  const session = parsed as Partial<FixSession>;
  const turns = (Array.isArray(parsed)
    ? parsed
    : session.transcript) as FixTranscriptTurn[] | undefined;
  if (!turns) die(`${file} has no transcript (expected FixSession or turn array)`);
  printTranscript(turns);
  if (!Array.isArray(parsed) && session.state) {
    printSummary(parsed as FixSession);
    return isSuccessState(session.state) ? 0 : 1;
  }
  return 0;
}

// ── fix ───────────────────────────────────────────────────────────────────────
interface FixOpts {
  asset?: string;
  issue?: string;
  mode: FixMode;
  provider: ProviderId;
  model?: string;
  scope: ActionScope;
  dryRun: boolean;
  approve: boolean;
  budgetSteps?: number;
  json: boolean;
}

async function cmdFix(opts: FixOpts): Promise<number> {
  const providerReg = defaultProviderRegistry();

  // Resolve the provider — unknown id is a usage error; a missing key is NOT (the
  // registry/loop fall back to Mock so the demo never dead-ends).
  let provider;
  try {
    provider = providerReg.getProvider(opts.provider);
  } catch {
    return die(
      `unknown provider "${opts.provider}" (one of: ${PROVIDER_IDS.join(", ")})`,
    );
  }
  if (!provider.available() && opts.provider !== "mock") {
    process.stderr.write(
      c.yellow(
        `note: provider "${opts.provider}" is not configured (no key) — falling back to mock.\n`,
      ),
    );
    provider = providerReg.getProvider("mock");
  }

  // Resolve the model id: explicit --model, else the provider's first model.
  const providerModels = provider.available() ? await provider.listModels() : [];
  const modelId =
    opts.model ?? providerModels[0]?.id ?? "mock-fixer-1";
  if (opts.model && !providerModels.some((m) => m.id === opts.model)) {
    process.stderr.write(
      c.yellow(
        `note: model "${opts.model}" not listed for ${provider.id}; passing through anyway.\n`,
      ),
    );
  }
  const modelRef: FixModelRef = { provider: provider.id as ProviderId, model: modelId };

  // Resolve the target asset.
  const target = opts.asset
    ? DB.assets.find((a) => a.id === opts.asset)
    : defaultFailedBcdrAsset();
  if (!target) {
    return die(
      opts.asset
        ? `unknown asset "${opts.asset}"`
        : "no assets in the seeded fleet to remediate",
    );
  }
  if (!opts.asset) {
    process.stderr.write(
      c.dim(
        `no --asset given — defaulting to ${target.id} (${target.displayName}, ${target.status}).\n`,
      ),
    );
  }

  // Budget: start from the mode default, optionally override maxSteps.
  const budget =
    opts.budgetSteps !== undefined
      ? { ...DEFAULT_BUDGET[opts.mode], maxSteps: opts.budgetSteps }
      : undefined;

  // Header.
  process.stdout.write(
    c.bold("fix-engine") +
      c.dim(
        ` · ${opts.mode} · ${modelRef.provider}:${modelRef.model} · scope=${opts.scope}` +
          (opts.dryRun ? " · dry-run" : "") +
          (opts.approve ? "" : " · auto-reject") +
          "\n",
      ),
  );
  process.stdout.write(
    c.dim(`target ${target.id} (${target.displayName}, ${target.kind}/${target.productType})\n\n`),
  );

  // Approval resolver: auto-approve unless --no-approve or --dry-run (then
  // auto-reject every gate, so no gated/destructive action mutates anything).
  const allowApprovals = opts.approve && !opts.dryRun;
  const approve = async () =>
    allowApprovals ? ("approve" as const) : ("reject" as const);

  let session: FixSession;
  try {
    session = await runSession(
      {
        assetId: target.id,
        issueId: opts.issue,
        mode: opts.mode,
        model: modelRef,
        scope: opts.scope,
        budget,
      },
      {
        provider,
        registry: defaultRegistry(),
        approve,
        onTurn: (t: FixTranscriptTurn) => printTurn(t),
      },
    );
  } catch (e) {
    return die(`session failed: ${(e as Error).message}`);
  }

  printSummary(session);

  if (opts.json) {
    process.stdout.write("\n" + JSON.stringify(session, null, 2) + "\n");
  }

  return isSuccessState(session.state) ? 0 : 1;
}

// ── arg parsing + dispatch ────────────────────────────────────────────────────
async function main(): Promise<number> {
  const argv = process.argv.slice(2);

  // The first non-flag token is the command; default to `fix`.
  let command = "fix";
  const rest = [...argv];
  if (rest[0] && !rest[0].startsWith("-")) {
    command = rest.shift() as string;
  }

  if (command === "-h" || command === "--help" || command === "help") {
    process.stdout.write(HELP + "\n");
    return 0;
  }

  switch (command) {
    case "list-models":
      return cmdListModels();
    case "list-tools":
      return cmdListTools();
    case "replay":
      return cmdReplay(rest[0] ?? "");
    case "fix":
      break;
    default:
      return die(`unknown command "${command}" — try: fix, list-models, list-tools, replay`);
  }

  // node:util parseArgs has no `--no-<flag>` negation, so normalize it manually:
  // `--no-approve` ⇒ drop the token and remember to flip `approve` to false.
  let approveOverride: boolean | undefined;
  const fixArgs: string[] = [];
  for (const a of rest) {
    if (a === "--no-approve") {
      approveOverride = false;
      continue;
    }
    if (a === "--approve") {
      approveOverride = true;
      continue;
    }
    fixArgs.push(a);
  }

  // Parse `fix` flags.
  let values;
  try {
    ({ values } = parseArgs({
      args: fixArgs,
      allowPositionals: false,
      options: {
        asset: { type: "string" },
        issue: { type: "string" },
        mode: { type: "string", default: "ai" },
        provider: { type: "string", default: "mock" },
        model: { type: "string" },
        scope: { type: "string", default: "once" },
        "dry-run": { type: "boolean", default: false },
        "budget-steps": { type: "string" },
        json: { type: "boolean", default: false },
        help: { type: "boolean", short: "h", default: false },
      },
    }));
  } catch (e) {
    return die((e as Error).message);
  }

  if (values.help) {
    process.stdout.write(HELP + "\n");
    return 0;
  }

  const mode = values.mode as string;
  if (mode !== "guided" && mode !== "ai") {
    return die(`--mode must be "guided" or "ai" (got "${mode}")`);
  }
  const providerArg = values.provider as string;
  if (!isProviderId(providerArg)) {
    return die(`--provider must be one of: ${PROVIDER_IDS.join(", ")} (got "${providerArg}")`);
  }
  const scopeArg = values.scope as string;
  if (!isScope(scopeArg)) {
    return die(`--scope must be one of: ${SCOPES.join(", ")} (got "${scopeArg}")`);
  }

  let budgetSteps: number | undefined;
  if (values["budget-steps"] !== undefined) {
    budgetSteps = Number(values["budget-steps"]);
    if (!Number.isInteger(budgetSteps) || budgetSteps <= 0) {
      return die(`--budget-steps must be a positive integer (got "${values["budget-steps"]}")`);
    }
  }

  return cmdFix({
    asset: values.asset as string | undefined,
    issue: values.issue as string | undefined,
    mode,
    provider: providerArg,
    model: values.model as string | undefined,
    scope: scopeArg,
    dryRun: values["dry-run"] as boolean,
    approve: approveOverride ?? true,
    budgetSteps,
    json: values.json as boolean,
  });
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    process.stderr.write(c.red(`fatal: ${(e as Error).stack ?? String(e)}`) + "\n");
    process.exit(1);
  });
