import { getServerConfig } from './config';
import type { RateLimitInfo } from './types';

/**
 * Sliding-window rate limiter.
 *
 * Process-local by design: it protects the upstream RPC from a single noisy
 * client, which is the realistic failure mode here. If you deploy multiple
 * instances behind a load balancer, put a shared limiter in front — this file
 * does not pretend to be a distributed quota system.
 */
interface Window {
  hits: number[];
}

const windows = new Map<string, Window>();

export interface RateLimitResult {
  allowed: boolean;
  info: RateLimitInfo;
}

export function checkRateLimit(key: string, now: number = Date.now()): RateLimitResult {
  const { apiRateLimitMax: max, apiRateLimitWindowMs: windowMs } = getServerConfig().limits;
  const cutoff = now - windowMs;

  let w = windows.get(key);
  if (!w) {
    w = { hits: [] };
    windows.set(key, w);
  }
  w.hits = w.hits.filter((t) => t > cutoff);

  const allowed = w.hits.length < max;
  if (allowed) w.hits.push(now);

  // Opportunistic cleanup so the map cannot grow without bound.
  if (windows.size > 2000) {
    for (const [k, v] of windows) {
      if (v.hits.length === 0 || v.hits[v.hits.length - 1] < cutoff) windows.delete(k);
    }
  }

  const oldest = w.hits[0] ?? now;
  return {
    allowed,
    info: {
      limit: max,
      remaining: Math.max(0, max - w.hits.length),
      resetAt: new Date(oldest + windowMs).toISOString(),
    },
  };
}

/** Best-effort client identity for rate limiting. */
export function clientKey(req: Request, scope: string): string {
  const fwd = req.headers.get('x-forwarded-for');
  const ip = fwd ? fwd.split(',')[0].trim() : req.headers.get('x-real-ip') ?? 'local';
  return `${scope}:${ip}`;
}
