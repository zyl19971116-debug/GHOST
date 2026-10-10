import { getWalletState, resolveChain } from '@/lib/data/onchain';
import { guard, jsonError, jsonOk, parseBody, walletLookupSchema } from '@/lib/http';
import { getChainMeta } from '@/lib/chains';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * Address validation + live state read.
 *
 * This endpoint is the single source of truth for "is this address usable on
 * this chain" — the /analyze form calls it before submitting so the user gets a
 * real answer instead of a client-side guess.
 */
export async function POST(req: Request) {
  const gate = guard(req, 'wallet-lookup');
  if ('response' in gate) return gate.response;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return jsonError('INVALID_JSON', 'Request body must be valid JSON.', { status: 400 });
  }

  const parsed = parseBody(walletLookupSchema, raw);
  if (!parsed.ok) return parsed.response;
  const { chain, address } = parsed.value;

  const meta = getChainMeta(chain);
  if (!meta) {
    return jsonError('UNSUPPORTED_CHAIN', `"${chain}" is not a supported chain key for this deployment.`, { status: 400 });
  }

  const rc = resolveChain(chain);
  if (!rc) {
    return jsonError('UNSUPPORTED_CHAIN', `"${chain}" could not be resolved.`, { status: 400 });
  }

  const state = await getWalletState(rc, address.toLowerCase());

  // Address validity is confirmed by the chain itself: a node that answers for
  // this address means the address is well-formed and reachable on this network.
  if (state.unavailableReason !== undefined && state.nonce === null && state.balanceWei === null) {
    return jsonError('STATE_READ_FAILED', state.unavailableReason, {
      status: 503,
      headers: gate.headers,
      detail: `Chain ${meta.name} (${meta.id}) did not return state for ${address}.`,
    });
  }

  return jsonOk(
    {
      chainKey: rc.chainKey,
      chainId: rc.meta.id,
      chainName: rc.meta.name,
      address: state.address,
      valid: true,
      isContract: state.isContract,
      codeSize: state.codeSize,
      balanceWei: state.balanceWei,
      nonce: state.nonce,
      readAtBlock: state.readAtBlock,
      explorerUrl: rc.meta.explorerUrl ? `${rc.meta.explorerUrl}/address/${state.address}` : null,
      historyIndexMode: rc.meta.capabilities.historyIndex,
      coverageNote: `Address state is read at the latest block (${state.readAtBlock ?? 'unknown'}). Historical state is not served by this node, so a past balance cannot be reconstructed. Transaction history is limited to a bounded recent-block scan.`,
    },
    { headers: { ...gate.headers, 'Cache-Control': 'no-store' } },
  );
}
