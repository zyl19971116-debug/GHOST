'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAccount, useChainId, useWaitForTransactionReceipt, useWriteContract } from 'wagmi';
import { Database, Download, Link2, RefreshCw, Search, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogTrigger, Tooltip } from '@/components/ui/controls';
import { EmptyState, ErrorState, EvidenceLink, NoticeBanner, SectionHeading, StatTile, NotConfigured } from '@/components/ui/panel';
import { getPublicConfig } from '@/lib/config';
import { explorerTxUrl } from '@/lib/chains';
import { ANALYSIS_REGISTRY_ABI } from '@/lib/contracts/registry-abi';
import { cn, formatEth, shortenAddress, shortenHash } from '@/lib/utils';
import type { ArchiveRecord } from '@/lib/types';

interface ArchiveListResponse {
  items: ArchiveRecord[];
  total: number;
  storageDriver: string;
  durable: boolean;
  note: string;
  registry: { onchainRegistry: boolean; walletConnect: boolean };
}

export function ArchiveView() {
  const pub = getPublicConfig();
  const queryClient = useQueryClient();
  const { address: connected, isConnected } = useAccount();
  const activeChainId = useChainId();

  const [subjectFilter, setSubjectFilter] = React.useState('');
  const [debounced, setDebounced] = React.useState('');
  const [attestationFilter, setAttestationFilter] = React.useState<string>('all');

  React.useEffect(() => {
    const id = setTimeout(() => setDebounced(subjectFilter), 350);
    return () => clearTimeout(id);
  }, [subjectFilter]);

  const list = useQuery<ArchiveListResponse>({
    queryKey: ['archive-list', debounced, attestationFilter],
    queryFn: async () => {
      const sp = new URLSearchParams({ limit: '100' });
      if (debounced.trim()) sp.set('subject', debounced.trim());
      if (attestationFilter !== 'all') sp.set('attestation', attestationFilter);
      const res = await fetch(`/api/archive?${sp.toString()}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? 'Archive unavailable');
      return json.data as ArchiveListResponse;
    },
    staleTime: 15_000,
  });

  const items = list.data?.items ?? [];
  const registryConfigured = pub.features.onchainRegistry;
  const registryAddress = pub.registryAddress as `0x${string}` | null;
  const registryChainId = pub.registryChainId;

  const totals = React.useMemo(
    () => ({
      records: items.length,
      attested: items.filter((a) => a.attestation.status === 'confirmed').length,
      pendingDeploy: items.filter((a) => a.attestation.status === 'not_deployed').length,
      txSum: items.reduce((acc, a) => acc + a.summary.txCount, 0),
    }),
    [items],
  );

  const patchAttestation = useMutation({
    mutationFn: async (args: { id: string; body: Record<string, unknown> }) => {
      const res = await fetch(`/api/archive/${args.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(args.body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? 'Could not update attestation');
      return json.data as ArchiveRecord;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['archive-list'] }),
  });

  return (
    <div className="container max-w-[1600px] space-y-6 pb-10 pt-8">
      <SectionHeading
        index="//"
        title="ONCHAIN ARCHIVE"
        subtitle="Saved analysis digests with optional on-chain notarisation. The archive stores a hash, a version, the subject wallet and a timestamp — never the report body."
        action={
          <Button variant="outline" size="sm" onClick={() => void list.refetch()} loading={list.isFetching}>
            <RefreshCw className="h-3 w-3" />
            REFRESH
          </Button>
        }
      />

      {/* Storage + registry status */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="STORAGE"
          value={list.data?.durable ? 'POSTGRESQL' : 'IN-MEMORY'}
          tone={list.data?.durable ? 'ok' : 'warn'}
          hint={list.data?.durable ? 'Durable across restarts' : 'Volatile — lost on restart'}
        />
        <StatTile label="RECORDS" value={totals.records} />
        <StatTile label="ATTESTED ON-CHAIN" value={totals.attested} tone={totals.attested > 0 ? 'ok' : 'default'} />
        <StatTile
          label="REGISTRY CONTRACT"
          value={registryConfigured ? 'DEPLOYED' : 'NOT DEPLOYED'}
          tone={registryConfigured ? 'ok' : 'warn'}
          hint={registryConfigured ? shortenAddress(registryAddress ?? '') : 'Set NEXT_PUBLIC_REGISTRY_ADDRESS'}
        />
      </div>

      {!list.data?.durable && list.data ? (
        <NoticeBanner tone="warn" title="VOLATILE STORAGE">
          {list.data.note} A database is not required to use the product, but records will not survive a restart.
        </NoticeBanner>
      ) : null}

      {!registryConfigured ? (
        <NotConfigured
          feature="ANALYSIS REGISTRY CONTRACT"
          requirement="NEXT_PUBLIC_REGISTRY_ADDRESS is unset for this deployment, so no on-chain attestation can be submitted. Records are still saved and are explicitly marked NOT DEPLOYED rather than shown as notarised. Deploy the contract with `npm run contracts:deploy`, then set the address and chain id."
        />
      ) : null}

      {/* Filters */}
      <div className="glass hud-corners grid gap-4 p-4 md:grid-cols-[minmax(0,1fr)_auto]">
        <div>
          <div className="hud-label mb-2">FILTER BY SUBJECT WALLET</div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-muted" />
            <Input
              value={subjectFilter}
              onChange={(e) => setSubjectFilter(e.target.value)}
              placeholder="0x…"
              className="h-10 pl-7 font-mono text-[0.6875rem]"
              aria-label="Filter archive by wallet"
            />
          </div>
        </div>
        <div>
          <div className="hud-label mb-2">ATTESTATION STATE</div>
          <div className="flex flex-wrap gap-1.5">
            {[
              { id: 'all', label: 'ALL' },
              { id: 'not_deployed', label: 'NOT DEPLOYED' },
              { id: 'pending', label: 'PENDING' },
              { id: 'confirmed', label: 'CONFIRMED' },
            ].map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setAttestationFilter(f.id)}
                className={cn(
                  'focus-ring border px-2.5 py-1.5 font-mono text-[0.5625rem] uppercase tracking-wide2 transition-colors',
                  attestationFilter === f.id
                    ? 'border-[rgba(141,190,255,0.6)] bg-[rgba(141,190,255,0.15)] text-ice'
                    : 'border-[rgba(141,190,255,0.16)] text-muted hover:border-[rgba(141,190,255,0.4)] hover:text-ghost',
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {list.isError ? (
        <ErrorState code="ARCHIVE_UNAVAILABLE" message={(list.error as Error)?.message ?? 'Could not load the archive.'} />
      ) : null}

      {/* Records */}
      {list.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse-soft bg-[rgba(141,190,255,0.05)]" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={Database}
          title="Archive is empty"
          body="Nothing has been saved yet. Run an analysis on /analyze and use SAVE ANALYSIS to record its digest here. The archive never invents entries."
          action={
            <Button asChild variant="outline" size="sm" className="mt-1">
              <a href="/analyze">GO TO ANALYZE</a>
            </Button>
          }
        />
      ) : (
        <ul className="space-y-3">
          {items.map((a) => (
            <ArchiveRow
              key={a.id}
              record={a}
              connected={isConnected}
              activeChainId={activeChainId}
              registryAddress={registryAddress}
              registryChainId={registryChainId}
              registryConfigured={registryConfigured}
              onPatch={(body) => patchAttestation.mutate({ id: a.id, body })}
              patchPending={patchAttestation.isPending}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function ArchiveRow({
  record,
  connected,
  activeChainId,
  registryAddress,
  registryChainId,
  registryConfigured,
  onPatch,
  patchPending,
}: {
  record: ArchiveRecord;
  connected: boolean;
  activeChainId: number;
  registryAddress: `0x${string}` | null;
  registryChainId: number;
  registryConfigured: boolean;
  onPatch: (body: Record<string, unknown>) => void;
  patchPending: boolean;
}) {
  const wrongChain = registryConfigured && activeChainId !== registryChainId;

  const { data: hash, writeContract, isPending: writing, error: writeError } = useWriteContract();
  const { isLoading: confirming, isSuccess: confirmed } = useWaitForTransactionReceipt({ hash });

  // Record the confirmed transaction once the receipt lands. This is the only
  // place a record is marked confirmed — never optimistically.
  React.useEffect(() => {
    if (confirmed && hash) {
      onPatch({ status: 'confirmed', txHash: hash, contractAddress: registryAddress, chainId: registryChainId });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirmed, hash]);

  const statusTone =
    record.attestation.status === 'confirmed'
      ? 'ok'
      : record.attestation.status === 'pending'
        ? 'warn'
        : record.attestation.status === 'failed'
          ? 'bad'
          : 'neutral';

  const statusLabel = {
    not_deployed: 'NOT DEPLOYED',
    pending: 'AWAITING SIGNATURE',
    confirmed: 'CONFIRMED ON-CHAIN',
    failed: 'ATTESTATION FAILED',
  }[record.attestation.status];

  const attest = () => {
    if (!registryAddress) return;
    writeContract({
      address: registryAddress,
      abi: ANALYSIS_REGISTRY_ABI,
      functionName: 'registerAnalysis',
      args: [record.subject as `0x${string}`, record.reportHash as `0x${string}`, record.reportVersion, record.metadataCid ?? '', BigInt(record.chainId)],
      chainId: registryChainId,
    });
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(record, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ghost-protocol-archive-${record.reportHash.slice(2, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <li className="glass hud-corners p-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={statusTone}>{statusLabel}</Badge>
            <Badge tone="neutral">{record.chainKey.toUpperCase()} · {record.chainId}</Badge>
            <Badge tone="ice">v{record.reportVersion}</Badge>
            <span className="font-mono text-[0.625rem] text-muted">
              {record.createdAt.slice(0, 19).replace('T', ' ')}Z
            </span>
          </div>

          <p className="mt-2.5 font-display text-sm font-semibold uppercase tracking-wide2 text-ghost">{record.label}</p>

          <div className="mt-2 grid gap-x-6 gap-y-1.5 font-mono text-[0.625rem] sm:grid-cols-2 lg:grid-cols-4">
            <div className="min-w-0">
              <div className="text-muted">SUBJECT</div>
              <a
                href={`/analyze?address=${record.subject}&chain=${record.chainKey}`}
                className="focus-ring truncate text-ice transition-colors hover:text-white"
                title={record.subject}
              >
                {shortenAddress(record.subject, 10, 8)}
              </a>
            </div>
            <div className="min-w-0">
              <div className="text-muted">DIGEST</div>
              <Tooltip label={record.reportHash}>
                <span className="cursor-help text-ghost">{shortenHash(record.reportHash, 12, 8)}</span>
              </Tooltip>
            </div>
            <div className="min-w-0">
              <div className="text-muted">SUMMARY</div>
              <span className="text-ghost">
                {record.summary.txCount} TX · {record.summary.counterparties} CP · {record.summary.anomalyCount} FLAGS
              </span>
            </div>
            <div className="min-w-0">
              <div className="text-muted">NET FLOW</div>
              <span className={cn(BigInt(record.summary.netFlowWei) >= 0n ? 'text-[#7EE2A8]' : 'text-[#FF9DB1]')}>
                {formatEth(record.summary.netFlowWei)}
              </span>
            </div>
          </div>

          {record.attestation.txHash ? (
            <div className="mt-2">
              <EvidenceLink
                href={record.attestation.explorerUrl ?? explorerTxUrl(record.chainKey, record.attestation.txHash)}
                label={`ATTESTATION ${shortenHash(record.attestation.txHash, 12, 8)}`}
              />
            </div>
          ) : null}

          {record.attestation.error ? (
            <p className="mt-2 text-[0.625rem] leading-relaxed text-[#FCD34D]">{record.attestation.error}</p>
          ) : null}
          {writeError ? (
            <p className="mt-2 text-[0.625rem] leading-relaxed text-[#FF9DB1]">
              {writeError.message.split('\n')[0]}
            </p>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={exportJson}>
            <Download className="h-3 w-3" />
            EXPORT
          </Button>

          <Dialog>
            <DialogTrigger asChild>
              <Button variant="ghost" size="sm">
                <ShieldCheck className="h-3 w-3" />
                DETAILS
              </Button>
            </DialogTrigger>
            <DialogContent title="ARCHIVE RECORD">
              <div className="space-y-4">
                <Field label="RECORD ID" value={record.id} mono />
                <Field label="LABEL" value={record.label} />
                <Field label="SUBJECT" value={record.subject} mono />
                <Field label="REPORT DIGEST (SHA-256)" value={record.reportHash} mono />
                <Field label="REPORT VERSION" value={record.reportVersion} mono />
                <Field label="METADATA CID" value={record.metadataCid ?? 'none recorded'} mono />
                <Field label="CREATED" value={record.createdAt} mono />
                <div className="hairline" />
                <Field label="ATTESTATION STATUS" value={statusLabel} />
                <Field label="CONTRACT" value={record.attestation.contractAddress ?? 'not deployed'} mono />
                <Field label="ATTESTATION CHAIN" value={String(record.attestation.chainId)} mono />
                <Field label="ATTESTATION TX" value={record.attestation.txHash ?? 'none'} mono />
                <p className="text-[0.6875rem] leading-relaxed text-muted">
                  Only the digest, version, wallet address and metadata pointer are eligible for on-chain registration. The
                  report body — transaction lists, statistics and AI narrative — is never written to the chain.
                </p>
              </div>
            </DialogContent>
          </Dialog>

          {registryConfigured ? (
            <Tooltip
              label={
                !connected
                  ? 'Connect a wallet to sign the attestation.'
                  : wrongChain
                    ? `Switch your wallet to chain ID ${registryChainId} to attest.`
                    : 'Signs a transaction from your own wallet. The platform never holds a key.'
              }
            >
              <Button
                variant="primary"
                size="sm"
                disabled={!connected || wrongChain || writing || confirming || record.attestation.status === 'confirmed'}
                loading={writing || confirming}
                onClick={attest}
              >
                <Link2 className="h-3 w-3" />
                {record.attestation.status === 'confirmed' ? 'ATTESTED' : 'ATTEST ON-CHAIN'}
              </Button>
            </Tooltip>
          ) : (
            <Button variant="outline" size="sm" disabled>
              <Link2 className="h-3 w-3" />
              ATTEST ON-CHAIN
            </Button>
          )}
        </div>
      </div>
    </li>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="hud-label">{label}</div>
      <div className={cn('mt-1 break-all text-[0.6875rem] leading-relaxed text-ghost', mono && 'font-mono')}>{value}</div>
    </div>
  );
}
