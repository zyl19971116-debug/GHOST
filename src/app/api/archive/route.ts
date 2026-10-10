import { getRepository } from '@/lib/db/repository';
import { guard, jsonError, jsonOk, parseBody, archiveCreateSchema } from '@/lib/http';
import { getPublicConfig } from '@/lib/config';
import { getChainMeta, explorerTxUrl } from '@/lib/chains';
import type { ArchiveRecord } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: Request) {
  const gate = guard(req, 'archive-list');
  if ('response' in gate) return gate.response;

  const url = new URL(req.url);
  const subject = url.searchParams.get('subject') ?? undefined;
  const chainKey = url.searchParams.get('chain') ?? undefined;
  const attestationStatus = url.searchParams.get('attestation') ?? undefined;
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit') ?? 50) || 50, 1), 200);

  const repo = await getRepository();
  const items = await repo.list({ subject, chainKey, attestationStatus, limit });

  const withExplorer = items.map((a) => ({
    ...a,
    attestation: {
      ...a.attestation,
      explorerUrl: a.attestation.txHash ? explorerTxUrl(a.chainKey, a.attestation.txHash) : null,
    },
  }));

  return jsonOk(
    {
      items: withExplorer,
      total: withExplorer.length,
      storageDriver: repo.driver,
      durable: repo.driver === 'postgresql',
      note:
        repo.driver === 'postgresql'
          ? 'Records are stored in PostgreSQL.'
          : 'No DATABASE_URL is configured, so records live in this process only and are lost on restart. Set DATABASE_URL to make the archive durable.',
      registry: getPublicConfig().features,
    },
    { headers: { ...gate.headers, 'Cache-Control': 'no-store' } },
  );
}

export async function POST(req: Request) {
  const gate = guard(req, 'archive-create');
  if ('response' in gate) return gate.response;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return jsonError('INVALID_JSON', 'Request body must be valid JSON.', { status: 400 });
  }

  const parsed = parseBody(archiveCreateSchema, raw);
  if (!parsed.ok) return parsed.response;
  const input = parsed.value;

  const meta = getChainMeta(input.chain);
  if (!meta) return jsonError('UNSUPPORTED_CHAIN', `"${input.chain}" is not a supported chain key.`, { status: 400 });

  const pub = getPublicConfig();
  const repo = await getRepository();

  const record: Omit<ArchiveRecord, 'id' | 'createdAt'> = {
    subject: input.subject.toLowerCase(),
    chainKey: meta.key,
    chainId: meta.id,
    reportHash: input.reportHash,
    reportVersion: input.reportVersion,
    label: input.label,
    metadataCid: input.metadataCid ?? null,
    // The contract is only ever reported as deployed when an address is configured.
    attestation: {
      status: pub.features.onchainRegistry ? 'pending' : 'not_deployed',
      txHash: null,
      explorerUrl: null,
      contractAddress: pub.registryAddress,
      chainId: pub.registryChainId,
      submittedAt: null,
      error: pub.features.onchainRegistry
        ? undefined
        : 'The analysis registry contract is not deployed for this deployment (NEXT_PUBLIC_REGISTRY_ADDRESS is unset), so no on-chain attestation can be produced.',
    },
    summary: input.summary ?? { txCount: 0, counterparties: 0, anomalyCount: 0, netFlowWei: '0' },
  };

  const created = await repo.create({ ...record, analysisId: input.analysisId ?? null });

  return jsonOk(created, {
    status: 201,
    headers: { ...gate.headers, 'Cache-Control': 'no-store' },
  });
}
