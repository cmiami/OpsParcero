# 07 — Troubleshooting & Automation Engine

The core differentiator: the remediation action model, action chaining, scope semantics (once / all matching / always), save-as-playbook, approval gates, dry-run, execution model, run history, and audit trail.

Part of the Kaseya Resolution Center spec set — see [INDEX](INDEX.md).

---

## 1. Philosophy & Design Contract

The Kaseya Resolution Center exists at the moment a backup fails. Everything else — fleet health, dashboards, reports — exists to surface that moment faster. This engine is what happens *inside* that moment: turning a diagnosed failure into a scoped, reversible, auditable, repeatable fix.

Design contract derived from research ([02-automation-ux-research.md](research/02-automation-ux-research.md)):

1. **Dry-run is the default.** Every action with side-effects shows a preview before it mutates anything. The tech flips an explicit switch to apply.
2. **Detection is a free dry-run.** Preconditions evaluate against real context; remediation arms only if the condition fires. The tech can deploy detect-only and read "N assets would be affected" before enabling the fix.
3. **Scope is a first-class decision.** Apply once / apply to all matching / apply always are three distinct paths, not an afterthought. The "always" path creates a persistent Policy, not just a repeated run.
4. **Every state is auditable.** Who ran what, against which assets, with which params, at what time, with what outcome — immutable and exportable.
5. **Approvals are risk-tiered.** Low-risk, single-asset, reversible actions can self-approve. High blast-radius or irreversible actions gate on a human. Over-gating breeds approval fatigue; under-gating erodes trust.
6. **Rollback is declared up-front.** Every action either declares a compensating action or is flagged explicitly as non-reversible — shown to the approver before they say yes.

---

## 2. Action Model — `RemediationAction`

An action is the atomic unit: a self-describing, typed, parameterized operation that targets a known asset type, carries its own precondition, and knows how to undo itself.

### 2.1 TypeScript Sketch

```typescript
type ActionCategory =
  | 'diagnostic'     // read-only; collects info, produces output for next step
  | 'remediation'    // mutates state on target asset
  | 'notification'   // sends a message (Slack, email, PSA ticket)
  | 'control-flow';  // If, Switch, ForEach, Wait, Stop — no side effects on assets

type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

type TargetAssetType =
  | 'bcdr-agent'
  | 'bcdr-appliance'
  | 'deb-agent'         // DEB v1
  | 'debv2-agent'       // DEB v2
  | 'saas-protect-org'
  | 'saas-protect-seat'
  | 'spanning-tenant'
  | 'spanning-seat'
  | 'cloud-vm'
  | 'recovery-point';

type ParamType = 'string' | 'number' | 'boolean' | 'enum' | 'duration' | 'cron' | 'filter-query';

interface ActionParam {
  key: string;
  label: string;
  type: ParamType;
  required: boolean;
  defaultValue?: unknown;
  enumValues?: string[];          // when type === 'enum'
  source: 'literal' | 'upstream-ref' | 'runtime-prompt' | 'context';
  // 'context' = auto-populated from the triggering asset (e.g. agentId, deviceId)
  // 'upstream-ref' = references a prior step's output field (dot-notation path)
  // 'runtime-prompt' = tech is asked at run time (shown as a form field in the Execute modal)
  description?: string;
  sensitive?: boolean;            // masked in UI; uses test-credential in dry-run
}

interface CompensatingAction {
  actionId: string;               // the action that reverses this one
  snapshotParam: string;          // the param key that holds the pre-change state snapshot
  description: string;            // human-readable "This will undo X by doing Y"
}

interface RemediationAction {
  id: string;                     // stable, slug-style: 'bcdr.run-force-retention'
  name: string;                   // "Run Force Retention"
  description: string;            // one sentence: what it does and why
  category: ActionCategory;
  targetAssetTypes: TargetAssetType[];

  params: ActionParam[];

  // Precondition — evaluated against real context before executing.
  // If defined and evaluates to false, the action is skipped (not failed).
  // Can be omitted for always-run actions.
  precondition?: {
    expression: string;           // e.g. "asset.storagePctUsed > 80"
    description: string;          // human-readable: "Only runs if pool is above 80% full"
  };

  reversibility: 'reversible' | 'partially-reversible' | 'irreversible';
  compensatingAction?: CompensatingAction;

  riskLevel: RiskLevel;
  requiresApproval: boolean;      // overridable by scope-based auto-gate rules (§6)
  dryRunSupported: boolean;

  // What the tech should see after a successful run
  expectedOutcome: string;        // "Storage pool usage drops below 75% within 10 min"

  estimatedDurationSeconds: number;  // shown as "~2 min" in the UI

  // The products this action applies to
  products: Array<'bcdr' | 'deb' | 'debv2' | 'cloud' | 'saas' | 'spanning'>;

  // Tags for search / filtering the action palette
  tags: string[];

  // Whether Datto's own platform has a native equivalent (informational)
  nativeAutomation?: string;      // e.g. "Datto auto-diff-merge after 5 screenshot failures"

  // Audit metadata (populated by the engine, not the action author)
  createdBy?: string;
  createdAt?: string;
  version: number;                // incremented on any schema/logic change
}
```

### 2.2 Action Categories Explained

| Category | Mutates? | Dry-run behavior | Examples |
|---|---|---|---|
| `diagnostic` | No | Runs normally (read-only) | Query VSS writer status, Show storage consumers, Probe port reachability |
| `remediation` | Yes | Renders payload/commands; no mutation | Run Force Retention, Restart agent service, Re-authorize OAuth |
| `notification` | Yes (external) | Message rendered but not sent | Send Slack alert, Open PSA ticket, Email re-auth link |
| `control-flow` | No | Evaluated normally | If, Switch, ForEach, Wait, Stop |

### 2.3 Risk Level → Default Gate Rules

| Risk | Reversibility | Blast Radius | Default Gate |
|---|---|---|---|
| `low` | reversible | single asset | auto-approve |
| `medium` | reversible or partial | ≤ 10 assets | requires tech confirmation (modal) |
| `high` | any | any | requires approval gate (§6.1) |
| `critical` | irreversible | any | always gates; adds 24h cooldown |

These defaults are overridden by the scope engine (§4): any action with scope `apply-always` auto-escalates to at least `medium` gating regardless of declared risk.

### 2.4 Curated Action Library (Selected)

The library ships with pre-built actions. New actions can be authored by the MSP and shared within their org.

**BCDR**

| Action ID | Name | Risk | Rev? | Dur |
|---|---|---|---|---|
| `bcdr.run-force-retention` | Run Force Retention | medium | reversible | ~5 min |
| `bcdr.reset-vss-writers` | Reset VSS Writers | low | reversible | ~1 min |
| `bcdr.repair-agent-comms` | Repair Agent Communications | medium | reversible | ~2 min |
| `bcdr.run-diff-merge` | Force Differential Merge | medium | irreversible* | ~15–60 min |
| `bcdr.increase-wait-time` | Increase Screenshot Wait Time | low | reversible | instant |
| `bcdr.restart-agent-service` | Restart Agent Service (RMM) | low | reversible | ~1 min |
| `bcdr.resume-offsite-sync` | Resume Off-site Sync | low | reversible | instant |
| `bcdr.raise-transmit-limit` | Raise Transmit Limit | low | reversible | instant |
| `bcdr.unseal-encrypted-agent` | Unseal Encrypted Agent | high | N/A | ~2 min |
| `bcdr.consolidate-snapshots` | Consolidate Stale VMware Snapshots | medium | partially | ~10 min |

*Diff-merge is data-safe but changes the chain structure; cannot be undone.

**DEB / DEB v2**

| Action ID | Name | Risk | Rev? | Dur |
|---|---|---|---|---|
| `deb.restart-services` | Restart Datto Agent Services | low | reversible | ~1 min |
| `deb.apply-av-exclusions` | Apply AV/EDR Exclusion Set | low | reversible | ~2 min |
| `deb.force-hash-revalidate` | Force Hash Cache Re-validation | medium | reversible | ~10 min |
| `deb.set-nonzero-throttle` | Set Non-zero Bandwidth Throttle | low | reversible | instant |
| `deb.toggle-metered-pause` | Toggle Off "Pause on Metered" | low | reversible | instant |

**SaaS Protect**

| Action ID | Name | Risk | Rev? | Dur |
|---|---|---|---|---|
| `saas.launch-oauth-consent` | Launch OAuth Global Admin Consent | high | partially | ~5 min |
| `saas.force-seat-rediscovery` | Force Seat Re-discovery | medium | reversible | ~3 min |
| `saas.enable-auto-add` | Enable Auto-Add for Seat Type | low | reversible | instant |
| `saas.reset-sync-state` | Reset Exchange Sync State | medium | partially | ~5 min |
| `saas.bulk-unseat` | Bulk Unseat Archived Seats | medium | irreversible* | ~2 min |
| `saas.reschedule-backup` | Reschedule to Low-Throttle Window | low | reversible | instant |

*Unseating triggers data retention clock.

**Spanning**

| Action ID | Name | Risk | Rev? | Dur |
|---|---|---|---|---|
| `spanning.reauth-tenant` | Re-authorize Tenant OAuth | high | N/A | ~5 min |
| `spanning.raise-api-cap` | Raise Salesforce API Call Limit | medium | reversible | instant |
| `spanning.disable-dup-rules` | Temporarily Disable Duplicate Rules | high | reversible | ~1 min |
| `spanning.assign-seats` | Assign Seats to Unprotected Users | medium | reversible | ~2 min |
| `spanning.apply-archived-license` | Apply Archived License (retain, no backup) | low | reversible | instant |

---

## 3. Action Chain Model

A chain (also called a **runbook** or **playbook sequence**) is an ordered list of steps — actions plus control-flow operators — that share a run context, pass outputs between steps, and execute on a shared scope.

### 3.1 TypeScript Sketch

```typescript
type StepType =
  | 'action'           // a RemediationAction instance
  | 'if'               // two-branch conditional
  | 'switch'           // ordered multi-branch (first match wins)
  | 'for-each'         // iterate over a set of matching assets
  | 'wait'             // pause N seconds or until condition
  | 'stop'             // abort the chain (optionally with a reason)
  | 'sub-playbook'     // call another saved playbook as a nested unit
  | 'approval-gate';   // pause for human approval before continuing

interface ChainStep {
  stepId: string;
  type: StepType;
  label?: string;                   // optional human-readable label shown on canvas

  // Only when type === 'action'
  actionId?: string;
  params?: Record<string, ChainParamValue>;   // resolved at run time

  // Only when type === 'if'
  condition?: ChainCondition;
  trueBranch?: ChainStep[];
  falseBranch?: ChainStep[];

  // Only when type === 'switch'
  cases?: Array<{ condition: ChainCondition; steps: ChainStep[] }>;
  defaultSteps?: ChainStep[];

  // Only when type === 'for-each'
  iteratesOver?: 'scope-assets' | 'upstream-output-list';
  forEachSteps?: ChainStep[];
  continueOnItemFailure?: boolean;

  // Only when type === 'wait'
  waitSeconds?: number;
  waitUntilCondition?: ChainCondition;

  // Only when type === 'stop'
  stopReason?: string;

  // Only when type === 'sub-playbook'
  playbookId?: string;
  playbookParamBindings?: Record<string, ChainParamValue>;

  // Only when type === 'approval-gate'
  approvalConfig?: ApprovalGateConfig;   // see §6

  // Failure handling for this step
  onFailure: 'fail-chain' | 'skip-step' | 'try-compensate' | 'continue';
  retryCount?: number;                   // 0–3
  retryDelaySeconds?: number;
}

type ChainParamValue =
  | { type: 'literal'; value: unknown }
  | { type: 'context'; path: string }           // e.g. "asset.agentId"
  | { type: 'upstream-ref'; stepId: string; outputPath: string }  // e.g. "step2.result.newRetentionDays"
  | { type: 'runtime-prompt'; paramKey: string };

interface ChainCondition {
  combinator: 'and' | 'or';
  rules: Array<{
    left: ChainParamValue;
    operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'matches' | 'is-null' | 'not-null';
    right: ChainParamValue;
    valueType: 'string' | 'number' | 'boolean' | 'enum';
  }>;
}

interface ActionChain {
  id: string;
  name: string;
  description: string;
  steps: ChainStep[];
  defaultScope: ScopeConfig;    // see §4
  tags: string[];
  version: number;
  isPlaybook: boolean;          // true when saved as a reusable named playbook
  playbookId?: string;          // populated if isPlaybook === true
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  status: 'draft' | 'published';
}
```

### 3.2 Step Type Semantics

**`action`** — executes a `RemediationAction`. Resolves all params at run time from the three sources (literal, context, upstream-ref). Captures pre-change state for compensating action. Emits a structured `StepOutput` that downstream steps can reference.

**`if` (2-branch)** — Use when exactly two paths exist (true/false). The `condition` is a `ChainCondition` evaluated against run-context data (asset fields, upstream outputs). One branch may be empty (acts as a filter/stop for that path). Do not chain two `if` steps to get three outcomes; use `switch` instead.

**`switch` (ordered, first-match)** — Use for 3+ paths. Cases are evaluated left-to-right; the first matching case runs. A `defaultSteps` array handles the no-match case. Order specific rules before general ones.

**`for-each`** — Iterates over either the resolved scope asset set or a list from an upstream step's output. Each iteration is an independent mini-run; `continueOnItemFailure: true` allows partial success.

**`wait`** — Pauses execution for a fixed duration or until a condition evaluates true (polls every 30s). Useful after a restart to wait for the service to be healthy before running a diagnostic check.

**`stop`** — Halts the chain with an optional human-readable reason (shown in run history). Used in false branches of conditions that mean "nothing to do here."

**`sub-playbook`** — Invokes another saved playbook as a nested unit. Params are bound at call time. The sub-playbook runs to completion (success or failure) before the parent continues. Enables the "call once, reuse everywhere" pattern from nested sub-playbooks.

**`approval-gate`** — See §6. Pauses the chain, pushes a context card to the configured channel, and resumes (or aborts) based on the approver's decision.

### 3.3 Step Output Schema

Every step emits an output record stored in the run context and referenceable by downstream steps:

```typescript
interface StepOutput {
  stepId: string;
  status: 'succeeded' | 'failed' | 'skipped' | 'needs-approval';
  startedAt: string;
  completedAt: string;
  durationMs: number;
  result?: Record<string, unknown>;   // action-specific structured payload
  error?: { code: string; message: string; detail?: string };
  // For dry-run: what *would* have changed
  dryRunDiff?: Array<{ field: string; from: unknown; to: unknown }>;
  // Pre-change state snapshot for compensating action
  preChangeSnapshot?: Record<string, unknown>;
}
```

### 3.4 Palette Layout in the Chain Builder UI

The step-picker follows a two-bucket pattern:

```
┌─────────────────────────────────────────────────────────────┐
│  Add Step                                    [Search...]     │
├────────────────────────┬────────────────────────────────────┤
│  ACTIONS               │  CONTROL FLOW                      │
│  ─────────             │  ──────────                        │
│  ○ Diagnostic          │  ⑃  If (2 paths)                  │
│  ○ Remediation         │  ⑄  Switch (N paths)              │
│  ○ Notification        │  ⟲  For-Each                      │
│                        │  ⏱  Wait                          │
│  [Search actions...]   │  ⊗  Stop                          │
│                        │  ↳  Sub-playbook                  │
│                        │  ✋ Approval Gate                  │
└────────────────────────┴────────────────────────────────────┘
```

---

## 4. Scope Model

Scope is a first-class decision the tech makes before any run. It answers: *which assets does this action/chain affect, and for how long going forward?*

### 4.1 TypeScript Sketch

```typescript
type ScopeMode =
  | 'once-this-asset'         // the single asset open in context
  | 'once-selected'           // a static list of assets chosen via multiselect
  | 'once-all-matching'       // filter query evaluated at run time; one batch
  | 'always-matching';        // dynamic group + recurring policy (forward-going)

interface AssetFilter {
  product?: string[];
  clientId?: string[];
  status?: string[];
  tags?: string[];
  lastBackupOlderThanHours?: number;
  storagePctUsedGt?: number;
  customQuery?: string;           // structured filter query (nuqs-serializable)
}

interface ScopeConfig {
  mode: ScopeMode;

  // Populated for 'once-selected'
  selectedAssetIds?: string[];

  // Populated for 'once-all-matching' and 'always-matching'
  filter?: AssetFilter;

  // For 'always-matching': how the recurring policy fires
  policy?: PolicyConfig;
}

interface PolicyConfig {
  id: string;
  name: string;
  // How the trigger fires — event-based (on N consecutive failures) or time-based (cron)
  triggerType: 'consecutive-failures' | 'event-type' | 'cron';
  consecutiveFailureCount?: number;   // e.g. 5 for the auto-diff-merge analogy
  eventType?: string;                 // e.g. 'screenshot-verification-failed'
  cronExpression?: string;            // e.g. '0 2 * * *'
  // Dynamic membership re-evaluated on each trigger
  filter: AssetFilter;
  // The chain to run when the policy fires
  chainId: string;
  // Scope tags for per-tenant RBAC
  scopeTags: string[];
  // Optional approval requirement for each policy invocation
  requiresApproval: boolean;
  // Suppression: don't re-fire within N hours of the last run on the same asset
  suppressWithinHours?: number;
  enabled: boolean;
  createdBy: string;
  createdAt: string;
}
```

### 4.2 The Four Scope Modes in Detail

#### `once-this-asset`

The simplest scope: the action/chain runs once against the single asset currently open in the troubleshooting panel. This is the default when a tech clicks a suggested fix inline.

- Triggered from: the asset detail panel, the "Suggested Fix" card, or the action cart.
- No filter required; the asset ID is passed directly.
- Approval gate optional (depends on action risk level).
- On completion: a run record is created; no ongoing policy.

#### `once-selected`

The tech has used the fleet table's checkbox multiselect to pick 2–N assets. The action/chain is batched across this static list in a single run.

- Triggered from: the fleet table bulk action toolbar after selecting rows.
- Asset IDs are snapshotted at submission time; the set is fixed even if assets change state before the run starts.
- Always shows a "You are about to run X on N assets across M clients" confirmation banner before execute.
- Partial failure (some succeed, some fail) is tracked per-asset in the run record.

#### `once-all-matching`

The tech defines a filter (or accepts a pre-filled suggestion). The filter is evaluated against live asset state at run time to resolve the target set. A **preview count** ("N assets match this filter across M clients") is shown before the tech confirms.

- Triggered from: the Scope picker in the chain builder or the "Apply to all matching" button on a suggested fix card.
- Filter evaluation is a mock query over the in-memory asset store; the resolved list is snapshotted and included in the run record.
- Always requires at minimum a tech confirmation modal (shows the resolved list paginated, with client breakdown).
- If `action.riskLevel >= 'high'` or resolved count > 50 assets, an approval gate is auto-inserted before execution.

#### `always-matching` — the Policy

This is the forward-going auto-remediation mode. It creates a **Policy** record that persists and re-evaluates membership on each trigger.

This directly mirrors Datto's own behavior: auto-diff-merge fires after 5 consecutive screenshot verification failures. In the Care Center, this same logic is modeled as a Policy with `triggerType: 'consecutive-failures'`, `consecutiveFailureCount: 5`, `eventType: 'screenshot-verification-failed'`.

**Policy lifecycle:**

1. Tech configures the trigger condition, filter (dynamic membership), and the chain to run.
2. Policy is saved in `draft` state; must be published separately (change-control model).
3. On publish: an approval gate is always required (regardless of action risk, because the blast radius is open-ended).
4. When the trigger fires: the filter is re-evaluated against current asset state. Newly onboarded assets matching the filter automatically inherit the policy without any manual update.
5. Suppression: if the policy already ran on asset X within `suppressWithinHours`, it is skipped for that asset (to prevent churn loops).
6. Each policy invocation creates a separate run record tied to the policy ID.
7. Policy can be paused, edited (creates a new draft), or deleted (existing run records are retained).

**Canonical example — auto-diff-merge on screenshot failures:**

```
Policy name: "Auto Diff-Merge after 5 Consecutive Screenshot Failures (BCDR)"
Trigger:     consecutive-failures, count=5, eventType='screenshot-verification-failed'
Filter:      product=bcdr, status includes 'warning' or 'failed'
Chain:       [Force Differential Merge] → [Re-run Screenshot] → [Notify on outcome]
Suppress:    72 hours after last run per asset
Scope tags:  [client-id]  ← per-tenant RBAC
Approval:    required on first publish; auto-runs thereafter within trust boundary
```

### 4.3 Scope Picker UI Component

The scope picker is a single segmented control + contextual form, shown in the Execute modal and the chain builder:

```
┌──────────────────────────────────────────────────────────────┐
│  SCOPE                                                       │
│                                                              │
│  ● This asset     ○ Selected (3)   ○ All matching   ○ Always │
│                                                              │
│  [This asset: SIRIS-NYC-PROD-01 (Acme Corp)]                 │
│                                                              │
│  [Dry-run]  [Apply →]                                        │
│                                                              │
│  ℹ Affects 1 asset · Risk: medium · Reversible               │
└──────────────────────────────────────────────────────────────┘
```

When `all-matching` or `always` is selected, the form expands to show the filter builder and a live preview count (debounced 300ms):

```
  ○ All matching
  ├─ Product: [BCDR ▾]   Status: [Warning, Failed ▾]   Client: [All ▾]
  └─ Preview: 14 assets across 7 clients   [View list ↗]

  [Dry-run]  [Apply to 14 assets →]
```

When `always` is selected, an additional Policy configuration panel appears (trigger type, frequency/count, suppression window, name).

---

## 5. Save-as-Playbook

### 5.1 Three Save Tiers

| Tier | What | Versioned? | Callable? | Shareable? |
|---|---|---|---|---|
| **Saved Action** | A single `RemediationAction` with pre-filled params | No | No | Within org |
| **Playbook** | A full `ActionChain` with scope defaults, approval config | Yes (drafts) | Yes (sub-playbook) | Within org |
| **Template** | A parameterized playbook with placeholder variables; seeded by MSP library | Yes | Yes | Cross-org (curated library) |

### 5.2 Playbook Versioning & Change Control

Following a workflow builder' change-control model:

- A **published** playbook is read-only (cannot be edited in place).
- Editing creates a **draft** copy at `version + 1`. Drafts can be tested freely without affecting any live policy.
- Promoting a draft to published requires either a self-approval (for `riskLevel: low`) or a named approver.
- The published version is stamped with `publishedBy`, `publishedAt`, and the full diff from the previous version.
- Previous versions are retained; a rollback to any prior published version is one click.
- Policies reference a specific playbook version. When a new version is published, existing policies continue running the prior version until the policy owner explicitly migrates.

### 5.3 Playbook Schema Additions

```typescript
interface Playbook extends ActionChain {
  isPlaybook: true;
  playbookId: string;
  publishedVersion?: number;
  draftVersion?: number;
  publishedBy?: string;
  publishedAt?: string;
  // Parameterized template variables
  templateParams?: Array<{
    key: string;
    label: string;
    type: ParamType;
    defaultValue?: unknown;
    description: string;
  }>;
  // Which policies are currently bound to this playbook
  boundPolicyIds?: string[];
  // Curated library attribution
  librarySource?: 'datto-care-center' | 'msp-authored';
  libraryCategory?: string;    // e.g. "BCDR / Screenshot Failures"
}
```

### 5.4 Curated MSP Library (Seeded)

The app ships with a read-only library of common playbook templates:

| Template Name | Products | Trigger Pattern |
|---|---|---|
| BCDR Screenshot Failure — Triage & Auto-Merge | BCDR | 5 consec. screenshot failures |
| VSS Writer Reset & Retry | BCDR, DEB, DEB v2 | VSS failure event |
| Agent Comms Repair + Port Probe | BCDR, DEB, DEB v2 | Agent comms failure |
| Storage Full — Force Retention + Alert | BCDR | Pool > 85% |
| Off-site Sync Behind — Resume & Raise Limit | BCDR, Cloud | Sync lag > threshold |
| SaaS OAuth Expired — Bulk Reauth Queue | SaaS Protect | Auth error event |
| Spanning Tenant Reauth + Seat Audit | Spanning | Auth / seat sync error |
| Salesforce API Limit — Raise Cap & Reschedule | Spanning | API exhaustion |
| AV/EDR cbtfilter Block — Exclusion Push + Reboot | DEB v2 | Driver block event |
| DEB Agent Down — Service Restart Runbook | DEB, DEB v2 | Agent offline event |

Templates are duplicated into the MSP's own library before editing; the originals are never modified.

---

## 6. Human-in-the-Loop — Approval Gates

### 6.1 `ApprovalGateConfig` Schema

```typescript
type ApprovalDecision = 'approved' | 'rejected' | 'escalated';

interface ApprovalGateConfig {
  gateId: string;
  label: string;         // shown in the chain step list and in the approval card

  // Who can approve
  requiredRole?: 'tech' | 'senior-tech' | 'account-manager' | 'any';
  specificApproverIds?: string[];   // named individuals

  // Delivery: where the approval card is sent (mock: logs to UI notification center)
  channels: Array<'in-app' | 'slack' | 'teams' | 'email'>;

  // Timeout
  timeoutMinutes: number;           // default 60
  onTimeout: 'auto-reject' | 'auto-escalate' | 'auto-approve';
  escalateTo?: string;              // userId or role

  // What the approver sees in the card
  contextFields: Array<'affected-assets' | 'dry-run-diff' | 'rollback-plan' | 'risk-level' | 'confidence' | 'detection-evidence'>;
  // 'rollback-plan' always included if action has a compensatingAction
}
```

### 6.2 Auto-Gate Injection Rules

The engine auto-inserts an approval gate (before the first mutating step) whenever:

- `scope.mode === 'always-matching'` (any policy creation)
- `scope.mode === 'once-all-matching'` AND resolved asset count > 50
- Any step in the chain has `action.riskLevel === 'critical'`
- Any step in the chain has `action.reversibility === 'irreversible'`
- The chain contains an `saas.launch-oauth-consent` or `spanning.reauth-tenant` action (OAuth is always high-stakes)

The tech can also manually insert additional approval gates at any position in the chain.

### 6.3 Approval Card Content

The approval card renders in the in-app notification center (and optionally posts to Slack/Teams as a rich attachment):

```
┌──────────────────────────────────────────────────────────────┐
│  ✋ Approval Required — "BCDR: Force Retention + Alert"       │
│                                                              │
│  Requested by: Sarah Chen   · 2 min ago                     │
│                                                              │
│  WHAT WILL CHANGE                                            │
│  Run Force Retention on 14 assets (7 clients)               │
│  Estimated duration: ~5 min per asset                        │
│                                                              │
│  DRY-RUN DIFF                                                │
│  SIRIS-NYC-01: retention 30d → 14d; projected space freed 240 GB │
│  SIRIS-CHI-02: retention 60d → 21d; projected space freed 180 GB │
│  … +12 more (View full diff ↗)                              │
│                                                              │
│  RISK  medium · Reversible (undo: restore prior retention)   │
│                                                              │
│  ROLLBACK PLAN                                               │
│  "Restore Retention Settings" — reverts each asset to the   │
│  retention values captured in the pre-change snapshot.       │
│                                                              │
│  [Approve] [Reject] [Escalate]                               │
│                                                              │
│  Auto-rejects in 58 min if no response.                      │
└──────────────────────────────────────────────────────────────┘
```

Context fields shown are determined by `approvalConfig.contextFields`. The rollback plan is always shown if the action has a `compensatingAction`.

### 6.4 Approval Fatigue Mitigation

- Approval gates are **never** auto-inserted for `low`-risk, single-asset, reversible actions. These proceed with a simple confirmation modal (not a gated review).
- A tech's approval of a playbook run does not re-gate the same playbook on the same scope within a configurable trust window (default: 24h). The trust window resets on any scope change or playbook version change.
- Approval decisions are captured with full identity (name, timestamp, decision, comments), not just "someone approved."

---

## 7. Dry-Run & Execute

### 7.1 Dry-Run Guarantee

A dry-run is provably side-effect-free:

- `remediation` and `notification` steps: compute and render the payload/command/API call but do not send or execute. The mock runner intercepts all mutation calls and records them as `dryRunDiff` in the `StepOutput`.
- `diagnostic` steps: execute normally (read-only by definition).
- `control-flow` steps: execute normally (no side effects on assets).
- `approval-gate` steps: skipped (the gate is not sent; dry-run is reported as if approved).
- Sensitive params: use the `testValue` from the mock vault rather than the production value.

The dry-run always produces a **before/after diff** per asset per step:

```
Step 2 · Force Retention [DRY-RUN]
┌─────────────────────────┬──────────┬──────────────┐
│ Asset                   │ Before   │ After (est.) │
├─────────────────────────┼──────────┼──────────────┤
│ SIRIS-NYC-01 (Acme)     │ 30 days  │ 14 days      │
│ SIRIS-CHI-02 (Globex)   │ 60 days  │ 21 days      │
│ …                       │ …        │ …            │
└─────────────────────────┴──────────┴──────────────┘
Est. total space freed: 420 GB across 14 assets
```

### 7.2 Execute Modal Flow

```
┌──────────────────────────────────────────────────────────────┐
│  Execute: "BCDR Storage Full — Force Retention"               │
│                                                              │
│  1. SCOPE                                                    │
│     ● All matching: 14 assets (7 clients)   [Change]         │
│                                                              │
│  2. RUN MODE                                                 │
│     ● Dry-run (preview only)                                 │
│     ○ Apply (make changes)                                   │
│                                                              │
│  3. RUNTIME PARAMS                         (if any)          │
│     Target retention (days): [14]                            │
│                                                              │
│  [Run Dry-run] / [Apply to 14 assets] (grayed until confirmed)│
└──────────────────────────────────────────────────────────────┘
```

Switching from dry-run to apply requires a deliberate toggle, never accidental. The apply button label restates the scope count for confirmation.

For `once-this-asset` low-risk reversible actions, the modal is compressed to a 2-click inline flow (no scope section, just confirm + run).

---

## 8. Execution Engine (Simulated)

### 8.1 Statuses

```typescript
type RunStatus =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'needs-approval'   // paused at an approval gate
  | 'rejected'         // approval was denied
  | 'rolled-back'      // compensation executed and verified
  | 'cancelled';       // tech cancelled before completion
```

### 8.2 Simulated Runner Behavior

The mock runner processes steps sequentially (or per-item for `for-each`). It uses `setTimeout`/`Promise` chains to simulate realistic durations drawn from `action.estimatedDurationSeconds` with ±20% jitter. Status updates are emitted via Zustand store mutations, which drive the optimistic UI.

```typescript
// Pseudocode for the mock runner loop
async function executeChain(run: RunRecord): Promise<void> {
  for (const step of run.chain.steps) {
    run.currentStepId = step.stepId;
    emitRunUpdate(run);

    if (step.type === 'approval-gate') {
      run.status = 'needs-approval';
      emitRunUpdate(run);
      const decision = await waitForApproval(step.approvalConfig);
      if (decision !== 'approved') {
        run.status = decision === 'rejected' ? 'rejected' : 'cancelled';
        return;
      }
      continue;
    }

    const output = await simulateStep(step, run.context, run.isDryRun);
    run.stepOutputs[step.stepId] = output;
    run.context = mergeOutput(run.context, step.stepId, output);

    if (output.status === 'failed') {
      if (step.onFailure === 'fail-chain') {
        run.status = 'failed';
        return;
      }
      // handle skip / compensate / continue per step config
    }
  }
  run.status = 'succeeded';
  emitRunUpdate(run);
}
```

### 8.3 Optimistic UI Patterns

- The run drawer opens immediately on submit, showing `queued` status with a spinner.
- Each step tile transitions: `pending` → `running` (pulse animation in `--primary`) → `succeeded` (dot in `--status-protected`) or `failed` (dot in `--status-failed`).
- Duration countdown shown per step ("~3 min remaining").
- A Sonner toast fires on terminal state (`succeeded` / `failed` / `needs-approval`).
- The fleet table row for affected assets shows a `Syncing` status badge during the run; reverts to the real status on completion.

### 8.4 Partial Failure Handling

For `for-each` and `once-all-matching` runs targeting multiple assets:

- Each asset is treated as an independent sub-run.
- On partial failure, the run status is `succeeded` with a `partialFailure: true` flag and a count (e.g., "12 succeeded, 2 failed").
- Failed-asset sub-runs are listed in the run detail view with their individual error and a "Retry failed only" button.
- Successful assets are not re-run on retry.

### 8.5 Retry Logic

- Configurable per step: `retryCount` (0–3), `retryDelaySeconds`.
- Retry only applies to transient failures (network timeout, service unavailable). Permanent failures (invalid credentials, asset not found) skip retry and fail immediately.
- Each retry attempt is logged as a distinct entry in `StepOutput.retryAttempts`.

### 8.6 Rollback / Undo

1. On a successful apply run, each mutating step's `preChangeSnapshot` is stored in the `RunRecord`.
2. A "Revert this run" button appears in the run detail view for runs where all mutating steps declared a `compensatingAction`.
3. Clicking "Revert" creates a new `RunRecord` with the chain built from compensating actions in **reverse step order**.
4. After compensation completes, the engine re-runs any `diagnostic` steps from the original chain to verify the revert (like re-running screenshot verification after rolling back a wait-time change).
5. If any compensating action fails, the rollback run enters `failed` state with a clear message: "Partial rollback: steps 1–3 reverted; step 4 (Force Retention restore) could not complete — manual intervention required."

---

## 9. Run History & Audit Log

### 9.1 `RunRecord` Schema

```typescript
interface RunRecord {
  runId: string;              // stable UUID
  chainId: string;
  playbookId?: string;        // if run from a saved playbook
  policyId?: string;          // if triggered by a Policy
  name: string;               // chain or playbook name at time of run

  isDryRun: boolean;
  status: RunStatus;

  scope: ScopeConfig;
  resolvedAssetIds: string[]; // snapshotted list of assets targeted

  params: Record<string, unknown>;  // runtime-prompt values used

  startedAt: string;
  completedAt?: string;
  durationMs?: number;

  triggeredBy: 'tech' | 'policy' | 'suggested-fix';
  triggeredByUserId: string;
  approvals?: Array<{
    gateId: string;
    decision: ApprovalDecision;
    decidedBy: string;
    decidedAt: string;
    comments?: string;
  }>;

  stepOutputs: Record<string, StepOutput>;

  // High-level outcome counts (for list view)
  assetsSucceeded: number;
  assetsFailed: number;
  assetsSkipped: number;

  // Rollback linkage
  isRollback?: boolean;
  originalRunId?: string;     // if this is a rollback of another run
  rolledBackBy?: string;      // userId who triggered the rollback
}
```

### 9.2 Two Complementary Views

#### Run History

Shows every execution, including dry-runs. Optimized for a tech investigating "what did this playbook do last time?"

**List columns:** Run name · Triggered by · Date · Scope (summary) · Assets targeted · Outcome · Duration · Dry-run? · Actions

**Detail panel (slide-over):** Full step timeline with individual `StepOutput` records (inputs, outputs, errors, diffs), the resolved asset list, params used, and approval decision chain.

**Filters:** Product · Client/tenant · Playbook · Tech (user) · Status · Date range · Dry-run only / Apply only

#### Audit Trail

Immutable chronological log of every user and system event touching the automation engine. Suitable for SIEM export and client-deliverable reporting. Records are append-only (no updates or deletes in the mock).

```typescript
interface AuditEvent {
  eventId: string;
  timestamp: string;
  eventType:
    | 'run.started' | 'run.completed' | 'run.failed' | 'run.cancelled'
    | 'run.dry-run.started' | 'run.dry-run.completed'
    | 'approval.requested' | 'approval.granted' | 'approval.rejected' | 'approval.escalated'
    | 'playbook.created' | 'playbook.edited' | 'playbook.published' | 'playbook.deleted' | 'playbook.rolled-back'
    | 'policy.created' | 'policy.enabled' | 'policy.disabled' | 'policy.deleted'
    | 'action.executed' | 'action.rolled-back';
  actorId: string;
  actorName: string;
  actorRole: string;
  targetType: 'run' | 'playbook' | 'policy' | 'action' | 'asset';
  targetId: string;
  targetName: string;
  clientId?: string;
  clientName?: string;
  detail: Record<string, unknown>;  // event-specific structured payload
  runId?: string;
  playbookId?: string;
  policyId?: string;
}
```

**Filters:** Event type · Actor · Client/tenant · Target type · Playbook · Policy · Date range

**Export:** CSV and PDF, filtered to current view. CSV includes all fields for SIEM ingestion. PDF is formatted for client-deliverable reports.

### 9.3 Retention

Mock: all run records and audit events are kept in `localStorage` without expiry. In a production system, audit events would be append-only and retained per compliance requirements (minimum 1 year recommended for MSP tooling). Run history may be pruned after 90 days for performance.

---

## 10. Suggested-Remediation Surface

### 10.1 Where Suggestions Appear

Suggestions bridge detection and action. They appear at three surfaces:

1. **Asset detail panel** — "Suggested Fixes" section, shown when one or more known conditions are detected on the asset. This is the primary surface.
2. **Fleet table** — an "Actions" overflow menu on each row with the top suggested fix for that asset's current failure state.
3. **Alert / event feed** — inline on each failure event, a "Fix available" badge that opens the suggestion card.

### 10.2 Suggestion Card

Each suggestion renders as a compact card with enough context to act without drilling deeper:

```
┌──────────────────────────────────────────────────────────────┐
│  💡 Suggested Fix                                            │
│                                                              │
│  Screenshot Failure → Force Differential Merge               │
│  SIRIS-NYC-01 has failed screenshot verification 4 times.   │
│  Diff-merge rebuilds the backup chain from a verified base.  │
│                                                              │
│  Risk: medium · ~25 min · Reversibility: data-safe (irreversible chain change) │
│  Confidence: high (4/5 consecutive failures match pattern)  │
│                                                              │
│  [Dry-run]  [Apply once ↗]  [Apply always…]  [Save as playbook] │
└──────────────────────────────────────────────────────────────┘
```

Fields:
- **Name** — Action or short chain name
- **Rationale** — 1–2 sentences grounded in the detected condition (consecutive count, error code, pattern)
- **Risk, duration, reversibility** — from the action's metadata
- **Confidence** — `low` / `medium` / `high` based on match specificity (exact error code match = high; heuristic pattern = low)
- **Four action buttons**: Dry-run, Apply once, Apply always (opens scope picker pre-filled to `always-matching`), Save as playbook

"Apply always" from a suggestion card pre-fills the Policy config with the trigger that fired the suggestion (e.g., `consecutive-failures: 5, eventType: screenshot-verification-failed`) and opens the scope picker for review before saving.

### 10.3 Suggestion Engine (Mock)

The suggestion engine is a simple rule table keyed on failure conditions. It matches against the asset's current status, last N event types, and product.

```typescript
interface SuggestionRule {
  id: string;
  product: string[];
  matchCondition: {
    eventTypes?: string[];         // recent events
    consecutiveCount?: number;     // N of the same event
    statusIs?: string[];           // current asset status
    errorCodeContains?: string[];
  };
  suggestedChainId: string;       // the action or chain to suggest
  confidence: 'low' | 'medium' | 'high';
  rationale: string;              // template string, interpolated with asset context
}
```

Rules are evaluated in priority order; the top 3 matches are surfaced per asset. Rules are seeded from the failure catalog ([02-failure-catalog.md](02-failure-catalog.md)) mapping failure modes to their canonical remediation actions.

---

## 11. Worked End-to-End Examples

### 11.1 Screenshot Failure → Diff-Merge (BCDR)

**Scenario:** SIRIS-NYC-01 (Acme Corp) has failed screenshot verification 5 times in a row. Datto's own automation would have auto-triggered a diff-merge at this point. The Care Center surfaces this explicitly with full context.

**Step-by-step:**

1. **Detection:** The asset's event log shows 5 consecutive `screenshot-verification-failed` events. The suggestion engine matches `SuggestionRule: "BCDR screenshot → diff-merge"` with `confidence: high`.

2. **Suggestion card** appears in the SIRIS-NYC-01 detail panel:
   > "Screenshot Failure → Force Differential Merge. This asset has failed screenshot verification 5 consecutive times. Diff-merge rebuilds from a verified recovery point. Risk: medium. ~25 min. Data-safe."
   > [Dry-run] [Apply once] [Apply always] [Save as playbook]

3. **Tech clicks Dry-run.** The Execute modal opens in dry-run mode, scope = `once-this-asset`. The runner:
   - Checks precondition: `asset.consecutiveScreenshotFailures >= 5` → true, step will run.
   - Renders the diff: "Force Retention: storage unchanged. Diff-merge: will rebuild chain from recovery point 2026-06-20T02:15Z. Chain structure will change; prior points remain accessible."
   - No API calls sent. Pre-change snapshot captured (current chain head pointer).

4. **Tech reviews dry-run diff** and clicks **Apply.** Mode flips to `apply`. The runner executes `bcdr.run-diff-merge` on SIRIS-NYC-01. Status updates: `queued` → `running` (chain rebuild begins, ~25 min simulated). Sonner toast: "Force Diff-Merge started on SIRIS-NYC-01."

5. **Diff-merge completes.** Chain status → `succeeded`. Runner automatically chains to `bcdr.increase-wait-time` (+5 min) and `bcdr.re-run-screenshot` as the next steps in the suggested chain. Screenshot re-runs after the merge.

6. **Screenshot passes.** Asset status transitions `Failed` → `Protected`. Run record created with full step outputs.

7. **Tech clicks "Apply always"** to prevent recurrence. Policy config pre-filled: trigger = `consecutive-failures: 5, screenshot-verification-failed`, chain = this same diff-merge sequence, filter = `product: bcdr, clientId: acme-corp`. Tech reviews, saves draft, publishes. Approval gate fires (scope is `always-matching`); senior tech approves. Policy is live.

**Run history entry:**

| Field | Value |
|---|---|
| Run name | "Screenshot Failure → Diff-Merge" |
| Triggered by | Sarah Chen (tech) |
| Scope | once-this-asset: SIRIS-NYC-01 |
| Assets targeted | 1 |
| Status | succeeded |
| Duration | 27m 14s |
| Dry-run | No |
| Steps | 3/3 succeeded |

---

### 11.2 Storage Full → Force Retention (BCDR)

**Scenario:** 6 SIRIS appliances across 4 clients are at or above 88% storage utilization. New backups are being skipped.

1. **Suggestion** appears on the fleet table: 6 rows flagged `Warning`/`Failed` (storage). Bulk select all 6. Bulk action toolbar shows "Apply suggested fix: Force Retention."

2. **Execute modal** opens, scope = `once-selected (6 assets)`. Tech sets runtime param: `targetRetentionDays = 14`. Dry-run toggle is ON.

3. **Dry-run** renders per-asset diff:
   ```
   SIRIS-CHI-02 (Globex):  retention 60d → 14d; est. freed: 180 GB
   SIRIS-SEA-01 (Wayne):   retention 90d → 14d; est. freed: 340 GB
   …
   Total est. freed: 1.1 TB across 6 assets
   ```
   Precondition for each: `asset.storagePctUsed > 85` — all 6 pass.

4. **Tech confirms.** Risk = medium, 6 assets. The engine auto-inserts a confirmation modal (not a full approval gate — below the 50-asset threshold and risk is medium, not high). Tech clicks "Apply to 6 assets."

5. **Runner executes** in parallel across all 6 (simulated). All 6 succeed within ~8 min. Pre-change snapshots captured (prior retention values).

6. **Partial failure scenario** (for illustration): SIRIS-DEN-03 fails (`asset.storageIsLocked: true` — currently running a BMR). The run reports `5 succeeded, 1 failed (SIRIS-DEN-03)`. A "Retry failed only" button appears. SIRIS-DEN-03 is excluded from the 5 that succeeded; no re-run risk.

7. **Rollback scenario:** A client objects — they needed the 60-day retention for compliance. Tech clicks "Revert this run" on the run record. The compensating chain (`bcdr.restore-retention-settings`) runs in reverse order for those 5 assets, restoring each to its snapshotted prior value. Re-runs `bcdr.query-storage-status` as a diagnostic to verify the rollback. Audit event logged: `action.rolled-back` with actor, timestamp, and affected assets.

---

### 11.3 OAuth Expired → Re-consent (SaaS Protect)

**Scenario:** A Datto SaaS Protect organization (Initech M365) shows `status: failed`. The event log contains `EWS-to-Graph reauthorization required — Global Admin consent needed before 2026-05-30`.

1. **Suggestion card:**
   > "OAuth Consent Required — Launch Global Admin Consent Flow. The EWS-to-Graph migration requires a new Global Admin consent grant. Exchange backups are paused until this is completed."
   > Confidence: high (known migration event) · Risk: high · Partially reversible · ~5 min

2. **Tech clicks Dry-run.** Because `saas.launch-oauth-consent` is flagged as `risk: high`, the Execute modal requires scope acknowledgement. Dry-run renders: "Would open OAuth consent URL for tenant initech.onmicrosoft.com and await Global Admin approval. No changes made in dry-run mode."

3. **Tech flips to Apply.** Engine auto-inserts an approval gate (rule: `saas.launch-oauth-consent` is always gated). Approval card sent to the senior tech in-app and via Slack (mock):
   > "Approval Required: Launch OAuth Global Admin Consent for Initech (M365). This will open the Microsoft consent screen. An Initech Global Admin must approve. Rollback plan: re-revoke the consent via Microsoft Entra if needed."
   > [Approve] [Reject] [Escalate] · auto-rejects in 60 min

4. **Senior tech approves.** Run resumes. `saas.launch-oauth-consent` step executes (mock: generates a consent URL, marks it as "awaiting admin action," updates the asset record). A follow-up `saas.force-seat-rediscovery` step runs to pick up any seats that were archived during the auth outage.

5. **Post-consent verification:** `saas.verify-exchange-backup` diagnostic step runs; the mock returns `success: true`. Asset status flips `Failed` → `Protected`. Sonner toast: "Initech M365 reauthorized. Exchange backups resumed. 2 archived seats re-discovered."

6. **"Apply always" not applicable here** — OAuth consent is an event-driven one-time action per tenant. Instead, the tech saves the chain as a playbook ("SaaS OAuth Reauth — M365") for faster reuse next time a different tenant hits the same issue.

**Audit trail entries for this run:**

| # | Event | Actor | Detail |
|---|---|---|---|
| 1 | `run.started` | Sarah Chen | runId=abc, isDryRun=false, scope=once-this-asset |
| 2 | `approval.requested` | system | gateId=g1, channel=in-app+slack |
| 3 | `approval.granted` | Mike Torres (Sr. Tech) | decision=approved, comment="Admin notified" |
| 4 | `action.executed` | system | actionId=saas.launch-oauth-consent, assetId=initech-m365 |
| 5 | `action.executed` | system | actionId=saas.force-seat-rediscovery, result=2 seats restored |
| 6 | `run.completed` | system | status=succeeded, durationMs=287000 |

---

## 12. Mock Persistence Model (localStorage)

All engine state is persisted to `localStorage` under a single namespace with versioned keys. Zustand stores hydrate from localStorage on init and sync on every state change.

### 12.1 Key Schema

```
dcc:actions:v1                  → ActionLibrary (RemediationAction[])
dcc:playbooks:v1                → Playbook[]
dcc:policies:v1                 → PolicyConfig[]
dcc:runs:v1                     → RunRecord[]
dcc:audit:v1                    → AuditEvent[]
dcc:cart:v1                     → ActionCart (current in-progress chain being built)
dcc:approval-queue:v1           → PendingApproval[]
```

### 12.2 TypeScript Sketch — localStorage Shape

```typescript
interface LocalStorageSchema {
  'dcc:actions:v1': {
    items: RemediationAction[];
    updatedAt: string;
  };
  'dcc:playbooks:v1': {
    items: Playbook[];
    updatedAt: string;
  };
  'dcc:policies:v1': {
    items: PolicyConfig[];
    updatedAt: string;
  };
  'dcc:runs:v1': {
    items: RunRecord[];
    // Cap at 500 most recent; prune oldest on overflow
    updatedAt: string;
  };
  'dcc:audit:v1': {
    events: AuditEvent[];
    // Append-only; never prune in mock
    updatedAt: string;
  };
  'dcc:cart:v1': CartState;
  'dcc:approval-queue:v1': PendingApproval[];
}

interface CartState {
  steps: ChainStep[];
  scopeConfig: ScopeConfig;
  name: string;
  isDirty: boolean;
  // Drafts: autosaved every 10s if isDirty
  lastAutoSavedAt?: string;
}

interface PendingApproval {
  gateId: string;
  runId: string;
  requestedAt: string;
  requestedBy: string;
  approvalConfig: ApprovalGateConfig;
  status: 'pending' | 'approved' | 'rejected' | 'escalated' | 'timed-out';
  decidedAt?: string;
  decidedBy?: string;
  decision?: ApprovalDecision;
}
```

### 12.3 Zustand Store Structure

```typescript
// Separate stores for each domain, all backed by localStorage middleware

useActionLibraryStore   → { actions, getById, search }
usePlaybookStore        → { playbooks, drafts, publish, rollback }
usePolicyStore          → { policies, enable, disable, create, delete }
useRunStore             → { runs, activeRun, startRun, updateRun, getById }
useAuditStore           → { events, append, query }
useCartStore            → { cart, addStep, removeStep, reorderStep, setScope, clear, saveAsPlaybook }
useApprovalStore        → { queue, request, decide, getById }
```

All stores use the `persist` middleware from `zustand/middleware`, serializing to the keys above. The `audit` store uses a custom append-only middleware that throws if any consumer attempts to overwrite an existing event by ID.

### 12.4 Seed Data

On first load (no `dcc:*` keys in localStorage), the app seeds:

- The full curated action library (§2.4 + additional entries per [02-failure-catalog.md](02-failure-catalog.md))
- The curated playbook template library (§5.4)
- 3 pre-built policies: the auto-diff-merge BCDR policy (enabled), the SaaS OAuth reauth policy (disabled, pending approval), and the DEB v2 AV-exclusion policy (draft)
- 20 synthetic run records spanning the last 30 days across all 6 products (mix of succeeded, failed, needs-approval, dry-run, rollback)
- 40 synthetic audit events corresponding to those runs, plus some playbook-edit and policy-toggle events

Seed data is deterministic (seeded with a fixed pseudo-random seed) so the app presents the same mock state on every fresh install, enabling reproducible Storybook stories and demos.

---

## 13. Open Decisions

1. **Chain builder canvas vs. linear list:** The research cites canvas-based builders. A visual canvas adds fidelity but significant implementation cost. The recommended default is a **linear step list with collapsible branch groups**, upgrading to a canvas in a later phase. Flag in [08-feature-specs.md](08-feature-specs.md).

2. **Policy trigger granularity:** The current model supports `consecutive-failures` and `cron`. A richer event bus (streaming real-time events from the mock data layer) would enable reactive policies (trigger within seconds of a failure, not just on a schedule). This requires a mock event bus — flag for [11-tech-architecture.md](11-tech-architecture.md).

3. **Cross-tenant policy scoping for MSPs:** The `scopeTags` field on `PolicyConfig` is specified but the RBAC enforcement model (who can see/edit policies for which clients) is not yet defined. Flag for [08-feature-specs.md](08-feature-specs.md) and the personas doc ([01-personas-and-jobs.md](01-personas-and-jobs.md)).

4. **Rollback verification:** The spec states the engine re-runs diagnostic steps after compensation. The exact list of verification steps to run per action type needs to be declared in the action library. Currently implied; should be a first-class field on `RemediationAction` (`verificationSteps?: string[]`).
