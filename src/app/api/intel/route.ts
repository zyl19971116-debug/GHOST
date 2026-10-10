import { getRecentActivity, resolveChain, describeRpcFailure } from '@/lib/data/onchain';
import { guard, jsonError, jsonOk } from '@/lib/http';
import { getChainMeta } from '@/lib/chains';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export interface IntelQuery {
  chain: string;
  limit: number;
  blocks: number;
  q: string | null;
  kind: string | null;
}

/**
 * Live on-chain activity feed, read from real blocks.
 *
 * Filtering is applied server-side over the fetched window so the client never
 * re-derives what the source already told us. When the upstream cannot be read
 * the feed returns 503 with the reason — it does not fall back to sample rows.
 */
export async function GET(req: Request) {
  const gate = guard(req, 'intel');
  if ('response' in gate) return gate.response;

  const url = new URL(req.url);
  const chainKey = url.searchParams.get('chain') ?? 'robinhood';
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit') ?? 40) || 40, 1), 120);
  const blocks = Math.min(Math.max(Number(url.searchParams.get('blocks') ?? 30) || 30, 1), 300);
  const q = url.searchParams.get('q');
  const kind = url.searchParams.get('kind');

  const meta = getChainMeta(chainKey);
  if (!meta) return jsonError('UNSUPPORTED_CHAIN', `"${chainKey}" is not a supported chain key.`, { status: 400 });

  const rc = resolveChain(chainKey);
  if (!rc) return jsonError('UNSUPPORTED_CHAIN', `"${chainKey}" could not be resolved.`, { status: 400 });

  let result;
  try {
    result = await getRecentActivity(rc, { blocks, limit: Math.max(limit * 2, 60) });
  } catch (err) {
    const d = describeRpcFailure(err);
    return jsonError(d.code, d.message, { status: 503, headers: gate.headers });
  }

  // Filter applied over the real fetched window.
  const needle = q ? q.trim().toLowerCase() : null;
  let events = result.events;
  if (kind) events = events.filter((e) => e.kind === kind);
  if (needle) {
    events = events.filter(
      (e) =>
        e.txHash.toLowerCase().includes(needle) ||
        e.from.includes(needle) ||
        (e.to ?? '').includes(needle) ||
        (e.methodLabel ?? '').toLowerCase().includes(needle) ||
        (e.methodId ?? '').toLowerCase().includes(needle),
    );
  }

  return jsonOk(
    {
      events: events.slice(0, limit),
      windowScanned: {
        blocksScanned: result.source.blocksScanned ?? 0,
        fromBlock: result.source.fromBlock ?? null,
        toBlock: result.source.toBlock ?? null,
        matchedBeforeLimit: events.length,
      },
      chainKey: rc.chainKey,
      chainId: rc.meta.id,
      chainName: rc.meta.name,
      source: result.source,
      fetchedAt: new Date().toISOString(),
    },
    { headers: { ...gate.headers, 'Cache-Control': 'no-store' } },
  );
}
