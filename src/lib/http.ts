import { NextResponse } from 'next/server';
import { z } from 'zod';
import { checkRateLimit, clientKey } from './rate-limit';
import type { ApiEnvelope } from './types';

export function jsonOk<T>(data: T, init?: { status?: number; headers?: Record<string, string>; meta?: Record<string, unknown> }) {
  const body: ApiEnvelope<T> = { ok: true, data, error: null, meta: init?.meta };
  return NextResponse.json(body, { status: init?.status ?? 200, headers: init?.headers });
}

export function jsonError(
  code: string,
  message: string,
  init?: { status?: number; detail?: string; headers?: Record<string, string> },
) {
  const body: ApiEnvelope<null> = {
    ok: false,
    data: null,
    error: { code, message, detail: init?.detail },
  };
  return NextResponse.json(body, { status: init?.status ?? 400, headers: init?.headers });
}

export function rateLimitHeaders(info: { limit: number; remaining: number; resetAt: string }) {
  return {
    'X-RateLimit-Limit': String(info.limit),
    'X-RateLimit-Remaining': String(info.remaining),
    'X-RateLimit-Reset': info.resetAt,
  };
}

/** Apply the sliding-window limiter. Returns a response when the caller is over budget. */
export function guard(req: Request, scope: string): { response: NextResponse } | { headers: Record<string, string> } {
  const { allowed, info } = checkRateLimit(clientKey(req, scope));
  const headers = rateLimitHeaders(info);
  if (!allowed) {
    return {
      response: jsonError(
        'RATE_LIMITED',
        `This deployment allows ${info.limit} requests per window for ${scope}. Try again after ${info.resetAt}.`,
        { status: 429, headers },
      ),
    };
  }
  return { headers };
}

// ---------------------------------------------------------------------------
// Shared input schemas
// ---------------------------------------------------------------------------
export const CHAIN_KEY_RE = /^[a-zA-Z]{2,32}$/;
export const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

export const analyzeInputSchema = z.object({
  chain: z.string().regex(CHAIN_KEY_RE, 'Invalid chain key.'),
  address: z
    .string()
    .trim()
    .regex(ADDRESS_RE, 'Expected a 40-character hex EVM address beginning with 0x.'),
  maxBlocks: z.number().int().positive().max(20_000).optional(),
  maxTransactions: z.number().int().positive().max(1_000).optional(),
  includeAi: z.boolean().optional(),
  hops: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
  expandTopK: z.number().int().positive().max(20).optional(),
});

export const walletLookupSchema = z.object({
  chain: z.string().regex(CHAIN_KEY_RE, 'Invalid chain key.'),
  address: z.string().trim().regex(ADDRESS_RE, 'Expected a 40-character hex EVM address beginning with 0x.'),
});

export const networkGraphInputSchema = z.object({
  address: z.string().trim().regex(ADDRESS_RE, 'Expected a 40-character hex EVM address beginning with 0x.'),
  chainId: z.literal(4663),
  depth: z.union([z.literal(1), z.literal(2)]).default(1),
  limit: z.number().int().positive().max(100).default(100),
  cursor: z.string().max(500).optional(),
});

export const archiveCreateSchema = z.object({
  subject: z.string().trim().regex(ADDRESS_RE, 'Expected a valid EVM address.'),
  chain: z.string().regex(CHAIN_KEY_RE, 'Invalid chain key.'),
  reportHash: z.string().trim().regex(/^0x[a-fA-F0-9]{64}$/, 'reportHash must be a 32-byte hex digest.'),
  reportVersion: z.string().trim().min(1).max(32),
  label: z.string().trim().min(1).max(120),
  metadataCid: z.string().trim().max(200).nullable().optional(),
  analysisId: z.string().trim().max(120).nullable().optional(),
  summary: z
    .object({
      txCount: z.number().int().min(0),
      counterparties: z.number().int().min(0),
      anomalyCount: z.number().int().min(0),
      netFlowWei: z.string(),
    })
    .optional(),
});

export const attestationSchema = z.object({
  status: z.enum(['not_deployed', 'pending', 'confirmed', 'failed']),
  txHash: z.string().trim().regex(/^0x[a-fA-F0-9]{64}$/).nullable().optional(),
  contractAddress: z.string().trim().regex(ADDRESS_RE).nullable().optional(),
  chainId: z.number().int().positive().optional(),
  error: z.string().max(500).nullable().optional(),
});

/** Parse a Zod schema and produce a consistent 400 payload. */
export function parseBody<T>(schema: z.ZodType<T>, raw: unknown): { ok: true; value: T } | { ok: false; response: NextResponse } {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const detail = parsed.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; ');
    return {
      ok: false,
      response: jsonError('INVALID_INPUT', 'The request payload failed validation.', { status: 400, detail }),
    };
  }
  return { ok: true, value: parsed.data };
}

export function parseQuery<T>(schema: z.ZodType<T>, searchParams: URLSearchParams): { ok: true; value: T } | { ok: false; response: NextResponse } {
  const obj: Record<string, string> = {};
  searchParams.forEach((v, k) => {
    obj[k] = v;
  });
  return parseBody(schema, obj);
}
