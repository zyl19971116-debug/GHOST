import { getWalletState, resolveChain } from '@/lib/data/onchain';
import { guard, jsonError, jsonOk, ADDRESS_RE } from '@/lib/http';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: Request, { params }: { params: { address: string } }) {
  const gate = guard(req, 'wallet-state');
  if ('response' in gate) return gate.response;
  const address = params.address.trim();
  if (!ADDRESS_RE.test(address)) return jsonError('INVALID_ADDRESS', 'Expected a 40-character hex EVM address beginning with 0x.', { status: 400, headers: gate.headers });
  const chain = new URL(req.url).searchParams.get('chain') ?? 'robinhood';
  const rc = resolveChain(chain);
  if (!rc) return jsonError('UNSUPPORTED_CHAIN', `Unsupported chain "${chain}".`, { status: 400, headers: gate.headers });
  const state = await getWalletState(rc, address.toLowerCase());
  if (state.unavailableReason) return jsonError('RPC_UNAVAILABLE', state.unavailableReason, { status: 503, headers: gate.headers });
  return jsonOk({ ...state, chainId: rc.meta.id, chainKey: rc.chainKey, source: { strategy: 'rpc-state', host: new URL(rc.source.rpcUrl).host, readAtBlock: state.readAtBlock } }, { headers: { ...gate.headers, 'Cache-Control': 'no-store' } });
}
