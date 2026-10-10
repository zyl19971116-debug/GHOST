import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 border px-2 py-[3px] font-mono text-[0.625rem] uppercase tracking-wide2 leading-none',
  {
    variants: {
      tone: {
        neutral: 'border-[rgba(141,190,255,0.22)] bg-[rgba(141,190,255,0.07)] text-muted',
        ice: 'border-[rgba(141,190,255,0.45)] bg-[rgba(141,190,255,0.14)] text-ice',
        violet: 'border-[rgba(130,124,255,0.45)] bg-[rgba(130,124,255,0.14)] text-violet',
        ok: 'border-[rgba(74,222,128,0.4)] bg-[rgba(74,222,128,0.12)] text-[#7EE2A8]',
        warn: 'border-[rgba(251,191,36,0.42)] bg-[rgba(251,191,36,0.12)] text-[#FCD34D]',
        bad: 'border-[rgba(255,92,122,0.42)] bg-[rgba(255,92,122,0.12)] text-[#FF9DB1]',
      },
      shape: {
        square: 'rounded-[2px]',
        pill: 'rounded-full',
      },
    },
    defaultVariants: { tone: 'neutral', shape: 'square' },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, shape, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone, shape }), className)} {...props} />;
}

export { badgeVariants };
