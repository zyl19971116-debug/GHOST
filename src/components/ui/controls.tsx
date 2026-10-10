'use client';

import * as React from 'react';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import * as SwitchPrimitive from '@radix-ui/react-switch';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------
export const Tabs = TabsPrimitive.Root;

export const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      'inline-flex items-center gap-1 border border-[rgba(141,190,255,0.18)] bg-[rgba(3,6,13,0.6)] p-1',
      className,
    )}
    {...props}
  />
));
TabsList.displayName = 'TabsList';

export const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      'focus-ring px-3.5 py-1.5 font-display text-[0.6875rem] font-semibold uppercase tracking-hud text-muted transition-all',
      'hover:text-ghost data-[state=active]:bg-[rgba(141,190,255,0.16)] data-[state=active]:text-ice',
      'data-[state=active]:shadow-[0_0_20px_-8px_rgba(141,190,255,0.9)]',
      className,
    )}
    {...props}
  />
));
TabsTrigger.displayName = 'TabsTrigger';

export const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content ref={ref} className={cn('focus-ring mt-3', className)} {...props} />
));
TabsContent.displayName = 'TabsContent';

// ---------------------------------------------------------------------------
// Switch
// ---------------------------------------------------------------------------
export const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitive.Root
    ref={ref}
    className={cn(
      'focus-ring peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border transition-colors',
      'border-[rgba(141,190,255,0.3)] bg-[rgba(3,6,13,0.8)]',
      'data-[state=checked]:border-[rgba(141,190,255,0.7)] data-[state=checked]:bg-[rgba(141,190,255,0.28)]',
      'disabled:cursor-not-allowed disabled:opacity-40',
      className,
    )}
    {...props}
  >
    <SwitchPrimitive.Thumb
      className={cn(
        'pointer-events-none block h-3.5 w-3.5 rounded-full bg-muted shadow transition-transform',
        'data-[state=checked]:translate-x-[18px] data-[state=checked]:bg-ice',
        'data-[state=checked]:shadow-[0_0_12px_rgba(141,190,255,0.9)] translate-x-[3px]',
      )}
    />
  </SwitchPrimitive.Root>
));
Switch.displayName = 'Switch';

// ---------------------------------------------------------------------------
// Tooltip
// ---------------------------------------------------------------------------
export const TooltipProvider = TooltipPrimitive.Provider;

export function Tooltip({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <TooltipPrimitive.Root delayDuration={180}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          sideOffset={6}
          className="glass-strong z-50 max-w-xs rounded-sm px-3 py-2 text-xs leading-relaxed text-ghost shadow-hud"
        >
          {label}
          <TooltipPrimitive.Arrow className="fill-[rgba(141,190,255,0.3)]" />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}

// ---------------------------------------------------------------------------
// Dialog
// ---------------------------------------------------------------------------
export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;

export function DialogContent({
  children,
  className,
  title,
}: {
  children: React.ReactNode;
  className?: string;
  title: string;
}) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[rgba(3,6,13,0.82)] backdrop-blur-sm data-[state=open]:animate-in" />
      <DialogPrimitive.Content
        className={cn(
          'glass-strong hud-corners fixed left-1/2 top-1/2 z-50 max-h-[86vh] w-[min(92vw,760px)] -translate-x-1/2 -translate-y-1/2',
          'overflow-y-auto rounded-sm p-6 shadow-hud',
          className,
        )}
      >
        <div className="mb-4 flex items-start justify-between gap-6">
          <DialogPrimitive.Title className="font-display text-base font-semibold uppercase tracking-hud text-ghost">
            {title}
          </DialogPrimitive.Title>
          <DialogPrimitive.Close className="focus-ring text-muted transition-colors hover:text-ice">
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        </div>
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
