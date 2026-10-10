import { buildNetworkGraph } from '@/lib/network/graph-service';
import { guard, jsonError, jsonOk, networkGraphInputSchema, parseBody } from '@/lib/http';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 120;

export async function POST(req: Request) {
  const gate = guard(req, 'network-graph');
  if ('response' in gate) return gate.response;
  let raw: unknown;
  try { raw = await req.json(); } catch { return jsonError('INVALID_JSON', 'Request body must be valid JSON.', { status: 400 }); }
  const parsed = parseBody(networkGraphInputSchema, raw);
  if (!parsed.ok) return parsed.response;
  try {
    const graph = await buildNetworkGraph(parsed.value.address, parsed.value.depth ?? 1, parsed.value.limit ?? 100, parsed.value.cursor);
    return jsonOk(graph, { headers: { ...gate.headers, 'Cache-Control': 'private, max-age=30' }, meta: { source: 'robinhood-mainnet-rpc', fullHistoryIndex: false } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown graph query failure.';
    const mismatch = message.startsWith('CHAIN_ID_MISMATCH');
    return jsonError(mismatch ? 'CHAIN_ID_MISMATCH' : 'GRAPH_QUERY_FAILED', message, { status: mismatch ? 502 : 503, headers: gate.headers });
  }
}
