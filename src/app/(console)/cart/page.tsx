import { ActionCart } from "@/components/organisms/automation/action-cart";

export const metadata = { title: "Action cart · Kaseya Resolution Center" };

/** The action cart as a full page — review the chain, scope it, dispatch. */
export default function CartPage() {
  return (
    <div className="mx-auto max-w-3xl p-6">
      <header className="mb-4">
        <h1 className="font-display text-xl font-bold tracking-tight">
          Action cart
        </h1>
        <p className="text-sm text-muted-foreground">
          Review the remediation chain, set its scope, and dispatch — or save it
          as a playbook.
        </p>
      </header>
      <ActionCart inline />
    </div>
  );
}
