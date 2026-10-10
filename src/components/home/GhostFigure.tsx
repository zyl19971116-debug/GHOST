'use client';

import * as React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';

/**
 * The hooded mechanical ghost — original vector artwork built in-repo.
 *
 * It is deliberately split into three layers around the WebGL globe:
 *   <GhostAura/>    behind  — halo, hood, shoulders, arms
 *   <GhostGlobeCanvas/>      — the 3D node sphere
 *   <GhostHands/>   in front — the hands gripping the sphere, so the figure reads
 *                              as physically operating it rather than sitting behind it.
 *
 * Colours are driven by CSS variables so the whole figure follows the theme and
 * can be re-tinted without touching the geometry.
 */

const ICE = '#8DBEFF';
const VIOLET = '#827CFF';
const GHOST = '#F2F6FF';

function Defs() {
  return (
    <defs>
      <linearGradient id="gp-hood" x1="0.1" y1="0" x2="0.9" y2="1">
        <stop offset="0" stopColor="#16213A" stopOpacity="0.98" />
        <stop offset="0.45" stopColor="#0A1120" stopOpacity="0.99" />
        <stop offset="1" stopColor="#04070F" stopOpacity="1" />
      </linearGradient>
      <linearGradient id="gp-plate" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#1B2A46" />
        <stop offset="0.5" stopColor="#0C1526" />
        <stop offset="1" stopColor="#060C18" />
      </linearGradient>
      <linearGradient id="gp-rim" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor={GHOST} stopOpacity="0.9" />
        <stop offset="0.4" stopColor={ICE} stopOpacity="0.85" />
        <stop offset="1" stopColor={VIOLET} stopOpacity="0.7" />
      </linearGradient>
      <radialGradient id="gp-eye" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stopColor="#FFFFFF" />
        <stop offset="0.4" stopColor={ICE} />
        <stop offset="0.8" stopColor={VIOLET} stopOpacity="0.5" />
        <stop offset="1" stopColor={VIOLET} stopOpacity="0" />
      </radialGradient>
      <radialGradient id="gp-core" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.95" />
        <stop offset="0.45" stopColor={ICE} stopOpacity="0.75" />
        <stop offset="1" stopColor={VIOLET} stopOpacity="0" />
      </radialGradient>
      <filter id="gp-glow" x="-60%" y="-60%" width="220%" height="220%">
        <feGaussianBlur stdDeviation="10" result="b" />
        <feMerge>
          <feMergeNode in="b" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
      <filter id="gp-glow-soft" x="-60%" y="-60%" width="220%" height="220%">
        <feGaussianBlur stdDeviation="22" />
      </filter>
    </defs>
  );
}

/** Hood, torso, shoulders and arms. Rendered BEHIND the globe. */
export function GhostAura({ className }: { className?: string }) {
  const reduce = useReducedMotion();
  const drift = reduce ? undefined : { y: [0, -9, 0] };

  return (
    <svg
      viewBox="0 0 900 1000"
      className={cn('h-full w-full', className)}
      fill="none"
      aria-hidden="true"
      preserveAspectRatio="xMidYMid meet"
    >
      <Defs />

      {/* Ambient halo */}
      <ellipse cx="450" cy="430" rx="330" ry="330" fill={ICE} opacity="0.07" filter="url(#gp-glow-soft)" />
      <ellipse cx="450" cy="620" rx="240" ry="180" fill={VIOLET} opacity="0.07" filter="url(#gp-glow-soft)" />

      <motion.g animate={drift} transition={reduce ? undefined : { duration: 9, repeat: Infinity, ease: 'easeInOut' }}>
        {/* --- Arms reaching down toward the sphere --- */}
        <g stroke="url(#gp-rim)" strokeWidth="2.1" strokeLinecap="round" fill="url(#gp-plate)">
          <path d="M262 470c-46 8-78 34-92 74-11 32-8 74 12 104-26-6-44-24-52-52-12-42 4-88 40-118 22-18 52-27 92-28Z" />
          <path d="M638 470c46 8 78 34 92 74 11 32 8 74-12 104 26-6 44-24 52-52 12-42-4-88-40-118-22-18-52-27-92-28Z" />
        </g>

        {/* Forearm armour plates */}
        <g stroke={ICE} strokeOpacity="0.55" strokeWidth="1.4" fill="url(#gp-plate)">
          <path d="M196 560c-18 10-28 30-26 52 1 16 8 30 19 40l28-24c-6-8-9-18-9-29 0-14 5-26 15-35l-27-4Z" />
          <path d="M704 560c18 10 28 30 26 52-1 16-8 30-19 40l-28-24c6-8 9-18 9-29 0-14-5-26-15-35l27-4Z" />
        </g>

        {/* --- Shoulders / torso --- */}
        <path
          d="M450 178c96 0 170 44 196 122 14 42 20 92 20 152 0 96-22 168-64 216-30 34-84 52-152 52s-122-18-152-52c-42-48-64-120-64-216 0-60 6-110 20-152 26-78 100-122 196-122Z"
          fill="url(#gp-hood)"
          stroke="url(#gp-rim)"
          strokeWidth="2.4"
        />

        {/* Chest core */}
        <circle cx="450" cy="596" r="46" fill="url(#gp-core)" opacity="0.85" />
        {!reduce ? (
          <motion.circle
            cx="450"
            cy="596"
            r="30"
            stroke={ICE}
            strokeWidth="1.2"
            strokeOpacity="0.7"
            fill="none"
            animate={{ r: [26, 44], opacity: [0.7, 0] }}
            transition={{ duration: 2.8, repeat: Infinity, ease: 'easeOut' }}
          />
        ) : null}
        <circle cx="450" cy="596" r="16" fill="none" stroke={ICE} strokeOpacity="0.8" strokeWidth="1.6" />
        <circle cx="450" cy="596" r="5" fill={GHOST} filter="url(#gp-glow)" />

        {/* Shoulder plate lines */}
        <g stroke={ICE} strokeOpacity="0.35" strokeWidth="1.2" fill="none">
          <path d="M312 330c34-22 78-32 138-32" />
          <path d="M588 330c-34-22-78-32-138-32" />
          <path d="M296 380h-46M604 380h46" />
          <path d="M300 420l-58 10M600 420l58 10" />
        </g>

        {/* --- Hood --- */}
        <path
          d="M450 62c-96 0-172 58-186 150-5 34-4 70 2 106 4 24 14 40 34 46 18 5 34-4 44-22l14-26c8-15 22-24 40-24h104c18 0 32 9 40 24l14 26c10 18 26 27 44 22 20-6 30-22 34-46 6-36 7-72 2-106C624 120 546 62 450 62Z"
          fill="url(#gp-hood)"
          stroke="url(#gp-rim)"
          strokeWidth="2.6"
        />

        {/* Hood inner shadow */}
        <path
          d="M450 108c-74 0-134 46-146 122-4 28-3 58 3 88 3 18 12 28 26 31 14 3 26-4 34-18l16-28c9-16 24-25 42-25h50c18 0 33 9 42 25l16 28c8 14 20 21 34 18 14-3 23-13 26-31 6-30 7-60 3-88-12-76-72-122-146-122Z"
          fill="#03060D"
          opacity="0.85"
        />

        {/* Visor */}
        <path
          d="M332 236h236c11 0 20 9 20 20v104c0 26-21 47-47 47H359c-26 0-47-21-47-47V256c0-11 9-20 20-20Z"
          fill="#050913"
          stroke={ICE}
          strokeOpacity="0.65"
          strokeWidth="1.8"
        />

        {/* Eyes */}
        <g filter="url(#gp-glow)">
          <motion.circle
            cx="392"
            cy="306"
            r="26"
            fill="url(#gp-eye)"
            animate={reduce ? undefined : { opacity: [0.75, 1, 0.75] }}
            transition={reduce ? undefined : { duration: 3.4, repeat: Infinity, ease: 'easeInOut' }}
          />
          <motion.circle
            cx="508"
            cy="306"
            r="26"
            fill="url(#gp-eye)"
            animate={reduce ? undefined : { opacity: [1, 0.75, 1] }}
            transition={reduce ? undefined : { duration: 3.4, repeat: Infinity, ease: 'easeInOut' }}
          />
          <circle cx="392" cy="306" r="6.5" fill={GHOST} />
          <circle cx="508" cy="306" r="6.5" fill={GHOST} />
        </g>

        {/* Visor scan line */}
        {!reduce ? (
          <motion.rect
            x="292"
            width="316"
            height="2"
            fill={ICE}
            opacity="0.5"
            initial={{ y: 240 }}
            animate={{ y: [240, 400, 240] }}
            transition={{ duration: 6.5, repeat: Infinity, ease: 'easeInOut' }}
          />
        ) : null}

        {/* Hood crown ridges */}
        <g stroke={ICE} strokeOpacity="0.3" strokeWidth="1.2" fill="none">
          <path d="M450 62v-26M414 70l-8-26M486 70l8-26M378 90l-16-22M522 90l16-22" />
        </g>

        {/* Circuit traces along the mantle */}
        <g stroke={VIOLET} strokeOpacity="0.4" strokeWidth="1.1" fill="none">
          <path d="M348 700l-52 34-30 6" />
          <path d="M552 700l52 34 30 6" />
          <path d="M380 782l-30 42" />
          <path d="M520 782l30 42" />
        </g>
        {!reduce ? (
          <g stroke={ICE} strokeWidth="2" strokeDasharray="10 84" opacity="0.9">
            <path d="M348 700l-52 34-30 6" className="animate-dash-flow" />
            <path d="M552 700l52 34 30 6" className="animate-dash-flow" />
          </g>
        ) : null}
      </motion.g>
    </svg>
  );
}

/** Hands gripping the sphere. Rendered IN FRONT of the globe. */
export function GhostHands({ className }: { className?: string }) {
  const reduce = useReducedMotion();
  return (
    <svg
      viewBox="0 0 900 1000"
      className={cn('pointer-events-none h-full w-full', className)}
      fill="none"
      aria-hidden="true"
      preserveAspectRatio="xMidYMid meet"
    >
      <Defs />
      <g fill="url(#gp-plate)" stroke="url(#gp-rim)" strokeWidth="2.1" strokeLinejoin="round">
        {/* Left hand */}
        <path d="M176 512c-16-4-30 4-36 18-5 12-2 24 8 32l-14 2c-14 2-22 12-20 25 2 12 12 19 25 18l-10 8c-10 8-11 21-3 30 8 9 21 9 30 1l6-4c-2 12 6 22 18 24 13 2 23-6 26-18l12-52c5-24-4-48-24-62-6-4-12-7-18-9Z" />
        {/* Right hand */}
        <path d="M724 512c16-4 30 4 36 18 5 12 2 24-8 32l14 2c14 2 22 12 20 25-2 12-12 19-25 18l10 8c10 8 11 21 3 30-8 9-21 9-30 1l-6-4c2 12-6 22-18 24-13 2-23-6-26-18l-12-52c-5-24 4-48 24-62 6-4 12-7 18-9Z" />
      </g>

      {/* Contact glow where the hands meet the sphere */}
      <g filter="url(#gp-glow)">
        <circle cx="208" cy="586" r="17" fill={ICE} opacity="0.5" />
        <circle cx="692" cy="586" r="17" fill={ICE} opacity="0.5" />
      </g>
      {!reduce ? (
        <g>
          <motion.circle
            cx="208"
            cy="586"
            r="14"
            stroke={ICE}
            fill="none"
            strokeWidth="1.4"
            animate={{ r: [14, 40], opacity: [0.7, 0] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: 'easeOut' }}
          />
          <motion.circle
            cx="692"
            cy="586"
            r="14"
            stroke={ICE}
            fill="none"
            strokeWidth="1.4"
            animate={{ r: [14, 40], opacity: [0.7, 0] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: 'easeOut', delay: 1.2 }}
          />
        </g>
      ) : null}
    </svg>
  );
}

/** Data pulses travelling from each hand into the sphere. */
export function HandDataStreams({ className }: { className?: string }) {
  const reduce = useReducedMotion();
  if (reduce) return null;
  return (
    <svg viewBox="0 0 900 1000" className={cn('pointer-events-none h-full w-full', className)} fill="none" aria-hidden="true">
      <Defs />
      <g stroke={ICE} strokeWidth="2" strokeDasharray="8 120" strokeLinecap="round" opacity="0.85">
        <path d="M215 590h100" className="animate-dash-flow" />
        <path d="M685 590h-100" className="animate-dash-flow" />
      </g>
    </svg>
  );
}
