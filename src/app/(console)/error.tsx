"use client";

import { Button } from "@/components/ui/button";

export default function ConsoleError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-10 text-center">
      <h1 className="font-display text-lg font-bold text-foreground">
        Something went wrong
      </h1>
      <p className="max-w-md text-sm text-muted-foreground">
        This view hit an error{error?.digest ? ` (${error.digest})` : ""}. Retry,
        or head back to the Resolution Center.
      </p>
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
