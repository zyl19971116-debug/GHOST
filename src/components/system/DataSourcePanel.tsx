'use client';

import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, CircleSlash, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { DataSourceCard } from '@/components/ui/panel';
import { cn } from '@/lib/utils';
import type { CapabilityReport } from '@/lib/config';

interface CapabilityRowProps {
  label: string;
  configured: boolean;
  detail: string;
  pending?: boolean;
}

function CapabilityRow({ label, configured, detail, pending }: CapabilityRowProps) {
  return (
    <div className="flex items-start gap-3 border-b border-[rgba(141,190,255,0.08)] py-2.5 last:border-b-0">
      {pending ? (
        <Loader2 className="mt-[2px] h-3.5 w-3.5 shrink-0 animate-spin text-muted" />
      ) : configured ? (
        <CheckCircle2 className="mt-[2px] h-3.5 w-3.5 shrink-0 text-[#7EE2A8]" />
      ) : (
        <CircleSlash className="mt-[2px] h-3.5 w-3.5 shrink-0 text-[rgba(138,154,184,0.75)]" />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[0.6875rem] uppercase tracking-wide2 text-ghost">{label}</span>
          <Badge tone={pending ? 'neutral' : configured ? 'ok' : 'neutral'}>
            {pending ? 'CHECKING' : configured ? 'CONFIGURED' : 'NOT CONFIGURED'}
          </Badge>
        </div>
        <p className="mt-1 text-[0.6875rem] leading-relaxed text-muted">{detail}</p>
      </div>
    </div>
  );
}

/**
 * Renders the deployment's real capability report. Everything here is derived
 * from server environment variables — it is the single place a user can see
 * which external services actually exist in this build.
 */
export function DataSourcePanel({ compact = false }: { compact?: boolean }) {
  const query = useQuery<CapabilityReport>({
    queryKey: ['capabilities'],
    queryFn: async () => {
      const res = await fetch('/api/capabilities');
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? 'Capability report unavailable');
      return json.data as CapabilityReport;
    },
    staleTime: 60_000,
    retry: 1,
  });

  const cap = query.data;

  return (
    <div className="glass hud-corners p-5">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        {/* Service configuration */}
        <div>
          <div className="hud-label mb-1">SERVICES</div>
          {query.isLoading ? (
            <div className="space-y-2 py-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-9 animate-pulse-soft bg-[rgba(141,190,255,0.06)]" />
              ))}
            </div>
          ) : query.isError ? (
            <p className="py-3 text-xs leading-relaxed text-muted">
              The capability report could not be loaded. The API routes may be unavailable in this environment.
            </p>
          ) : cap ? (
            <div className="mt-2">
              <CapabilityRow
                label="CHAIN RPC"
                configured
                detail={`Reading over ${cap.chains.length} configured network${cap.chains.length === 1 ? '' : 's'}: ${cap.chains
                  .map((c) => `${c.name} (ID ${c.id}) via ${c.rpcUrlLabel}`)
                  .join('; ')}.`}
              />
              <CapabilityRow
                label="BLOCK-EXPLORER INDEXER"
                configured={cap.chains.some((c) => c.explorerConfigured)}
                detail={
                  cap.chains.some((c) => c.explorerConfigured)
                    ? 'At least one explorer/indexer API is configured, so paged history is available for those networks.'
                    : 'No explorer/indexer API is configured. History coverage is a bounded scan of recent blocks only.'
                }
              />
              <CapabilityRow
                label="AI NARRATION"
                configured={cap.ai.configured}
                detail={
                  cap.ai.configured
                    ? `Enabled via ${cap.ai.baseUrl} using model ${cap.ai.model}.`
                    : 'AI_API_KEY is unset. Deterministic analysis works fully; the narrative section reports AI NOT CONFIGURED.'
                }
              />
              <CapabilityRow
                label="DATABASE"
                configured={cap.database.configured}
                detail={
                  cap.database.configured
                    ? `PostgreSQL via Prisma (${cap.database.driver}).`
                    : `In-memory storage (${cap.database.driver}). Records do not survive a restart. Set DATABASE_URL to enable PostgreSQL.`
                }
              />
              <CapabilityRow
                label="ANALYSIS REGISTRY CONTRACT"
                configured={cap.registry.configured}
                detail={
                  cap.registry.configured
                    ? `Deployed at ${cap.registry.address} on chain ID ${cap.registry.chainId}.`
                    : 'NEXT_PUBLIC_REGISTRY_ADDRESS is unset, so the UI reports NOT DEPLOYED. No attestation can be submitted.'
                }
              />
              <CapabilityRow
                label="WALLETCONNECT"
                configured={false}
                detail="WalletConnect availability is a client-side setting. Injected wallets (MetaMask, Rabby, Coinbase Wallet extension) work regardless."
              />
            </div>
          ) : null}
        </div>

        {/* Per-chain coverage */}
        {!compact && cap ? (
          <div>
            <div className="hud-label mb-2">DATA COVERAGE PER NETWORK</div>
            <div className="space-y-3">
              {cap.chains.map((c) => (
                <div key={c.key}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-display text-xs font-semibold uppercase tracking-wide2 text-ghost">{c.name}</span>
                    <Badge tone={c.explorerConfigured ? 'violet' : 'neutral'}>
                      {c.explorerConfigured ? 'INDEXER' : 'RPC SCAN'}
                    </Badge>
                  </div>
                  <p className={cn('mt-1.5 text-[0.6875rem] leading-relaxed text-muted')}>{c.historyCoverage}</p>
                  {c.limitations.length > 0 ? (
                    <ul className="mt-2 space-y-1">
                      {c.limitations.map((l, i) => (
                        <li key={i} className="flex gap-2 text-[0.625rem] leading-relaxed text-[rgba(138,154,184,0.9)]">
                          <span className="mt-[5px] h-1 w-1 shrink-0 rounded-full bg-[rgba(141,190,255,0.55)]" />
                          <span>{l}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <div className="hairline my-5" />
      <div className="grid gap-2 sm:grid-cols-3">
        <div className="font-mono text-[0.625rem] uppercase tracking-wide2 text-muted">
          SCAN WINDOW · {cap ? `${cap.limits.scanMaxBlocks.toLocaleString('en-US')} BLOCKS` : '—'}
        </div>
        <div className="font-mono text-[0.625rem] uppercase tracking-wide2 text-muted">
          BATCH SIZE · {cap ? cap.limits.scanBatchSize : '—'}
        </div>
        <div className="font-mono text-[0.625rem] uppercase tracking-wide2 text-muted">
          RATE LIMIT · {cap ? `${cap.limits.apiRateLimitMax} / ${Math.round(cap.limits.apiRateLimitWindowMs / 1000)}S` : '—'}
        </div>
      </div>
    </div>
  );
}
