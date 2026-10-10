import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** 0x1234…abcd */
export function shortenAddress(address?: string | null, lead = 6, tail = 4): string {
  if (!address) return '';
  if (address.length <= lead + tail + 2) return address;
  return `${address.slice(0, lead)}…${address.slice(-tail)}`;
}

export function shortenHash(hash?: string | null, lead = 10, tail = 8): string {
  if (!hash) return '';
  if (hash.length <= lead + tail + 2) return hash;
  return `${hash.slice(0, lead)}…${hash.slice(-tail)}`;
}

/** Format a wei string as a human amount, trimming trailing zeros. */
export function formatUnits(raw: string | bigint, decimals = 18, maxFraction = 6): string {
  const value = typeof raw === 'bigint' ? raw : safeBigInt(raw);
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const base = 10n ** BigInt(decimals);
  const whole = abs / base;
  const frac = abs % base;
  let fracStr = frac.toString().padStart(decimals, '0').slice(0, maxFraction).replace(/0+$/, '');
  const out = fracStr ? `${whole.toString()}.${fracStr}` : whole.toString();
  return negative ? `-${out}` : out;
}

export function safeBigInt(value: string | number | bigint | null | undefined): bigint {
  if (value === null || value === undefined) return 0n;
  if (typeof value === 'bigint') return value;
  try {
    if (typeof value === 'number') return BigInt(Math.trunc(value));
    const s = value.trim();
    if (s === '') return 0n;
    return s.startsWith('0x') || s.startsWith('0X') ? BigInt(s) : BigInt(s);
  } catch {
    return 0n;
  }
}

export function parseHexInt(value: string | null | undefined): number {
  if (!value) return 0;
  // Every caller feeds this an `0x`-prefixed quantity straight off the wire.
  const n = Number.parseInt(value, 16);
  // Never let NaN leak into a block number, nonce or index.
  return Number.isFinite(n) ? n : 0;
}

export function parseHexBig(value: string | null | undefined): bigint {
  if (!value) return 0n;
  try {
    return BigInt(value);
  } catch {
    return 0n;
  }
}

export function toHex(value: number | bigint): string {
  return `0x${value.toString(16)}`;
}

export function formatUsdLike(value: number): string {
  if (!Number.isFinite(value)) return '—';
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${(value / 1_000).toFixed(2)}K`;
  if (abs >= 1) return value.toFixed(2);
  if (abs === 0) return '0';
  return value.toPrecision(4);
}

/** Compact ETH display: 1.23K ETH / 4.5M ETH / 0.0000001 ETH */
export function formatEth(wei: bigint | string, decimals = 18): string {
  const v = typeof wei === 'bigint' ? wei : safeBigInt(wei);
  const asNumber = Number(v) / 10 ** decimals;
  if (asNumber === 0) return '0 ETH';
  if (Math.abs(asNumber) >= 1000) return `${formatUsdLike(asNumber)} ETH`;
  if (Math.abs(asNumber) < 0.000001) return `${asNumber.toExponential(3)} ETH`;
  return `${asNumber.toLocaleString('en-US', { maximumFractionDigits: 6 })} ETH`;
}

export function formatBlock(n: number | bigint): string {
  return Number(n).toLocaleString('en-US');
}

export function formatTimestamp(iso: string | number | Date): string {
  const d = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toISOString().replace('T', ' ').replace('.000Z', 'Z').replace(/\.\d{3}Z$/, 'Z');
}

export function relativeTime(target: string | number | Date, now: Date): string {
  const d = target instanceof Date ? target : new Date(target);
  const diff = now.getTime() - d.getTime();
  const sec = Math.round(diff / 1000);
  if (sec < 0) return `in ${Math.abs(sec)}s`;
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  return `${day}d ago`;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Deterministic bucket key so the same input always renders the same visual. */
export function stableBucket(input: string, buckets: number): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h) % buckets;
}

export function isValidTxHash(value: string): boolean {
  return /^0x[a-fA-F0-9]{64}$/.test(value.trim());
}

export function isValidAddress(value: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(value.trim());
}

/**
 * EIP-55 mixed-case formatting check.
 *
 * The comparison must be made on the 40-character hex body only. Comparing the
 * whole string would always differ from `toUpperCase()` because `String.toUpperCase()`
 * also uppercases the `0x` prefix's `x`, making every all-uppercase address look
 * "mixed case".
 */
export function isChecksumAddress(value: string): boolean {
  if (!/^0x[0-9a-fA-F]{40}$/.test(value)) return false;
  const body = value.slice(2);
  return body !== body.toLowerCase() && body !== body.toUpperCase();
}

/**
 * Arbitrum-style system addresses.
 *
 * Robinhood Chain is an Arbitrum Nitro / Orbit L2, so a chunk of on-chain
 * activity is generated by the rollup's own machinery rather than by people:
 *
 *   - the zero address (mint/burn sink),
 *   - the canonical burn address,
 *   - the `0x0000…0000<8 hex digits>` alias range (at least 32 leading zero
 *     nibbles), which is how Nitro synthesises L1→L2 deposits, retryable-ticket
 *     calls and the 0x64/0x65 precompiles.
 *
 * These must never be presented as a human counterparty. Reporting them as
 * "wallets you transacted with" would be a fabricated relationship.
 */
export function isSystemAddress(address: string | null | undefined): boolean {
  if (!address) return false;
  const a = address.toLowerCase();
  if (a === '0x0000000000000000000000000000000000000000') return true;
  if (a === '0x000000000000000000000000000000000000dead') return true;
  if (/^0x0{32}[0-9a-f]{8}$/.test(a)) return true;
  return false;
}

