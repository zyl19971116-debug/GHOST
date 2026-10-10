import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap font-display font-semibold uppercase tracking-hud transition-all duration-200 focus-ring disabled:pointer-events-none disabled:opacity-40 select-none',
  {
    variants: {
      variant: {
        primary:
          'bg-ice text-void hover:bg-[#a8cdff] shadow-[0_0_26px_-6px_rgba(141,190,255,0.75)] hover:shadow-[0_0_40px_-6px_rgba(141,190,255,0.95)] active:translate-y-[1px]',
        outline:
          'border border-[rgba(141,190,255,0.32)] bg-[rgba(141,190,255,0.05)] text-ghost hover:border-[rgba(141,190,255,0.7)] hover:bg-[rgba(141,190,255,0.12)] hover:text-white active:translate-y-[1px]',
        ghost: 'text-muted hover:text-ghost hover:bg-[rgba(141,190,255,0.08)]',
        violet:
          'bg-violet text-void hover:bg-[#9a95ff] shadow-[0_0_26px_-6px_rgba(130,124,255,0.75)] active:translate-y-[1px]',
        danger:
          'border border-[rgba(255,92,122,0.4)] bg-[rgba(255,92,122,0.1)] text-[#FF9DB1] hover:bg-[rgba(255,92,122,0.2)]',
        link: 'text-ice underline-offset-4 hover:underline tracking-normal normal-case font-sans font-medium',
      },
      size: {
        sm: 'h-8 px-3 text-[0.6875rem]',
        md: 'h-10 px-5 text-xs',
        lg: 'h-12 px-7 text-sm',
        xl: 'h-14 px-9 text-base',
        icon: 'h-9 w-9',
      },
      clip: {
        true: '[clip-path:polygon(0_0,calc(100%-10px)_0,100%_10px,100%_100%,10px_100%,0_calc(100%-10px))]',
        false: 'rounded-sm',
      },
    },
    defaultVariants: { variant: 'outline', size: 'md', clip: false },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, clip, asChild = false, loading, children, disabled, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, clip }), className)}
        ref={ref}
        disabled={disabled || loading}
        {...props}
      >
        {loading ? (
          <span className="flex items-center gap-2">
            <span className="h-3 w-3 animate-spin rounded-full border border-current border-t-transparent" />
            {children}
          </span>
        ) : (
          children
        )}
      </Comp>
    );
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
