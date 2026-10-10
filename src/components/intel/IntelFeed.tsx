'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion, useReducedMotion } from 'framer-motion';
import { Activity, ArrowDownLeft, ArrowUpRight, Boxes, FileCode2, Loader2, RefreshCw, Search, WifiOff } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EmptyState, ErrorState, NoticeBanner, SectionHeading, StatTile } from '@/components/ui/panel';
import { CHAIN_META, type ChainKey } from '@/lib/chains';
import { getPublicConfig } from '@/lib/config';
import { cn, formatBlock, relativeTime, shortenAddress, shortenHash } from '@/lib/utils';
import type { DataSourceInfo, IntelEvent } from '@/lib/types';

type KindFilter = 'all' | IntelEvent['kind'];

const KIND_META: Record<IntelEvent['kind'], { icon: React.ComponentType<{ className?: string }>; label: string; tone: 'ice' | 'violet' | 'warn' | 'neutral' }> = {
  native_transfer: { icon: ArrowUpRight, label: 'NATIVE TRANSFER', tone: 'ice' },
  contract_call: { icon: FileCode2, label: 'CONTRACT CALL', tone: 'violet' },
  contract_creation: { icon: Boxes, label: 'CONTRACT DEPLOY', tone: 'neutral' },
  failed_tx: { icon: Activity, label: 'FAILED', tone: 'warn' },
  token_transfer: { icon: Activity, label: 'TOKEN', tone: 'ice' },
};

interface IntelResponse {
  events: IntelEvent[];
  windowScanned: { blocksScanned: number; fromBlock: number | null; toBlock: number | null; matchedBeforeLimit: number };
  chainKey: string;
  chainId: number;
  chainName: string;
  source: DataSourceInfo;
  fetchedAt: string;
}

export function IntelFeed() {
  const pub = getPublicConfig();
  const reduce = useReducedMotion();

  const [chain, setChain] = React.useState<string>(pub.defaultChain);
  const [query, setQuery] = React.useState('');
  const [debounced, setDebounced] = React.useState('');
  const [kind, setKind] = React.useState<KindFilter>('all');
  const [limit, setLimit] = React.useState(40);
  const [now, setNow] = React.useState<Date | null>(null);

  React.useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 20_000);
    return () => clearInterval(id);
  }, []);

  React.useEffect(() => {
    const id = setTimeout(() => setDebounced(query), 400);
    return () => clearTimeout(id);
  }, [query]);

  const feed = useQuery<IntelResponse>({
    queryKey: ['intel-page', chain, debounced, kind, limit],
    queryFn: async () => {
      const sp = new URLSearchParams({ chain, limit: String(limit), blocks: '40' });
      if (debounced.trim()) sp.set('q', debounced.trim());
      if (kind !== 'all') sp.set('kind', kind);
      const res = await fetch(`/api/intel?${sp.toString()}`);
      const json = await res.json();
      if (!res.ok) throw Object.assign(new Error(json?.error?.message ?? 'Feed unavailable'), { payload: json?.error });
      return json.data as IntelResponse;
    },
    refetchInterval: 45_000,
    retry: 1,
  });

  const events = feed.data?.events ?? [];
  const source = feed.data?.source ?? null;
  const error = feed.error as (Error & { payload?: { code: string; message: string } }) | null;

  const counts = React.useMemo(() => {
    const map = new Map<IntelEvent['kind'], number>();
    for (const e of events) map.set(e.kind, (map.get(e.kind) ?? 0) + 1);
    return map;
  }, [events]);

  return (
    <div className="container max-w-[1600px] space-y-6 pb-10 pt-8">
      <SectionHeading
        index="//"
        title="LIVE ON-CHAIN INTEL"
        subtitle="Real transactions lifted from the most recent blocks this deployment can read. Receipt status is deliberately left UNRESOLVED rather than assumed, because the feed does not fetch receipts."
        action={
          <Button variant="outline" size="sm" onClick={() => void feed.refetch()} loading={feed.isFetching}>
            <RefreshCw className="h-3 w-3" />
            REFRESH
          </Button>
        }
      />

      {/* Controls */}
      <div className="glass hud-corners scanline grid gap-4 p-4 md:grid-cols-2 xl:grid-cols-4">
        <div>
          <div className="hud-label mb-2">NETWORK</div>
          <Select value={chain} onValueChange={setChain}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {pub.chains.map((k: ChainKey) => (
                <SelectItem key={k} value={k}>
                  {CHAIN_META[k].shortName} · {CHAIN_META[k].id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <div className="hud-label mb-2">SEARCH</div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-muted" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="hash / address / method"
              className="h-10 pl-7 font-mono text-[0.6875rem]"
              aria-label="Search intel events"
            />
          </div>
        </div>

        <div>
          <div className="hud-label mb-2">EVENT TYPE</div>
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                { id: 'all', label: 'ALL' },
                { id: 'native_transfer', label: 'NATIVE' },
                { id: 'contract_call', label: 'CALLS' },
                { id: 'contract_creation', label: 'DEPLOYS' },
              ] as { id: KindFilter; label: string }[]
            ).map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setKind(f.id)}
                className={cn(
                  'focus-ring border px-2.5 py-1.5 font-mono text-[0.5625rem] uppercase tracking-wide2 transition-colors',
                  kind === f.id
                    ? 'border-[rgba(141,190,255,0.6)] bg-[rgba(141,190,255,0.15)] text-ice'
                    : 'border-[rgba(141,190,255,0.16)] text-muted hover:border-[rgba(141,190,255,0.4)] hover:text-ghost',
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="hud-label mb-2">PAGE SIZE</div>
          <div className="flex gap-1.5">
            {[20, 40, 80].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setLimit(n)}
                className={cn(
                  'focus-ring border px-3 py-1.5 font-mono text-[0.625rem] tabular-nums transition-colors',
                  limit === n
                    ? 'border-[rgba(141,190,255,0.6)] bg-[rgba(141,190,255,0.15)] text-ice'
                    : 'border-[rgba(141,190,255,0.16)] text-muted hover:border-[rgba(141,190,255,0.4)] hover:text-ghost',
                )}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Summary */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="EVENTS SHOWN" value={events.length} hint={`of ${feed.data?.windowScanned.matchedBeforeLimit ?? 0} matched`} />
        <StatTile
          label="BLOCKS SCANNED"
          value={(source?.blocksScanned ?? 0).toLocaleString('en-US')}
          hint={source?.fromBlock ? `${formatBlock(source.fromBlock)} → ${formatBlock(source.toBlock ?? 0)}` : '—'}
        />
        <StatTile
          label="HEAD BLOCK"
          value={source?.latestSyncedBlock ? formatBlock(source.latestSyncedBlock) : '—'}
          tone="ice"
        />
        <StatTile
          label="CONTRACT CALLS"
          value={counts.get('contract_call') ?? 0}
          hint={`${counts.get('contract_creation') ?? 0} deployments in view`}
        />
      </div>

      {error ? (
        <ErrorState
          code={error.payload?.code ?? 'FEED_UNAVAILABLE'}
          message={error.message}
          detail="The feed reports nothing rather than substituting placeholder activity."
        />
      ) : null}

      {/* Feed */}
      {feed.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse-soft bg-[rgba(141,190,255,0.05)]" />
          ))}
        </div>
      ) : events.length === 0 && !feed.isError ? (
        <EmptyState
          icon={WifiOff}
          title="NO LIVE DATA"
          body={`The last ${source?.blocksScanned ?? 0} blocks contained no transaction matching the current filters. This is a real result: either the chain produced nothing in that window, or the filters exclude everything it did produce.`}
          action={
            (query || kind !== 'all') ? (
              <Button
                variant="outline"
                size="sm"
                className="mt-1"
                onClick={() => {
                  setQuery('');
                  setKind('all');
                }}
              >
                CLEAR FILTERS
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ul className="space-y-2">
          {events.map((e, i) => {
            const meta = KIND_META[e.kind] ?? KIND_META.native_transfer;
            const Icon = meta.icon;
            return (
              <motion.li
                key={`${e.txHash}-${i}`}
                initial={reduce ? undefined : { opacity: 0, y: 8 }}
                animate={reduce ? undefined : { opacity: 1, y: 0 }}
                transition={reduce ? undefined : { duration: 0.3, delay: Math.min(i * 0.02, 0.4) }}
                className="glass hud-corners group p-4 transition-colors hover:border-[rgba(141,190,255,0.4)]"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Icon className="h-3.5 w-3.5 text-ice" />
                  <Badge tone={meta.tone}>{meta.label}</Badge>
                  {e.methodLabel ? (
                    <span className="font-mono text-[0.6875rem] text-[rgba(130,124,255,0.95)]">
                      {e.methodLabel.split('(')[0]}
                    </span>
                  ) : e.methodId ? (
                    <span className="font-mono text-[0.6875rem] text-muted">{e.methodId} (unrecognised selector)</span>
                  ) : null}
                  <span className="ml-auto font-mono text-[0.625rem] tabular-nums text-muted">
                    #{formatBlock(e.blockNumber)} · {e.timestamp.slice(0, 19).replace('T', ' ')}Z
                    {now ? ` · ${relativeTime(e.timestamp, now)}` : ''}
                  </span>
                </div>

                <div className="mt-2 grid gap-x-6 gap-y-1 font-mono text-[0.6875rem] sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                  <div className="flex min-w-0 items-center gap-2">
                    <ArrowUpRight className="h-3 w-3 shrink-0 text-[#FF9DB1]" />
                    <span className="truncate text-[rgba(190,214,255,0.9)]" title={e.from}>
                      {shortenAddress(e.from, 10, 8)}
                    </span>
                  </div>
                  <div className="flex min-w-0 items-center gap-2">
                    <ArrowDownLeft className="h-3 w-3 shrink-0 text-[#7EE2A8]" />
                    <span className={cn('truncate', e.to ? 'text-[rgba(190,214,255,0.9)]' : 'text-[#FCD34D]')} title={e.to ?? 'contract creation'}>
                      {e.to ? shortenAddress(e.to, 10, 8) : 'CONTRACT CREATION'}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 sm:justify-end">
                    <span className="tabular-nums text-ghost">{e.valueEth}</span>
                    <Badge tone="neutral">UNRESOLVED</Badge>
                  </div>
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <a
                    href={e.explorerUrl ?? '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={cn(
                      'focus-ring font-mono text-[0.625rem] transition-colors',
                      e.explorerUrl ? 'text-[rgba(141,190,255,0.75)] hover:text-ice' : 'pointer-events-none text-muted',
                    )}
                    title={e.txHash}
                  >
                    {shortenHash(e.txHash, 14, 10)}
                  </a>
                  {!e.explorerUrl ? (
                    <span className="font-mono text-[0.5625rem] text-muted">
                      no explorer configured for this network
                    </span>
                  ) : null}
                </div>
              </motion.li>
            );
          })}
        </ul>
      )}

      {feed.isFetching && !feed.isLoading ? (
        <div className="flex items-center gap-2 font-mono text-[0.625rem] uppercase tracking-wide2 text-muted">
          <Loader2 className="h-3 w-3 animate-spin" />
          REFRESHING FROM CHAIN
        </div>
      ) : null}

      {source?.limitation ? (
        <NoticeBanner tone="info" title="COVERAGE & LIMITS">
          <p>{source.limitation}</p>
          <p className="mt-1.5">
            {source.host} · chain ID {source.chainId} · fetched {source.fetchedAt.slice(0, 19).replace('T', ' ')}Z
          </p>
        </NoticeBanner>
      ) : null}
    </div>
  );
}
