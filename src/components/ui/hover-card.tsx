"use client";

import * as React from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";

import { cn } from "@/lib/utils";

/**
 * HoverCard — a reveal-on-hover/focus card for non-critical preview content
 * (e.g. an asset summary on hostname hover). Built on the Popover primitive so
 * it shares the project's overlay tokens; opens on pointer-enter and focus,
 * closes on leave/blur, with configurable open/close delays.
 */

interface HoverCardContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
  openDelay: number;
  closeDelay: number;
  timerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
}

const HoverCardContext = React.createContext<HoverCardContextValue | null>(null);

function useHoverCardContext(component: string) {
  const ctx = React.useContext(HoverCardContext);
  if (!ctx) {
    throw new Error(`${component} must be used within <HoverCard>`);
  }
  return ctx;
}

interface HoverCardProps
  extends Omit<
    React.ComponentProps<typeof PopoverPrimitive.Root>,
    "open" | "onOpenChange" | "defaultOpen"
  > {
  openDelay?: number;
  closeDelay?: number;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}

function HoverCard({
  openDelay = 300,
  closeDelay = 150,
  open: controlledOpen,
  defaultOpen = false,
  onOpenChange,
  children,
  ...props
}: HoverCardProps) {
  const [uncontrolledOpen, setUncontrolledOpen] =
    React.useState<boolean>(defaultOpen);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : uncontrolledOpen;
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const setOpen = React.useCallback(
    (next: boolean) => {
      if (!isControlled) setUncontrolledOpen(next);
      onOpenChange?.(next);
    },
    [isControlled, onOpenChange],
  );

  React.useEffect(() => {
    // Alias the ref object so the unmount cleanup clears whatever timer is
    // pending at that moment (and to keep the ref-in-cleanup linter happy).
    const ref = timerRef;
    return () => {
      if (ref.current) clearTimeout(ref.current);
    };
  }, []);

  return (
    <HoverCardContext.Provider
      value={{ open, setOpen, openDelay, closeDelay, timerRef }}
    >
      <PopoverPrimitive.Root open={open} onOpenChange={setOpen} {...props}>
        {children}
      </PopoverPrimitive.Root>
    </HoverCardContext.Provider>
  );
}

function HoverCardTrigger({
  onPointerEnter,
  onPointerLeave,
  onFocus,
  onBlur,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Trigger>) {
  const { setOpen, openDelay, closeDelay, timerRef } =
    useHoverCardContext("HoverCardTrigger");

  const clear = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };
  const schedule = (next: boolean, delay: number) => {
    clear();
    timerRef.current = setTimeout(() => setOpen(next), delay);
  };

  return (
    <PopoverPrimitive.Trigger
      onPointerEnter={(e) => {
        onPointerEnter?.(e);
        schedule(true, openDelay);
      }}
      onPointerLeave={(e) => {
        onPointerLeave?.(e);
        schedule(false, closeDelay);
      }}
      onFocus={(e) => {
        onFocus?.(e);
        clear();
        setOpen(true);
      }}
      onBlur={(e) => {
        onBlur?.(e);
        clear();
        setOpen(false);
      }}
      {...props}
    />
  );
}

function HoverCardContent({
  className,
  align = "center",
  sideOffset = 6,
  onPointerEnter,
  onPointerLeave,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Content>) {
  const { setOpen, closeDelay, timerRef } =
    useHoverCardContext("HoverCardContent");

  const clear = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        align={align}
        sideOffset={sideOffset}
        onOpenAutoFocus={(e) => e.preventDefault()}
        onPointerEnter={(e) => {
          onPointerEnter?.(e);
          clear();
        }}
        onPointerLeave={(e) => {
          onPointerLeave?.(e);
          clear();
          timerRef.current = setTimeout(() => setOpen(false), closeDelay);
        }}
        className={cn(
          "z-50 w-64 rounded-lg border border-border bg-popover p-4 text-card-foreground shadow-panel outline-none",
          "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
          "data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
          className,
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
}

export { HoverCard, HoverCardTrigger, HoverCardContent };
