import { getTransferLogs, resolveChain } from '@/lib/data/onchain';
import { guard, jsonError, jsonOk, ADDRESS_RE } from '@/lib/http';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 120;

export async function GET(req: Request, { params }: { params: { address: string } }) {
  const gate = guard(req, 'wallet-transfers');
  if ('response' in gate) return gate.response;
  if (!ADDRESS_RE.test(params.address)) return jsonError('INVALID_ADDRESS', 'Invalid EVM address.', { status: 400, headers: gate.headers });
  const url = new URL(req.url); const chain = url.searchParams.get('chain') ?? 'robinhood';
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit') ?? 50) || 50, 1), 200);
  const cursor = Math.max(Number(url.searchParams.get('cursor') ?? 0) || 0, 0);
  const rc = resolveChain(chain);
  if (!rc) return jsonError('UNSUPPORTED_CHAIN', `Unsupported chain "${chain}".`, { status: 400, headers: gate.headers });
  const result = await getTransferLogs(rc, params.address.toLowerCase());
  if (result.source.completeness === 'unavailable') return jsonError(result.source.error?.code ?? 'RPC_UNAVAILABLE', result.source.error?.message ?? 'Transfer log query unavailable.', { status: 503, headers: gate.headers });
  const items = result.logs.slice(cursor, cursor + limit); const hasMore = result.logs.length > cursor + limit;
  return jsonOk({ items, hasMore, nextCursor: hasMore ? String(cursor + items.length) : null, coverage: { fromBlock: result.source.fromBlock ?? null, toBlock: result.source.toBlock ?? null, complete: false, limitation: result.source.limitation }, source: result.source }, { headers: { ...gate.headers, 'Cache-Control': 'private, max-age=30' } });
}
