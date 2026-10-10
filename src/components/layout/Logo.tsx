import { cn } from '@/lib/utils';

/**
 * GHOST PROTOCOL AI mark — an original geometric "hooded ghost" glyph.
 * Drawn inline as SVG so it scales, themes and animates without an asset fetch.
 */
export function GhostMark({ className, size = 32 }: { className?: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      className={cn('shrink-0', className)}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="gp-mark-stroke" x1="4" y1="2" x2="44" y2="46" gradientUnits="userSpaceOnUse">
          <stop stopColor="#F2F6FF" />
          <stop offset="0.5" stopColor="#8DBEFF" />
          <stop offset="1" stopColor="#827CFF" />
        </linearGradient>
        <radialGradient id="gp-mark-eye" cx="0.5" cy="0.5" r="0.5">
          <stop stopColor="#FFFFFF" />
          <stop offset="0.45" stopColor="#8DBEFF" />
          <stop offset="1" stopColor="#8DBEFF" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Hood / outer silhouette */}
      <path
        d="M24 3.5c8.6 0 15.2 6.6 15.2 15.4v14.3c0 3-1 5.6-2.8 7.9l-2.2 2.8c-.8 1-2.2 1.2-3.2.5-1-.6-1.4-1.9-.9-3l.8-1.7c.3-.7-.2-1.5-1-1.5h-2.4c-.9 0-1.6.6-1.8 1.5l-.4 2c-.2 1-1 1.8-2.1 1.8H21c-1.1 0-1.9-.8-2.1-1.8l-.4-2c-.2-.9-.9-1.5-1.8-1.5h-2.4c-.8 0-1.3.8-1 1.5l.8 1.7c.5 1.1.1 2.4-.9 3-1 .7-2.4.5-3.2-.5l-2.2-2.8c-1.8-2.3-2.8-4.9-2.8-7.9V18.9C8.8 10.1 15.4 3.5 24 3.5Z"
        stroke="url(#gp-mark-stroke)"
        strokeWidth="1.6"
        fill="rgba(141,190,255,0.06)"
      />

      {/* Visor plate */}
      <path
        d="M14.5 17.5h19c1.1 0 2 .9 2 2v6.2c0 2.4-1.9 4.3-4.3 4.3H16.8c-2.4 0-4.3-1.9-4.3-4.3V19.5c0-1.1.9-2 2-2Z"
        stroke="rgba(141,190,255,0.5)"
        strokeWidth="1.1"
        fill="rgba(3,6,13,0.8)"
      />

      {/* Eyes */}
      <circle cx="19.6" cy="23.6" r="3.4" fill="url(#gp-mark-eye)" className="animate-pulse-soft" />
      <circle cx="28.4" cy="23.6" r="3.4" fill="url(#gp-mark-eye)" className="animate-pulse-soft" />
      <circle cx="19.6" cy="23.6" r="1.15" fill="#F2F6FF" />
      <circle cx="28.4" cy="23.6" r="1.15" fill="#F2F6FF" />

      {/* Circuit notch */}
      <path d="M24 34v3.2M20.6 39.4h6.8" stroke="rgba(141,190,255,0.45)" strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  );
}

export function Wordmark({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn('flex items-center gap-2.5', className)}>
      <GhostMark className="h-8 w-8 sm:h-[38px] sm:w-[38px]" size={compact ? 28 : 38} />
      <span className="flex flex-col leading-none">
        <span className="font-display text-[0.72rem] font-bold uppercase leading-none tracking-[.1em] text-ghost sm:text-[1.08rem] sm:tracking-[.13em]">
          GHOST <span className="text-white">PROTOCOL</span> <span className="rounded border border-[#b6d3ff]/60 px-1.5 py-0.5 text-ice">AI</span>
        </span>
        {!compact ? (
          <span className="mt-1 hidden font-mono text-[0.5625rem] uppercase leading-none tracking-[0.3em] text-[rgba(138,154,184,0.85)] sm:block">
            THE INVISIBLE AI NETWORK
          </span>
        ) : null}
      </span>
    </span>
  );
}
