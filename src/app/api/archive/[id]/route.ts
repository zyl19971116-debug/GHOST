import { getRepository } from '@/lib/db/repository';
import { guard, jsonError, jsonOk, parseBody, attestationSchema } from '@/lib/http';
import { explorerTxUrl } from '@/lib/chains';
import { getPublicConfig } from '@/lib/config';
import { resolveChain } from '@/lib/data/onchain';
import { ANALYSIS_REGISTRY_ABI } from '@/lib/contracts/registry-abi';
import { decodeEventLog } from 'viem';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const gate = guard(req, 'archive-get');
  if ('response' in gate) return gate.response;

  const repo = await getRepository();
  const record = await repo.get(params.id);
  if (!record) {
    return jsonError('ARCHIVE_NOT_FOUND', `No archive record exists with id "${params.id}".`, { status: 404 });
  }
  return jsonOk(
    {
      ...record,
      attestation: {
        ...record.attestation,
        explorerUrl: record.attestation.txHash ? explorerTxUrl(record.chainKey, record.attestation.txHash) : null,
      },
    },
    { headers: { ...gate.headers, 'Cache-Control': 'no-store' } },
  );
}

/**
 * Records the outcome of an on-chain attestation.
 *
 * The client submits the transaction from the user's wallet (the platform never
 * holds a key), then reports back the hash. This endpoint stores that outcome —
 * it does not and cannot mark something as confirmed on its own.
 */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const gate = guard(req, 'archive-attestation');
  if ('response' in gate) return gate.response;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return jsonError('INVALID_JSON', 'Request body must be valid JSON.', { status: 400 });
  }

  const parsed = parseBody(attestationSchema, raw);
  if (!parsed.ok) return parsed.response;

  const repo = await getRepository();
  const existing = await repo.get(params.id);
  if (!existing) {
    return jsonError('ARCHIVE_NOT_FOUND', `No archive record exists with id "${params.id}".`, { status: 404 });
  }

  if (parsed.value.status === 'confirmed') {
    const pub = getPublicConfig();
    if (!pub.registryAddress || !pub.features.onchainRegistry) {
      return jsonError('REGISTRY_NOT_DEPLOYED', 'No registry contract is configured; confirmation cannot be verified.', { status: 409, headers: gate.headers });
    }
    if (!parsed.value.txHash) return jsonError('MISSING_TX_HASH', 'A transaction hash is required for confirmation.', { status: 400, headers: gate.headers });
    const rc = resolveChain(existing.chainKey);
    if (!rc || rc.meta.id !== pub.registryChainId) return jsonError('REGISTRY_CHAIN_MISMATCH', 'The configured registry chain does not match this archive.', { status: 409, headers: gate.headers });
    type Receipt = { status: string; to: string | null; logs: { address: string; data: `0x${string}`; topics: [`0x${string}`, ...`0x${string}`[]] }[] };
    let receipt: Receipt | null = null;
    try { receipt = await rc.client.call<Receipt | null>('eth_getTransactionReceipt', [parsed.value.txHash]); } catch {
      return jsonError('RECEIPT_UNAVAILABLE', 'The transaction receipt could not be read from the configured RPC.', { status: 503, headers: gate.headers });
    }
    if (!receipt || receipt.status !== '0x1' || receipt.to?.toLowerCase() !== pub.registryAddress.toLowerCase()) {
      return jsonError('INVALID_ATTESTATION_RECEIPT', 'The transaction is missing, failed, or does not target the configured registry.', { status: 422, headers: gate.headers });
    }
    const eventMatches = receipt.logs.some((log) => {
      if (log.address.toLowerCase() !== pub.registryAddress!.toLowerCase()) return false;
      try {
        const decoded = decodeEventLog({ abi: ANALYSIS_REGISTRY_ABI, eventName: 'AnalysisRegistered', data: log.data, topics: log.topics });
        return decoded.args.reportHash.toLowerCase() === existing.reportHash.toLowerCase()
          && decoded.args.subject.toLowerCase() === existing.subject.toLowerCase()
          && Number(decoded.args.analysisChainId) === existing.chainId;
      } catch { return false; }
    });
    if (!eventMatches) return jsonError('ATTESTATION_EVENT_MISMATCH', 'The receipt does not contain a matching AnalysisRegistered event.', { status: 422, headers: gate.headers });
  }

  const updated = await repo.updateAttestation(params.id, {
    status: parsed.value.status,
    txHash: parsed.value.txHash ?? null,
    contractAddress: parsed.value.contractAddress ?? existing.attestation.contractAddress,
    chainId: parsed.value.chainId ?? existing.attestation.chainId,
    error: parsed.value.error ?? undefined,
    submittedAt: parsed.value.status === 'confirmed' ? new Date().toISOString() : existing.attestation.submittedAt,
  });

  if (!updated) {
    return jsonError('UPDATE_FAILED', 'The attestation record could not be updated.', { status: 500 });
  }

  return jsonOk(
    {
      ...updated,
      attestation: {
        ...updated.attestation,
        explorerUrl: updated.attestation.txHash ? explorerTxUrl(updated.chainKey, updated.attestation.txHash) : null,
      },
    },
    { headers: { ...gate.headers, 'Cache-Control': 'no-store' } },
  );
}
