'use client';

import * as React from 'react';
import { motion, useReducedMotion } from 'framer-motion';

/**
 * Ambient HUD backdrop: layered grid, radial vignette, drifting particle field
 * and a slow vertical scan line. Pure CSS/SVG — no image assets, and it stops
 * moving entirely when the user prefers reduced motion.
 */
export function HudBackground({ density = 42 }: { density?: number }) {
  const reduce = useReducedMotion();
  const particles = React.useMemo(
    () =>
      Array.from({ length: density }, (_, i) => {
        // Deterministic pseudo-random layout — stable across renders and SSR.
        const a = (i * 9301 + 49297) % 233280;
        const b = (i * 4021 + 12345) % 233280;
        const c = (i * 7919 + 104729) % 233280;
        return {
          left: `${(a / 233280) * 100}%`,
          top: `${(b / 233280) * 100}%`,
          size: 1 + (c / 233280) * 2.2,
          delay: (a / 233280) * 6,
          duration: 7 + (b / 233280) * 9,
        };
      }),
    [density],
  );

  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-void" aria-hidden="true">
      {/* Deep base wash */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_120%_80%_at_50%_-20%,rgba(141,190,255,0.10),transparent_58%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_90%_60%_at_88%_108%,rgba(130,124,255,0.10),transparent_60%)]" />

      {/* Coarse + fine grid */}
      <div className="bg-hud absolute inset-0 opacity-70" />
      <div className="bg-fine-grid absolute inset-0 opacity-40" />

      {/* Horizon lines for the "command centre" read */}
      <div className="absolute inset-x-0 top-[38%] h-px bg-[linear-gradient(90deg,transparent,rgba(141,190,255,0.22),transparent)]" />
      <div className="absolute inset-x-0 top-[62%] h-px bg-[linear-gradient(90deg,transparent,rgba(130,124,255,0.18),transparent)]" />

      {/* Particle field */}
      {particles.map((p, i) => (
        <motion.span
          key={i}
          className="absolute rounded-full bg-[rgba(141,190,255,0.55)]"
          style={{ left: p.left, top: p.top, width: p.size, height: p.size }}
          animate={reduce ? undefined : { opacity: [0.15, 0.85, 0.15], y: [0, -18, 0] }}
          transition={reduce ? undefined : { duration: p.duration, delay: p.delay, repeat: Infinity, ease: 'easeInOut' }}
        />
      ))}

      {/* Scan line */}
      {!reduce ? (
        <div className="absolute inset-x-0 top-0 h-40 animate-scan-down bg-[linear-gradient(180deg,transparent,rgba(141,190,255,0.055),transparent)]" />
      ) : null}

      {/* Vignette to keep edges dark */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_100%_100%_at_50%_50%,transparent_45%,rgba(3,6,13,0.85)_100%)]" />
    </div>
  );
}
