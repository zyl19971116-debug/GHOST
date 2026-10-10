import * as React from 'react';
import { cn } from '@/lib/utils';

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      ref={ref}
      className={cn(
        'h-11 w-full rounded-sm border border-[rgba(141,190,255,0.2)] bg-[rgba(3,6,13,0.65)] px-3.5 font-mono text-sm text-ghost',
        'placeholder:text-[rgba(138,154,184,0.6)] transition-colors',
        'hover:border-[rgba(141,190,255,0.35)] focus:border-[rgba(141,190,255,0.6)] focus:outline-none focus:ring-1 focus:ring-[rgba(141,190,255,0.4)]',
        'disabled:cursor-not-allowed disabled:opacity-45',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';

export const Label = React.forwardRef<HTMLLabelElement, React.LabelHTMLAttributes<HTMLLabelElement>>(
  ({ className, ...props }, ref) => (
    <label ref={ref} className={cn('hud-label block', className)} {...props} />
  ),
);
Label.displayName = 'Label';

/** Native range styled to match the HUD — avoids shipping a slider dependency. */
export const RangeInput = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      type="range"
      ref={ref}
      className={cn(
        'h-1.5 w-full cursor-pointer appearance-none rounded-full bg-[rgba(141,190,255,0.16)] accent-[#8DBEFF]',
        '[&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none',
        '[&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-[#8DBEFF]',
        '[&::-webkit-slider-thumb]:bg-[#8DBEFF] [&::-webkit-slider-thumb]:shadow-[0_0_14px_rgba(141,190,255,0.8)]',
        '[&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full',
        '[&::-moz-range-thumb]:border [&::-moz-range-thumb]:border-[#8DBEFF] [&::-moz-range-thumb]:bg-[#8DBEFF]',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(141,190,255,0.6)]',
        className,
      )}
      {...props}
    />
  ),
);
RangeInput.displayName = 'RangeInput';

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('animate-pulse-soft rounded-sm bg-[rgba(141,190,255,0.09)]', className)}
      {...props}
    />
  );
}

export function Separator({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div role="separator" className={cn('hairline my-4', className)} {...props} />;
}
