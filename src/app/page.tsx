"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

/** Static-export landing — client-redirects to the Resolution Center. */
export default function Home() {
  const router = useRouter();
  React.useEffect(() => {
    router.replace("/resolution");
  }, [router]);
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <Link
        href="/resolution"
        className="text-sm text-muted-foreground underline-offset-4 hover:underline"
      >
        Opening the Resolution Center…
      </Link>
    </div>
  );
}
