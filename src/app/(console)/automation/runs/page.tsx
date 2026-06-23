import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { RunHistoryTable } from "@/components/organisms/data-table/run-history-table";
import { AuditLog } from "@/components/organisms/audit-log";

export const metadata = { title: "Run history · Kaseya Resolution Center" };

/** Run history + append-only audit trail of every remediation. */
export default function RunsPage() {
  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-border px-6 py-4">
        <h1 className="font-display text-xl font-bold tracking-tight">
          Run history &amp; audit
        </h1>
        <p className="text-sm text-muted-foreground">
          What ran, on which assets, with what outcome — and the immutable
          who-did-what-when.
        </p>
      </header>
      <div className="min-h-0 flex-1 p-6">
        <Tabs defaultValue="runs" className="flex h-full flex-col gap-4">
          <TabsList>
            <TabsTrigger value="runs">Run history</TabsTrigger>
            <TabsTrigger value="audit">Audit trail</TabsTrigger>
          </TabsList>
          <TabsContent value="runs" className="min-h-0 flex-1">
            <RunHistoryTable />
          </TabsContent>
          <TabsContent value="audit" className="min-h-0 flex-1">
            <AuditLog />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
