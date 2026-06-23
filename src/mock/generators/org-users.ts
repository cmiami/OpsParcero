/**
 * @/mock/generators/org-users — step 1–2 of the generation DAG.
 *
 * Builds the single MSP Organization and its 8-person staff (docs/06 §9.2): one
 * admin, one service-manager (can approve), three techs, two NOC analysts, one
 * junior. Stable ids drive ActionRun / audit / approval attribution downstream.
 *
 * Deterministic — draws only from the `org` PRNG stream and the curated pools.
 */

import type { Organization, User, UserId } from "@/types";
import { ORG_NAME, ORG_PARTNER_PORTAL_ID, USER_NAMES } from "../pools";

/** The frozen org id every other entity hangs off. */
export const ORG_ID = "ORG-NWND";

/** Build the one Organization (the MSP running the console). */
export function generateOrg(): Organization {
  return {
    id: ORG_ID,
    name: ORG_NAME,
    partnerPortalId: ORG_PARTNER_PORTAL_ID,
    region: "us-east",
    contract: {
      tier: "Datto365",
      renewalDate: "2027-03-01",
      seatEntitlement: 1200,
      storageEntitlementTB: 240,
    },
    branding: { showPoweredByKaseya: true },
  };
}

/** Derive a stable USR-<localpart> id from a display name. */
function userIdFor(name: string): UserId {
  const local = name.toLowerCase().split(" ")[0][0] + name.toLowerCase().split(" ")[1];
  return `USR-${local}`;
}

/** Derive a mock email from a display name. */
function emailFor(name: string): string {
  const [first, last] = name.toLowerCase().split(" ");
  return `${first[0]}${last}@northwind-it.com`;
}

interface RoleSpec {
  role: User["role"];
  canApprove: boolean;
  density: "comfortable" | "dense";
}

/** Role assignment, in the fixed order of USER_NAMES (deterministic). */
const ROLE_PLAN: RoleSpec[] = [
  { role: "admin", canApprove: true, density: "comfortable" },
  { role: "service-manager", canApprove: true, density: "comfortable" },
  { role: "tech", canApprove: false, density: "dense" },
  { role: "tech", canApprove: false, density: "dense" },
  { role: "tech", canApprove: false, density: "dense" },
  { role: "noc-analyst", canApprove: false, density: "dense" },
  { role: "noc-analyst", canApprove: false, density: "dense" },
  { role: "junior", canApprove: false, density: "comfortable" },
];

/** Build the 8-person staff list. */
export function generateUsers(): User[] {
  return USER_NAMES.map((name, i) => {
    const spec = ROLE_PLAN[i] ?? ROLE_PLAN[ROLE_PLAN.length - 1];
    return {
      id: userIdFor(name),
      orgId: ORG_ID,
      name,
      email: emailFor(name),
      role: spec.role,
      canApprove: spec.canApprove,
      prefs: { density: spec.density, theme: "system" },
    } satisfies User;
  });
}

/** The first user who can approve — default approver for seeded approvals. */
export function defaultApprover(users: User[]): User {
  return users.find((u) => u.canApprove) ?? users[0];
}

/** A round-robin tech picker for attribution (deterministic by index). */
export function techByIndex(users: User[], i: number): User {
  const techs = users.filter((u) => u.role === "tech" || u.role === "noc-analyst");
  const pool = techs.length ? techs : users;
  return pool[i % pool.length];
}
