import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background p-10 text-center">
      <p className="text-2xs font-bold uppercase tracking-eyebrow text-faint-foreground">
        404
      </p>
      <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
        Page not found
      </h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        That route isn&apos;t part of the Resolution Center.
      </p>
      <Button asChild>
        <Link href="/resolution">Back to Resolution Center</Link>
      </Button>
    </div>
  );
}
