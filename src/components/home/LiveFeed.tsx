'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion, useReducedMotion } from 'framer-motion';
import { Activity, ArrowDownLeft, ArrowUpRight, Boxes, FileCode2, Radio, TriangleAlert } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn, formatBlock, relativeTime, shortenAddress, shortenHash } from '@/lib/utils';
import type { DataSourceInfo, IntelEvent } from '@/lib/types';

interface IntelResponse {
  events: IntelEvent[];
  chainKey: string;
  chainId: number;
  chainName: string;
  source: DataSourceInfo;
  windowScanned: { blocksScanned: number; fromBlock: number | null; toBlock: number | null; matchedBeforeLimit: number };
  fetchedAt: string;
}

const KIND_META: Record<IntelEvent['kind'], { icon: React.ComponentType<{ className?: string }>; label: string }> = {
  native_transfer: { icon: ArrowUpRight, label: 'NATIVE' },
  contract_call: { icon: FileCode2, label: 'CALL' },
  contract_creation: { icon: Boxes, label: 'DEPLOY' },
  failed_tx: { icon: TriangleAlert, label: 'FAILED' },
  token_transfer: { icon: Activity, label: 'TOKEN' },
};

/**
 * LIVE INTELLIGENCE FEED.
 *
 * Reads real transactions from the deployment's configured chain. When the
 * upstream returns nothing, or cannot be reached, the panel shows
 * NO LIVE DATA plus the actual reason — it never fills the space with
 * placeholder rows.
 */
export function LiveFeed({ className, chainKey, limit = 14 }: { className?: string; chainKey: string; limit?: number }) {
  const reduce = useReducedMotion();
  const [now, setNow] = React.useState<Date | null>(null);

  // Render timestamps only after mount so server and client markup match.
  React.useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(id);
  }, []);

  const query = useQuery<IntelResponse>({
    queryKey: ['intel', chainKey, limit],
    queryFn: async () => {
      const res = await fetch(`/api/intel?chain=${encodeURIComponent(chainKey)}&limit=${limit}&blocks=24`);
      const json = await res.json();
      if (!res.ok) {
        const err = new Error(json?.error?.message ?? 'Feed unavailable') as Error & { code?: string };
        err.code = json?.error?.code;
        throw err;
      }
      return json.data as IntelResponse;
    },
    refetchInterval: 30_000,
    retry: 1,
  });

  const events = query.data?.events ?? [];
  const source = query.data?.source ?? null;

  return (
    <div className={cn('glass hud-corners relative flex h-full min-h-[380px] flex-col overflow-hidden', className)}>
      {/* Header */}
      <div className="flex items-center justify-between gap-3 border-b border-[rgba(141,190,255,0.12)] px-4 py-3">
        <div className="flex items-center gap-2.5">
          <span className="relative flex h-2 w-2">
            <span
              className={cn(
                'absolute inline-flex h-full w-full rounded-full opacity-70',
                events.length > 0 ? 'animate-ping bg-[#4ADE80]' : 'bg-muted',
              )}
            />
            <span className={cn('relative inline-flex h-2 w-2 rounded-full', events.length > 0 ? 'bg-[#4ADE80]' : 'bg-muted')} />
          </span>
          <h2 className="font-display text-[0.6875rem] font-semibold uppercase tracking-hud text-ghost">
            LIVE INTELLIGENCE FEED
          </h2>
        </div>
        <Badge tone={query.isError ? 'warn' : events.length > 0 ? 'ok' : 'neutral'}>
          {query.isError ? 'DEGRADED' : events.length > 0 ? `${events.length} EVENTS` : 'IDLE'}
        </Badge>
      </div>

      {/* Sub-header: real source identity */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-[rgba(141,190,255,0.08)] bg-[rgba(3,6,13,0.45)] px-4 py-2 font-mono text-[0.625rem] uppercase tracking-wide2 text-muted">
        <span className="text-ice">{source?.chainKey?.toUpperCase() ?? chainKey.toUpperCase()}</span>
        <span>ID {source?.chainId ?? '—'}</span>
        {source?.latestSyncedBlock !== undefined ? <span>HEAD {formatBlock(source.latestSyncedBlock)}</span> : null}
        {source?.blocksScanned !== undefined ? <span>SCANNED {source.blocksScanned.toLocaleString('en-US')}</span> : null}
        <span className="ml-auto">
          {query.dataUpdatedAt ? new Date(query.dataUpdatedAt).toISOString().replace('T', ' ').slice(0, 19) + 'Z' : '—'}
        </span>
      </div>

      {/* Body */}
      <div className="relative flex-1 overflow-hidden">
        {query.isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-11 animate-pulse-soft bg-[rgba(141,190,255,0.06)]" />
            ))}
          </div>
        ) : query.isError ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 py-10 text-center">
            <TriangleAlert className="h-5 w-5 text-[#FCD34D]" />
            <div className="font-display text-sm font-semibold uppercase tracking-hud text-[#FCD34D]">NO LIVE DATA</div>
            <p className="max-w-xs text-[0.6875rem] leading-relaxed text-muted">
              {(query.error as Error & { code?: string })?.message ??
                'The configured chain endpoint could not be read.'}
            </p>
            <button
              type="button"
              onClick={() => void query.refetch()}
              className="focus-ring border border-[rgba(141,190,255,0.35)] px-3 py-1.5 font-mono text-[0.625rem] uppercase tracking-wide2 text-ice transition-colors hover:bg-[rgba(141,190,255,0.12)]"
            >
              RETRY
            </button>
          </div>
        ) : events.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 py-10 text-center">
            <Radio className="h-5 w-5 text-muted" />
            <div className="font-display text-sm font-semibold uppercase tracking-hud text-muted">NO LIVE DATA</div>
            <p className="max-w-xs text-[0.6875rem] leading-relaxed text-muted">
              The scanned window contained no transactions. This is a real result, not a loading state — the chain
              simply produced no activity in the blocks that were read.
            </p>
          </div>
        ) : (
          <ul className="no-scrollbar h-full max-h-[440px] divide-y divide-[rgba(141,190,255,0.07)] overflow-y-auto">
            {events.map((e, i) => {
              const meta = KIND_META[e.kind] ?? KIND_META.native_transfer;
              const Icon = meta.icon;
              return (
                <motion.li
                  key={`${e.txHash}-${i}`}
                  initial={reduce ? undefined : { opacity: 0, x: 10 }}
                  animate={reduce ? undefined : { opacity: 1, x: 0 }}
                  transition={reduce ? undefined : { duration: 0.32, delay: Math.min(i * 0.035, 0.5) }}
                  className="group px-4 py-2.5 transition-colors hover:bg-[rgba(141,190,255,0.045)]"
                >
                  <div className="flex items-center gap-2">
                    <Icon className="h-3 w-3 shrink-0 text-ice" />
                    <span className="font-mono text-[0.625rem] uppercase tracking-wide2 text-muted">{meta.label}</span>
                    {e.methodLabel ? (
                      <span className="truncate font-mono text-[0.625rem] text-[rgba(130,124,255,0.95)]">
                        {e.methodLabel.split('(')[0]}
                      </span>
                    ) : null}
                    <span className="ml-auto shrink-0 font-mono text-[0.625rem] tabular-nums text-muted">
                      #{formatBlock(e.blockNumber)}
                    </span>
                  </div>

                  <div className="mt-1.5 flex items-center gap-1.5 font-mono text-[0.6875rem]">
                    <span className="text-[rgba(190,214,255,0.85)]">{shortenAddress(e.from, 6, 4)}</span>
                    <span className="text-muted">→</span>
                    <span className={cn(e.to ? 'text-[rgba(190,214,255,0.85)]' : 'text-[#FCD34D]')}>
                      {e.to ? shortenAddress(e.to, 6, 4) : 'CONTRACT DEPLOY'}
                    </span>
                    <span className="ml-auto tabular-nums text-ghost">{e.valueEth}</span>
                  </div>

                  <div className="mt-1 flex items-center gap-2">
                    {e.explorerUrl ? (
                      <a
                        href={e.explorerUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="focus-ring font-mono text-[0.625rem] text-[rgba(141,190,255,0.65)] transition-colors hover:text-ice"
                        title={e.txHash}
                      >
                        {shortenHash(e.txHash, 8, 6)}
                      </a>
                    ) : (
                      <span className="font-mono text-[0.625rem] text-muted" title={e.txHash}>
                        {shortenHash(e.txHash, 8, 6)}
                      </span>
                    )}
                    <span className="font-mono text-[0.625rem] text-muted">
                      {now ? relativeTime(e.timestamp, now) : e.timestamp.slice(11, 19) + 'Z'}
                    </span>
                  </div>
                </motion.li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Footer: coverage honesty */}
      <div className="border-t border-[rgba(141,190,255,0.12)] px-4 py-2.5">
        <p className="text-[0.625rem] leading-relaxed text-muted">
          {source?.limitation ??
            'Bounded recent-block scan over the configured RPC endpoint. Transaction confirmation status is not resolved for the feed.'}
        </p>
      </div>
    </div>
  );
}
