import type { RelationshipEdge, RelationshipNode } from '@/lib/types';

/**
 * Deterministic force-directed layout.
 *
 * A seeded initial ring plus a fixed number of relaxation steps means the same
 * graph always renders identically — no `Math.random()`, no per-render drift,
 * and therefore no hydration mismatch between server and client markup.
 *
 * Complexity is O(iterations * n²), which is fine for the node counts this app
 * produces (capped at 60 by the analysis engine).
 */

export interface LaidOutNode extends RelationshipNode {
  x: number;
  y: number;
  z: number;
  /** 0..1, derived from tx count — drives visual weight. */
  weight: number;
}

export interface LayoutOptions {
  width: number;
  height: number;
  iterations?: number;
  /** Ideal edge length. */
  linkDistance?: number;
  repulsion?: number;
  damping?: number;
  /** Depth of the third dimension for the 3D view. */
  depth?: number;
}

function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function layoutGraph(
  nodes: RelationshipNode[],
  edges: RelationshipEdge[],
  options: LayoutOptions,
): LaidOutNode[] {
  const { width, height, iterations = 320, linkDistance = 148, repulsion = 26000, damping = 0.86, depth = 220 } = options;
  if (nodes.length === 0) return [];

  const cx = width / 2;
  const cy = height / 2;
  const maxTx = Math.max(1, ...nodes.map((n) => n.txCount));

  // Relaxation accumulates floating-point forces in array order, so two callers
  // that hand us the same graph in a different order would otherwise get results
  // that differ in the last decimal place — enough to trip React hydration.
  // Sorting into a canonical order first makes the layout a pure function of the
  // graph's *content* rather than of the caller's iteration order.
  const ordered = [...nodes].sort((a, b) => (a.address < b.address ? -1 : a.address > b.address ? 1 : 0));

  const laid: LaidOutNode[] = ordered.map((n) => {
    const h = hash(n.address.toLowerCase());
    const angle = ((h % 3600) / 3600) * Math.PI * 2;
    const ring = n.kind === 'subject' ? 0 : 0.34 + ((h >>> 7) % 1000) / 1000 * 0.66;
    const radius = Math.min(width, height) * 0.42 * ring;
    const seed = ((h >>> 13) % 1000) / 1000;
    return {
      ...n,
      x: cx + Math.cos(angle) * radius + (seed - 0.5) * 12,
      y: cy + Math.sin(angle) * radius + (((h >>> 19) % 1000) / 1000 - 0.5) * 12,
      z: (((h >>> 23) % 1000) / 1000 - 0.5) * depth,
      weight: n.txCount / maxTx,
    };
  });

  const index = new Map(laid.map((n, i) => [n.address, i]));
  const links = edges
    .map((e) => ({ a: index.get(e.source), b: index.get(e.target), strength: 0.5 + e.confidence }))
    .filter((l): l is { a: number; b: number; strength: number } => l.a !== undefined && l.b !== undefined);

  // Subject node is anchored so the layout always reads outward from it.
  const subjectIdx = laid.findIndex((n) => n.kind === 'subject');

  const vx = new Float64Array(laid.length);
  const vy = new Float64Array(laid.length);
  const vz = new Float64Array(laid.length);

  for (let step = 0; step < iterations; step++) {
    const alpha = 1 - step / iterations;

    // Pairwise repulsion
    for (let i = 0; i < laid.length; i++) {
      for (let j = i + 1; j < laid.length; j++) {
        let dx = laid[j].x - laid[i].x;
        let dy = laid[j].y - laid[i].y;
        let dz = laid[j].z - laid[i].z;
        let distSq = dx * dx + dy * dy + dz * dz;
        if (distSq < 1) {
          dx = (i % 2 === 0 ? 1 : -1) * 0.5;
          dy = (j % 2 === 0 ? 1 : -1) * 0.5;
          dz = 0.25;
          distSq = 1;
        }
        const dist = Math.sqrt(distSq);
        const force = (repulsion * alpha) / distSq;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        const fz = (dz / dist) * force;
        vx[i] -= fx; vy[i] -= fy; vz[i] -= fz;
        vx[j] += fx; vy[j] += fy; vz[j] += fz;
      }
    }

    // Spring attraction along edges
    for (const l of links) {
      const a = laid[l.a];
      const b = laid[l.b];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dz = b.z - a.z;
      const dist = Math.max(1, Math.sqrt(dx * dx + dy * dy + dz * dz));
      const target = linkDistance / l.strength;
      const force = ((dist - target) / dist) * 0.012 * alpha * l.strength;
      const fx = dx * force;
      const fy = dy * force;
      const fz = dz * force * 0.7;
      vx[l.a] += fx; vy[l.a] += fy; vz[l.a] += fz;
      vx[l.b] -= fx; vy[l.b] -= fy; vz[l.b] -= fz;
    }

    // Gravity toward centre, weaker for the subject
    for (let i = 0; i < laid.length; i++) {
      const g = i === subjectIdx ? 0.055 : 0.024;
      vx[i] += (cx - laid[i].x) * g * alpha;
      vy[i] += (cy - laid[i].y) * g * alpha;
      vz[i] += (0 - laid[i].z) * g * alpha;
    }

    for (let i = 0; i < laid.length; i++) {
      vx[i] *= damping;
      vy[i] *= damping;
      vz[i] *= damping;
      laid[i].x += vx[i];
      laid[i].y += vy[i];
      laid[i].z += vz[i];
    }
  }

  // Anchor the subject exactly at the centre so the view is stable.
  if (subjectIdx >= 0) {
    const dx = cx - laid[subjectIdx].x;
    const dy = cy - laid[subjectIdx].y;
    const dz = -laid[subjectIdx].z;
    for (const n of laid) {
      n.x += dx;
      n.y += dy;
      n.z += dz;
    }
  }

  // Relaxation can fling outer nodes past the canvas edge, where they would be
  // drawn off-screen and look like missing data. Clamp into a padded box; the
  // subject sits at the centre, so it is always interior and never moved.
  const pad = 28;
  for (const n of laid) {
    n.x = Math.min(Math.max(n.x, pad), Math.max(pad, width - pad));
    n.y = Math.min(Math.max(n.y, pad), Math.max(pad, height - pad));
  }

  return laid;
}

export const DEPTH_PALETTE = ['#F2F6FF', '#8DBEFF', '#827CFF'] as const;

export function depthColor(depth: number): string {
  const i = Number.isFinite(depth) ? Math.trunc(depth) : 0;
  return DEPTH_PALETTE[Math.min(Math.max(i, 0), DEPTH_PALETTE.length - 1)];
}
