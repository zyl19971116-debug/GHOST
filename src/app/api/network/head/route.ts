import { getChainHead, resolveChain, describeRpcFailure } from '@/lib/data/onchain';
import { CHAIN_META } from '@/lib/chains';
import { guard, jsonError, jsonOk } from '@/lib/http';
import { getChainMeta } from '@/lib/chains';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * Real chain head for a configured network: latest synchronised block number,
 * its hash and timestamp, plus how long the read took. Nothing is cached across
 * requests beyond the shared short-TTL RPC cache.
 */
export async function GET(req: Request) {
  const gate = guard(req, 'head');
  if ('response' in gate) return gate.response;

  const url = new URL(req.url);
  const chainKey = url.searchParams.get('chain') ?? 'robinhood';

  const meta = getChainMeta(chainKey);
  if (!meta) {
    return jsonError('UNSUPPORTED_CHAIN', `"${chainKey}" is not a supported chain key.`, { status: 400 });
  }

  const rc = resolveChain(chainKey);
  if (!rc) {
    return jsonError('UNSUPPORTED_CHAIN', `"${chainKey}" could not be resolved.`, { status: 400 });
  }

  try {
    const head = await getChainHead(rc);
    return jsonOk(
      {
        chainKey: rc.chainKey,
        chainId: rc.meta.id,
        chainName: rc.meta.name,
        nativeCurrency: rc.meta.nativeCurrency,
        explorerUrl: rc.meta.explorerUrl,
        latestSyncedBlock: head.latestBlock,
        latestBlockHash: head.latestBlockHash,
        latestBlockTimestamp: head.latestBlockTimestamp,
        gasPriceWei: head.gasPriceWei,
        blocksPerSecond: rc.meta.blocksPerSecond ?? null,
        historyIndexMode: rc.meta.capabilities.historyIndex,
        explorerReachableFromServer: rc.meta.capabilities.explorerReachableFromServer,
        sourceHost: new URL(rc.source.rpcUrl).host,
        rpcIsDefaultEndpoint: rc.source.rpcIsDefault,
        latencyMs: head.latencyMs,
        fetchedAt: new Date().toISOString(),
      },
      { headers: { ...gate.headers, 'Cache-Control': 'no-store' } },
    );
  } catch (err) {
    const d = describeRpcFailure(err);
    return jsonError(d.code, d.message, { status: 503, headers: gate.headers });
  }
}

export function OPTIONS() {
  const chains = Object.keys(CHAIN_META);
  return jsonOk({ chains });
}
