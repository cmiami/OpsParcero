"use client";

import { useTheme } from "next-themes";
import { Toaster as Sonner, type ToasterProps } from "sonner";

function Toaster({ ...props }: ToasterProps) {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-popover group-[.toaster]:text-foreground group-[.toaster]:border group-[.toaster]:border-border group-[.toaster]:rounded-md group-[.toaster]:shadow-e2",
          description: "group-[.toast]:text-muted-foreground",
          actionButton:
            "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton:
            "group-[.toast]:bg-subtle group-[.toast]:text-muted-foreground",
          error:
            "group-[.toaster]:bg-critical-tint group-[.toaster]:text-critical-foreground group-[.toaster]:border-critical",
          success:
            "group-[.toaster]:bg-success-tint group-[.toaster]:text-success-foreground group-[.toaster]:border-success",
          warning:
            "group-[.toaster]:bg-warning-tint group-[.toaster]:text-warning-foreground group-[.toaster]:border-warning",
          info: "group-[.toaster]:bg-primary-tint group-[.toaster]:text-foreground group-[.toaster]:border-primary",
        },
      }}
      {...props}
    />
  );
}

export { Toaster };
