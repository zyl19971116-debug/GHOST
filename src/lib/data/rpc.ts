import { createHash } from 'node:crypto';

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------
export type RpcErrorKind =
  | 'timeout'
  | 'rate_limited'
  | 'edge_blocked'
  | 'http_error'
  | 'rpc_error'
  | 'network'
  | 'invalid_response';

export class RpcError extends Error {
  readonly kind: RpcErrorKind;
  readonly status?: number;
  readonly retryable: boolean;
  readonly detail?: unknown;

  constructor(kind: RpcErrorKind, message: string, opts: { status?: number; retryable?: boolean; detail?: unknown } = {}) {
    super(message);
    this.name = 'RpcError';
    this.kind = kind;
    this.status = opts.status;
    this.retryable = opts.retryable ?? false;
    this.detail = opts.detail;
  }
}

/** A short machine-readable code plus a sentence safe to show in the UI. */
export function describeRpcError(err: unknown): { code: string; message: string } {
  if (err instanceof RpcError) {
    switch (err.kind) {
      case 'timeout':
        return { code: 'UPSTREAM_TIMEOUT', message: 'The upstream RPC endpoint did not respond in time.' };
      case 'rate_limited':
        return {
          code: 'UPSTREAM_RATE_LIMITED',
          message:
            'The upstream RPC endpoint is rate limiting this deployment. Configure a dedicated RPC provider (SCAN_*/RPC_* environment variables) or retry shortly.',
        };
      case 'edge_blocked':
        return {
          code: 'UPSTREAM_EDGE_BLOCKED',
          message:
            'The upstream endpoint answered with an edge bot-challenge (HTTP 403) instead of data. This is provider-side protection, not an application error.',
        };
      case 'http_error':
        return { code: 'UPSTREAM_HTTP_ERROR', message: `The upstream RPC endpoint returned HTTP ${err.status ?? 'unknown'}.` };
      case 'invalid_response':
        return { code: 'UPSTREAM_INVALID_RESPONSE', message: 'The upstream RPC endpoint returned a malformed response.' };
      case 'rpc_error':
        return { code: 'UPSTREAM_RPC_ERROR', message: err.message };
      default:
        return { code: 'UPSTREAM_NETWORK_ERROR', message: 'Could not reach the upstream RPC endpoint.' };
    }
  }
  return { code: 'UNKNOWN_ERROR', message: err instanceof Error ? err.message : 'Unexpected error.' };
}

// ---------------------------------------------------------------------------
// Concurrency gate — protects the upstream from our own parallelism.
// ---------------------------------------------------------------------------
class Semaphore {
  private active = 0;
  private queue: Array<() => void> = [];

  constructor(private readonly max: number) {}

  async acquire(): Promise<() => void> {
    if (this.active < this.max) {
      this.active++;
      return () => this.release();
    }
    await new Promise<void>((resolve) => this.queue.push(resolve));
    this.active++;
    return () => this.release();
  }

  private release() {
    this.active--;
    const next = this.queue.shift();
    if (next) next();
  }

  get stats() {
    return { active: this.active, queued: this.queue.length, max: this.max };
  }
}

// ---------------------------------------------------------------------------
// TTL cache with in-flight de-duplication
// ---------------------------------------------------------------------------
interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

class TtlCache {
  private store = new Map<string, CacheEntry<unknown>>();
  private inflight = new Map<string, Promise<unknown>>();
  private maxEntries = 500;

  get<T>(key: string): T | undefined {
    const hit = this.store.get(key);
    if (!hit) return undefined;
    if (hit.expiresAt < Date.now()) {
      this.store.delete(key);
      return undefined;
    }
    return hit.value as T;
  }

  set<T>(key: string, value: T, ttlMs: number) {
    if (this.store.size >= this.maxEntries) {
      // Drop the oldest insertion (Map preserves insertion order).
      const oldest = this.store.keys().next();
      if (!oldest.done) this.store.delete(oldest.value);
    }
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  /** Deduplicate concurrent identical reads. */
  async wrap<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<{ value: T; cached: boolean }> {
    const hit = this.get<T>(key);
    if (hit !== undefined) return { value: hit, cached: true };

    const pending = this.inflight.get(key);
    if (pending) return { value: (await pending) as T, cached: true };

    const p = fn().finally(() => this.inflight.delete(key));
    this.inflight.set(key, p as Promise<unknown>);
    const value = await p;
    this.set(key, value, ttlMs);
    return { value, cached: false };
  }

  clear() {
    this.store.clear();
    this.inflight.clear();
  }

  get size() {
    return this.store.size;
  }
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------
export interface RpcClientOptions {
  url: string;
  timeoutMs: number;
  maxRetries: number;
  maxConcurrency: number;
  cacheTtlMs: number;
  /** Label used in the datasource block returned to clients. */
  label: string;
  /** How long to stop calling the endpoint after an edge bot-challenge. */
  edgeCooldownMs: number;
  /** Pause before retrying a single transient edge challenge. */
  edgeRetryDelayMs: number;
  /** Consecutive challenges tolerated before a hard cooldown kicks in. */
  edgeChallengeTolerance: number;
  /** How long to stop calling the endpoint after a 429. */
  rateLimitCooldownMs: number;
}

interface JsonRpcResponse<T> {
  jsonrpc: string;
  id: number | string;
  result?: T;
  error?: { code: number; message: string; data?: unknown };
}

export interface RpcCallStats {
  requests: number;
  retries: number;
  failures: number;
  cacheHits: number;
  lastLatencyMs: number | null;
}

const EDGE_CHALLENGE_RE = /just a moment|cf-chl|challenge-platform|_cf_chl_opt|attention required/i;

export class RpcClient {
  private readonly semaphore: Semaphore;
  private readonly cache = new TtlCache();
  private stats: RpcCallStats = { requests: 0, retries: 0, failures: 0, cacheHits: 0, lastLatencyMs: null };
  /**
   * Circuit breaker.
   *
   * Measured behaviour of the public Robinhood Chain RPC (2026-10-09): sustained
   * request volume trips a Cloudflare bot-mitigation that answers HTTP 403 with a
   * JS challenge. It is TRANSIENT — a single read succeeded again ~20s later.
   * So we stop hammering it for a cooldown window and fail fast with an honest
   * "capability limited" error instead of queueing hundreds of doomed requests.
   */
  private cooldownUntil = 0;
  private lastCooldownReason: RpcErrorKind | null = null;
  /**
   * Measured on 2026-10-09: the Robinhood Chain edge alternated 403/200 for
   * *consecutive identical requests*, so a single retry with a short pause
   * reliably gets through. Only after several consecutive challenges do we
   * treat it as sustained blocking and back off hard.
   */
  private consecutiveEdgeBlocks = 0;
  /**
   * Distinct from `cooldownUntil`: the short pause after a *single* challenge is
   * meant to be waited out by the retry that follows it, whereas an open breaker
   * means "stop calling this endpoint, including from the retry loop".
   */
  private breakerOpen = false;

  constructor(private readonly options: RpcClientOptions) {
    this.semaphore = new Semaphore(options.maxConcurrency);
  }

  get label() {
    return this.options.label;
  }

  get url() {
    return this.options.url;
  }

  get coolingDown(): boolean {
    return Date.now() < this.cooldownUntil;
  }

  get cooldownRemainingMs(): number {
    return Math.max(0, this.cooldownUntil - Date.now());
  }

  getStats(): RpcCallStats & { active: number; queued: number; cacheEntries: number; coolingDown: boolean; breakerOpen: boolean; cooldownRemainingMs: number; lastCooldownReason: RpcErrorKind | null } {
    const s = this.semaphore.stats;
    return {
      ...this.stats,
      active: s.active,
      queued: s.queued,
      cacheEntries: this.cache.size,
      coolingDown: this.coolingDown,
      breakerOpen: this.breakerOpen,
      cooldownRemainingMs: this.cooldownRemainingMs,
      lastCooldownReason: this.lastCooldownReason,
    };
  }

  private tripCooldown(kind: RpcErrorKind) {
    if (kind === 'edge_blocked') {
      this.consecutiveEdgeBlocks++;
      if (this.consecutiveEdgeBlocks < this.options.edgeChallengeTolerance) {
        // Transient challenge — pause briefly and let the retry attempt through.
        this.cooldownUntil = Math.max(this.cooldownUntil, Date.now() + this.options.edgeRetryDelayMs);
        this.lastCooldownReason = kind;
        return;
      }
    }
    // Sustained failure — stop calling the endpoint entirely for a while.
    const ms = kind === 'edge_blocked' ? this.options.edgeCooldownMs : this.options.rateLimitCooldownMs;
    this.cooldownUntil = Math.max(this.cooldownUntil, Date.now() + ms);
    this.lastCooldownReason = kind;
    this.breakerOpen = true;
  }

  resetStats() {
    this.stats = { requests: 0, retries: 0, failures: 0, cacheHits: 0, lastLatencyMs: null };
  }

  /** Cached single call. Cache is keyed on method + params only. */
  async callCached<T>(method: string, params: unknown[], ttlMs = this.options.cacheTtlMs): Promise<T> {
    const key = `${this.options.url}|${method}|${JSON.stringify(params)}`;
    const { value, cached } = await this.cache.wrap<T>(key, ttlMs, () => this.call<T>(method, params));
    if (cached) this.stats.cacheHits++;
    return value;
  }

  /** Uncached single call with retry/backoff. */
  async call<T>(method: string, params: unknown[] = []): Promise<T> {
    const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method, params });
    const parsed = await this.execute<JsonRpcResponse<T>>(body, method);
    if (!parsed) throw new RpcError('invalid_response', `Empty response for ${method}`, { detail: method });
    if (parsed.error) {
      throw new RpcError('rpc_error', parsed.error.message, { retryable: false, detail: parsed.error });
    }
    if (parsed.result === undefined) {
      throw new RpcError('invalid_response', `Missing result for ${method}`, { detail: parsed });
    }
    return parsed.result;
  }

  /**
   * Batched calls. The batch is chunked to `batchSize` so a single oversized
   * request never trips the upstream rate limiter. Individual items that come
   * back as errors are returned as `null` rather than failing the whole batch.
   */
  async batch<T>(calls: { method: string; params: unknown[] }[], batchSize: number): Promise<(T | null)[]> {
    const results: (T | null)[] = [];
    for (let i = 0; i < calls.length; i += batchSize) {
      const chunk = calls.slice(i, i + batchSize);
      const body = JSON.stringify(
        chunk.map((c, idx) => ({ jsonrpc: '2.0', id: idx, method: c.method, params: c.params })),
      );
      const parsed = await this.execute<JsonRpcResponse<T>[]>(body, `batch:${chunk.length}`);
      if (!Array.isArray(parsed)) {
        for (let k = 0; k < chunk.length; k++) results.push(null);
        continue;
      }
      const byId = new Map<number | string, JsonRpcResponse<T>>();
      for (const item of parsed) if (item && item.id !== undefined) byId.set(item.id, item);
      for (let idx = 0; idx < chunk.length; idx++) {
        const item = byId.get(idx);
        results.push(item && item.result !== undefined ? item.result : null);
      }
    }
    return results;
  }

  private async execute<T>(body: string, label: string): Promise<T | null> {
    if (this.coolingDown) {
      const kind = this.lastCooldownReason ?? 'rate_limited';
      throw new RpcError(
        kind,
        `Endpoint in cooldown for another ${Math.ceil(this.cooldownRemainingMs / 1000)}s (${label})`,
        { retryable: false },
      );
    }

    const attempts = this.options.maxRetries + 1;
    let lastError: unknown = null;

    for (let attempt = 0; attempt < attempts; attempt++) {
      // If the breaker opened while this call was in flight, stop retrying —
      // more requests would only deepen the block.
      if (attempt > 0 && this.breakerOpen) break;

      const release = await this.semaphore.acquire();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.options.timeoutMs);
      const started = Date.now();

      try {
        this.stats.requests++;
        const res = await fetch(this.options.url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body,
          signal: controller.signal,
          // Never send a browser-like UA: the Robinhood Chain edge treats it as
          // a bot and serves a JS challenge instead of JSON.
        });
        this.stats.lastLatencyMs = Date.now() - started;

        const text = await res.text();

        if (res.status === 429) {
          this.tripCooldown('rate_limited');
          throw new RpcError('rate_limited', `429 Too Many Requests (${label})`, { status: 429, retryable: true });
        }
        if (res.status === 403 && EDGE_CHALLENGE_RE.test(text)) {
          this.tripCooldown('edge_blocked');
          throw new RpcError('edge_blocked', 'Edge bot-challenge (HTTP 403) — no JSON returned', {
            status: 403,
            retryable: true,
          });
        }
        if (!res.ok) {
          throw new RpcError('http_error', `HTTP ${res.status} for ${label}`, {
            status: res.status,
            retryable: res.status >= 500,
          });
        }
        if (EDGE_CHALLENGE_RE.test(text.slice(0, 400)) && !text.trimStart().startsWith('{') && !text.trimStart().startsWith('[')) {
          this.tripCooldown('edge_blocked');
          throw new RpcError('edge_blocked', 'Edge bot-challenge served instead of JSON', {
            status: res.status,
            retryable: true,
          });
        }

        try {
          const parsed = JSON.parse(text) as T;
          // A successful response clears any soft cooldown and closes the breaker.
          this.cooldownUntil = 0;
          this.lastCooldownReason = null;
          this.consecutiveEdgeBlocks = 0;
          this.breakerOpen = false;
          return parsed;
        } catch {
          throw new RpcError('invalid_response', `Non-JSON payload for ${label}`, { detail: text.slice(0, 200) });
        }
      } catch (err) {
        if (err instanceof RpcError) {
          lastError = err;
          if (!err.retryable) {
            this.stats.failures++;
            throw err;
          }
        } else if (err instanceof Error && err.name === 'AbortError') {
          lastError = new RpcError('timeout', `Request timed out after ${this.options.timeoutMs}ms (${label})`, {
            retryable: true,
          });
        } else {
          lastError = new RpcError('network', (err as Error)?.message ?? 'network failure', { retryable: true });
        }

        this.stats.retries++;
        if (attempt < attempts - 1) {
          // Exponential backoff with full jitter, floor 400ms, cap 8s.
          const ceiling = Math.min(400 * 2 ** attempt, 8000);
          const delay = Math.floor(ceiling / 2 + Math.random() * (ceiling / 2));
          await new Promise((r) => setTimeout(r, delay));
        }
      } finally {
        clearTimeout(timer);
        release();
      }
    }

    this.stats.failures++;
    throw lastError instanceof Error ? lastError : new RpcError('network', `Request failed (${label})`, { retryable: true });
  }
}

// ---------------------------------------------------------------------------
// Shared client registry — one client per RPC URL per process.
// ---------------------------------------------------------------------------
const clients = new Map<string, RpcClient>();

/**
 * Cooldown defaults are derived from measurement, not guesswork:
 * the Robinhood Chain public RPC served a successful read ~20s after an
 * edge bot-challenge, so we wait 25s before touching it again.
 */
export const EDGE_COOLDOWN_MS = 25_000;
export const EDGE_RETRY_DELAY_MS = 1_500;
export const EDGE_CHALLENGE_TOLERANCE = 3;
export const RATE_LIMIT_COOLDOWN_MS = 10_000;

/** The subset of `DataLimits` (see lib/config.ts) that shapes RPC behaviour. */
export interface RpcLimits {
  rpcTimeoutMs: number;
  rpcMaxRetries: number;
  rpcMaxConcurrency: number;
  cacheTtlSeconds: number;
}

export function getRpcClient(url: string, limits: RpcLimits, label: string): RpcClient {
  const existing = clients.get(url);
  if (existing) return existing;
  let host = url;
  try {
    host = new URL(url).host;
  } catch {
    /* keep raw */
  }
  const client = new RpcClient({
    url,
    label: `${label} @ ${host}`,
    timeoutMs: limits.rpcTimeoutMs,
    maxRetries: limits.rpcMaxRetries,
    maxConcurrency: limits.rpcMaxConcurrency,
    cacheTtlMs: limits.cacheTtlSeconds * 1000,
    edgeCooldownMs: EDGE_COOLDOWN_MS,
    edgeRetryDelayMs: EDGE_RETRY_DELAY_MS,
    edgeChallengeTolerance: EDGE_CHALLENGE_TOLERANCE,
    rateLimitCooldownMs: RATE_LIMIT_COOLDOWN_MS,
  });
  clients.set(url, client);
  return client;
}

export function getAllRpcStats() {
  return [...clients.entries()].map(([url, client]) => {
    let host = url;
    try {
      host = new URL(url).host;
    } catch {
      /* noop */
    }
    return { host, ...client.getStats() };
  });
}

/** Stable short id used for cache keys and archive digests. */
export function digest(input: string, length = 16): string {
  return createHash('sha256').update(input).digest('hex').slice(0, length);
}
