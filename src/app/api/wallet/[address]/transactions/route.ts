import { resolveChain, scanAddressTransactions } from '@/lib/data/onchain';
import { guard, jsonError, jsonOk, ADDRESS_RE } from '@/lib/http';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 120;

export async function GET(req: Request, { params }: { params: { address: string } }) {
  const gate = guard(req, 'wallet-transactions');
  if ('response' in gate) return gate.response;
  if (!ADDRESS_RE.test(params.address)) return jsonError('INVALID_ADDRESS', 'Invalid EVM address.', { status: 400, headers: gate.headers });
  const url = new URL(req.url); const chain = url.searchParams.get('chain') ?? 'robinhood';
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit') ?? 50) || 50, 1), 200);
  const cursor = Math.max(Number(url.searchParams.get('cursor') ?? 0) || 0, 0);
  const rc = resolveChain(chain);
  if (!rc) return jsonError('UNSUPPORTED_CHAIN', `Unsupported chain "${chain}".`, { status: 400, headers: gate.headers });
  const scan = await scanAddressTransactions(rc, params.address.toLowerCase(), { maxTransactions: Math.min(cursor + limit + 1, 1000), includeReceipts: true });
  if (scan.source.completeness === 'unavailable') return jsonError(scan.source.error?.code ?? 'RPC_UNAVAILABLE', scan.source.error?.message ?? 'Transaction scan unavailable.', { status: 503, headers: gate.headers });
  const items = scan.transactions.slice(cursor, cursor + limit); const hasMore = scan.transactions.length > cursor + limit;
  return jsonOk({ items, hasMore, nextCursor: hasMore ? String(cursor + items.length) : null, coverage: { fromBlock: scan.source.fromBlock ?? null, toBlock: scan.source.toBlock ?? null, complete: false, limitation: scan.source.limitation }, source: scan.source }, { headers: { ...gate.headers, 'Cache-Control': 'private, max-age=30' } });
}
