import { ActionCart } from "@/components/organisms/automation/action-cart";
import { PageShell } from "@/components/templates/page-shell";

export const metadata = { title: "Action cart · Kaseya Resolution Center" };

/** The action cart as a full page — review the chain, scope it, dispatch. */
export default function CartPage() {
  return (
    <PageShell
      title="Action cart"
      description="Review the remediation chain, set its scope, and dispatch — or save it as a playbook."
      scroll
    >
      <div className="mx-auto max-w-3xl">
        <ActionCart inline />
      </div>
    </PageShell>
  );
}
