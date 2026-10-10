'use client';

import * as React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import {
  Activity,
  ArrowDownLeft,
  ArrowUpRight,
  Bot,
  CircleSlash,
  ExternalLink,
  Filter,
  Gauge,
  GitBranch,
  Hash,
  Layers,
  Repeat,
  ShieldAlert,
  TriangleAlert,
  Wallet,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DataSourceCard, EmptyState, EvidenceLink, MonoHash, NotConfigured, SectionHeading, StatTile } from '@/components/ui/panel';
import { Input, RangeInput } from '@/components/ui/input';
import { cn, formatBlock, formatEth, formatUnits, shortenAddress, shortenHash } from '@/lib/utils';
import { explorerTxUrl } from '@/lib/chains';
import type {
  AnalysisReport,
  AnomalyFlag,
  ArchiveRecord,
  CounterpartyStat,
  TransactionRecord,
} from '@/lib/types';

// ---------------------------------------------------------------------------
// Flow overview
// ---------------------------------------------------------------------------
export function FlowOverview({ report }: { report: AnalysisReport }) {
  const { flow, profile } = report.stats;
  const net = BigInt(flow.netFlowWei);
  const netTone = net > 0n ? 'ok' : net < 0n ? 'bad' : 'default';

  return (
    <div>
      <SectionHeading
        index="01"
        title="CAPITAL FLOW"
        subtitle={`Computed from ${report.stats.txCount} transaction${report.stats.txCount === 1 ? '' : 's'} actually read inside the scanned block window. Values are the raw native-currency amount moved; token transfers are not summed here.`}
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="NET FLOW"
          value={`${net >= 0n ? '+' : '−'}${formatUnits(net < 0n ? -net : net, 18, 6)}`}
          unit="ETH"
          tone={netTone}
          hint="Inbound minus outbound across the window"
        />
        <StatTile
          label="INBOUND"
          value={formatUnits(flow.inboundVolumeWei, 18, 6)}
          unit="ETH"
          hint={`${flow.inboundTxCount} transaction${flow.inboundTxCount === 1 ? '' : 's'}`}
        />
        <StatTile
          label="OUTBOUND"
          value={formatUnits(flow.outboundVolumeWei, 18, 6)}
          unit="ETH"
          hint={`${flow.outboundTxCount} transaction${flow.outboundTxCount === 1 ? '' : 's'}`}
        />
        <StatTile
          label="FEES PAID"
          value={formatUnits(flow.totalFeesWei, 18, 8)}
          unit="ETH"
          hint={flow.successRate > 0 ? `${(flow.successRate * 100).toFixed(1)}% observed success rate` : 'Split not available'}
        />
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="COUNTERPARTIES" value={flow.uniqueCounterparties} hint="Distinct non-system addresses touched" />
        <StatTile
          label="CONTRACT CALLS"
          value={flow.contractInteractions}
          hint={`${flow.contractCreations} contract deployment${flow.contractCreations === 1 ? '' : 's'}`}
        />
        <StatTile
          label="ACTIVITY RATE"
          value={flow.txPerHour.toFixed(2)}
          unit="TX/H"
          hint={flow.busiestHourISO ? `Busiest hour ${flow.busiestHourISO.slice(0, 16)}Z (${flow.busiestHourTxCount} tx)` : '—'}
        />
        <StatTile
          label="ACTIVE BLOCKS"
          value={flow.activeBlocks}
          hint={
            flow.firstActivityAt && flow.lastActivityAt
              ? `${flow.firstActivityAt.slice(0, 16)}Z → ${flow.lastActivityAt.slice(0, 16)}Z`
              : 'No activity in window'
          }
        />
      </div>

      {/* Address state */}
      <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
        <div className="glass hud-corners p-4">
          <div className="hud-label">SUBJECT ADDRESS</div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <MonoHash value={profile.address} />
            <Badge tone={profile.isContract ? 'violet' : 'ice'}>{profile.isContract ? 'CONTRACT' : 'EOA'}</Badge>
          </div>
          <dl className="mt-3 space-y-1.5 font-mono text-[0.6875rem]">
            <div className="flex justify-between gap-3">
              <dt className="text-muted">BALANCE</dt>
              <dd className="text-ghost">{profile.balanceEth !== null ? `${profile.balanceEth} ETH` : 'UNAVAILABLE'}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted">NONCE</dt>
              <dd className="text-ghost">{profile.nonce ?? 'UNAVAILABLE'}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted">CODE SIZE</dt>
              <dd className="text-ghost">{profile.codeSize !== null ? `${profile.codeSize} bytes` : 'UNAVAILABLE'}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted">STATE BLOCK</dt>
              <dd className="text-ghost">{profile.stateReadAtBlock ? formatBlock(profile.stateReadAtBlock) : '—'}</dd>
            </div>
          </dl>
          {profile.stateUnavailableReason ? (
            <p className="mt-2 text-[0.625rem] leading-relaxed text-[#FCD34D]">{profile.stateUnavailableReason}</p>
          ) : null}
        </div>

        {/* Method / type breakdown */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="glass hud-corners p-4">
            <div className="hud-label">CALLED METHODS</div>
            <ul className="mt-2 space-y-1.5">
              {report.stats.methodBreakdown.slice(0, 6).map((m) => (
                <li key={m.method} className="flex items-center justify-between gap-3">
                  <span className="truncate font-mono text-[0.625rem] text-ghost" title={m.label ?? m.method}>
                    {m.label ? m.label.split('(')[0] : m.method === 'native-transfer' ? 'native transfer' : m.method}
                  </span>
                  <span className="shrink-0 font-mono text-[0.625rem] tabular-nums text-ice">{m.count}</span>
                </li>
              ))}
              {report.stats.methodBreakdown.length === 0 ? (
                <li className="text-[0.625rem] text-muted">No transactions in window.</li>
              ) : null}
            </ul>
          </div>
          <div className="glass hud-corners p-4">
            <div className="hud-label">TRANSACTION ENVELOPES</div>
            <ul className="mt-2 space-y-1.5">
              {report.stats.typeBreakdown.slice(0, 6).map((t) => (
                <li key={t.type} className="flex items-center justify-between gap-3">
                  <span className="truncate font-mono text-[0.625rem] text-ghost">{t.label}</span>
                  <span className="shrink-0 font-mono text-[0.625rem] tabular-nums text-ice">{t.count}</span>
                </li>
              ))}
              {report.stats.typeBreakdown.length === 0 ? (
                <li className="text-[0.625rem] text-muted">No transactions in window.</li>
              ) : null}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Counterparties
// ---------------------------------------------------------------------------
export function CounterpartyPanel({ report }: { report: AnalysisReport }) {
  const [query, setQuery] = React.useState('');
  const [onlyContracts, setOnlyContracts] = React.useState(false);

  const rows = report.stats.counterparties.filter((c) => {
    if (onlyContracts && !c.isContract) return false;
    if (!query.trim()) return true;
    return c.address.includes(query.trim().toLowerCase());
  });

  return (
    <div>
      <SectionHeading
        index="02"
        title="COUNTERPARTIES & CONTRACT INTERACTIONS"
        subtitle="Every address that appeared on the other side of a transaction in the scanned window. “Contract” is asserted only when the chain reports bytecode at that address or the transaction called a contract."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Filter className="absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-muted" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="filter 0x…"
                className="h-8 w-[190px] pl-7 font-mono text-[0.6875rem]"
                aria-label="Filter counterparties by address"
              />
            </div>
            <Button
              variant={onlyContracts ? 'primary' : 'outline'}
              size="sm"
              onClick={() => setOnlyContracts((v) => !v)}
            >
              CONTRACTS ONLY
            </Button>
          </div>
        }
      />

      {rows.length === 0 ? (
        <EmptyState
          icon={CircleSlash}
          title="No counterparties in this window"
          body="The scanned block range contained no transactions for this address. Widen the scan or confirm the address is active on this network."
        />
      ) : (
        <div className="glass overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] border-collapse">
              <thead>
                <tr className="border-b border-[rgba(141,190,255,0.14)] bg-[rgba(3,6,13,0.5)]">
                  {['ADDRESS', 'TYPE', 'IN', 'OUT', 'IN VOLUME', 'OUT VOLUME', 'SHARE', 'LAST SEEN', 'EVIDENCE'].map((h) => (
                    <th key={h} className="px-3 py-2.5 text-left font-mono text-[0.5625rem] uppercase tracking-hud text-muted">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 60).map((c) => (
                  <CounterpartyRow key={c.address} c={c} chainKey={report.chainKey} />
                ))}
              </tbody>
            </table>
          </div>
          {rows.length > 60 ? (
            <div className="border-t border-[rgba(141,190,255,0.12)] px-3 py-2 text-[0.625rem] text-muted">
              Showing the 60 highest-activity counterparties of {rows.length} total.
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function CounterpartyRow({ c, chainKey }: { c: CounterpartyStat; chainKey: string }) {
  return (
    <tr className="border-b border-[rgba(141,190,255,0.06)] transition-colors hover:bg-[rgba(141,190,255,0.04)]">
      <td className="px-3 py-2.5">
        <span className="font-mono text-[0.6875rem] text-ghost" title={c.address}>
          {shortenAddress(c.address, 8, 6)}
        </span>
      </td>
      <td className="px-3 py-2.5">
        <Badge tone={c.isContract ? 'violet' : c.isContract === false ? 'ice' : 'neutral'}>
          {c.isContract === true ? 'CONTRACT' : c.isContract === false ? 'EOA' : 'UNKNOWN'}
        </Badge>
      </td>
      <td className="px-3 py-2.5 font-mono text-[0.6875rem] tabular-nums text-[#7EE2A8]">{c.inboundCount}</td>
      <td className="px-3 py-2.5 font-mono text-[0.6875rem] tabular-nums text-[#FF9DB1]">{c.outboundCount}</td>
      <td className="px-3 py-2.5 font-mono text-[0.6875rem] tabular-nums text-ghost">{formatUnits(c.volumeInWei, 18, 5)}</td>
      <td className="px-3 py-2.5 font-mono text-[0.6875rem] tabular-nums text-ghost">{formatUnits(c.volumeOutWei, 18, 5)}</td>
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-2">
          <div className="h-1 w-14 overflow-hidden rounded-full bg-[rgba(141,190,255,0.14)]">
            <div className="h-full bg-ice" style={{ width: `${Math.min(100, c.share * 100)}%` }} />
          </div>
          <span className="font-mono text-[0.625rem] tabular-nums text-muted">{Math.round(c.share * 100)}%</span>
        </div>
      </td>
      <td className="px-3 py-2.5 font-mono text-[0.625rem] text-muted">
        {c.lastSeenAt.slice(0, 16).replace('T', ' ')}Z
      </td>
      <td className="px-3 py-2.5">
        {c.sampleTxHashes[0] ? (
          <EvidenceLink href={explorerTxUrl(chainKey, c.sampleTxHashes[0])} label={shortenHash(c.sampleTxHashes[0], 6, 4)} />
        ) : (
          <span className="text-[0.625rem] text-muted">—</span>
        )}
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Transactions
// ---------------------------------------------------------------------------
type TxFilter = 'all' | 'in' | 'out' | 'contract' | 'failed';

export function TransactionTable({ report }: { report: AnalysisReport }) {
  const [filter, setFilter] = React.useState<TxFilter>('all');
  const [query, setQuery] = React.useState('');

  const rows = report.transactions.filter((t) => {
    if (filter === 'in' && t.direction !== 'in') return false;
    if (filter === 'out' && t.direction !== 'out') return false;
    if (filter === 'contract' && !t.isContractInteraction && !t.isContractCreation) return false;
    if (filter === 'failed' && t.status !== 'failed') return false;
    if (!query.trim()) return true;
    const q = query.trim().toLowerCase();
    return (
      t.hash.toLowerCase().includes(q) ||
      t.from.includes(q) ||
      (t.to ?? '').includes(q) ||
      (t.methodLabel ?? '').toLowerCase().includes(q)
    );
  });

  const filters: { id: TxFilter; label: string }[] = [
    { id: 'all', label: `ALL ${report.transactions.length}` },
    { id: 'in', label: 'INBOUND' },
    { id: 'out', label: 'OUTBOUND' },
    { id: 'contract', label: 'CONTRACT' },
    { id: 'failed', label: 'FAILED' },
  ];

  return (
    <div>
      <SectionHeading
        index="03"
        title="TRANSACTION EVIDENCE"
        subtitle="The raw rows behind every number above. Each hash opens the transaction in the network's block explorer, so any figure in this report can be independently verified."
        action={
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="search hash / address / method"
            className="h-8 w-[240px] font-mono text-[0.6875rem]"
            aria-label="Search transactions"
          />
        }
      />

      <div className="mb-3 flex flex-wrap gap-1.5">
        {filters.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={cn(
              'focus-ring border px-2.5 py-1.5 font-mono text-[0.5625rem] uppercase tracking-wide2 transition-colors',
              filter === f.id
                ? 'border-[rgba(141,190,255,0.6)] bg-[rgba(141,190,255,0.15)] text-ice'
                : 'border-[rgba(141,190,255,0.16)] text-muted hover:border-[rgba(141,190,255,0.4)] hover:text-ghost',
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={Hash} title="No matching transactions" body="Adjust the filter or search term." />
      ) : (
        <div className="glass overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] border-collapse">
              <thead>
                <tr className="border-b border-[rgba(141,190,255,0.14)] bg-[rgba(3,6,13,0.5)]">
                  {['HASH', 'BLOCK', 'TIME (UTC)', 'DIR', 'FROM', 'TO', 'VALUE', 'METHOD', 'STATUS'].map((h) => (
                    <th key={h} className="px-3 py-2.5 text-left font-mono text-[0.5625rem] uppercase tracking-hud text-muted">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 150).map((t) => (
                  <TransactionRow key={t.hash} t={t} />
                ))}
              </tbody>
            </table>
          </div>
          <div className="border-t border-[rgba(141,190,255,0.12)] px-3 py-2 text-[0.625rem] text-muted">
            {rows.length > 150
              ? `Showing 150 of ${rows.length} matching transactions.`
              : `${rows.length} transaction${rows.length === 1 ? '' : 's'} shown. All rows come from the block scan described in the data sources.`}
          </div>
        </div>
      )}
    </div>
  );
}

function TransactionRow({ t }: { t: TransactionRecord }) {
  const dirMeta = {
    in: { icon: ArrowDownLeft, cls: 'text-[#7EE2A8]', label: 'IN' },
    out: { icon: ArrowUpRight, cls: 'text-[#FF9DB1]', label: 'OUT' },
    self: { icon: Repeat, cls: 'text-[#FCD34D]', label: 'SELF' },
  }[t.direction];
  const Icon = dirMeta.icon;

  return (
    <tr className="border-b border-[rgba(141,190,255,0.06)] transition-colors hover:bg-[rgba(141,190,255,0.04)]">
      <td className="px-3 py-2.5">
        <EvidenceLink href={t.explorerUrl} label={shortenHash(t.hash, 10, 8)} />
      </td>
      <td className="px-3 py-2.5 font-mono text-[0.6875rem] tabular-nums text-muted">{formatBlock(t.blockNumber)}</td>
      <td className="px-3 py-2.5 font-mono text-[0.625rem] text-muted">{t.timestamp.slice(0, 19).replace('T', ' ')}Z</td>
      <td className="px-3 py-2.5">
        <span className={cn('inline-flex items-center gap-1 font-mono text-[0.625rem]', dirMeta.cls)}>
          <Icon className="h-3 w-3" />
          {dirMeta.label}
        </span>
      </td>
      <td className="px-3 py-2.5 font-mono text-[0.625rem] text-ghost">{shortenAddress(t.from, 6, 4)}</td>
      <td className="px-3 py-2.5 font-mono text-[0.625rem]">
        {t.to ? (
          <span className="text-ghost">{shortenAddress(t.to, 6, 4)}</span>
        ) : (
          <span className="text-[#FCD34D]">DEPLOY</span>
        )}
      </td>
      <td className="px-3 py-2.5 font-mono text-[0.625rem] tabular-nums text-ghost">{t.valueEth}</td>
      <td className="max-w-[190px] px-3 py-2.5 font-mono text-[0.625rem] text-[rgba(130,124,255,0.95)]">
        <span className="block truncate" title={t.methodLabel ?? t.methodId ?? 'native transfer'}>
          {t.methodLabel ? t.methodLabel.split('(')[0] : t.methodId ?? 'native transfer'}
        </span>
      </td>
      <td className="px-3 py-2.5">
        <Badge tone={t.status === 'success' ? 'ok' : t.status === 'failed' ? 'bad' : 'neutral'}>
          {t.status === 'unknown' ? 'UNRESOLVED' : t.status.toUpperCase()}
        </Badge>
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Anomalies
// ---------------------------------------------------------------------------
const SEVERITY_TONE: Record<AnomalyFlag['severity'], 'neutral' | 'ice' | 'warn' | 'bad'> = {
  info: 'neutral',
  low: 'neutral',
  medium: 'warn',
  high: 'bad',
};

export function AnomalyPanel({ report }: { report: AnalysisReport }) {
  const anomalies = report.stats.anomalies;
  return (
    <div>
      <SectionHeading
        index="04"
        title="PATTERN FLAGS"
        subtitle="Each flag is a deterministic rule with a stated threshold. Flags describe shapes in the data — they are not accusations, and every one of them has innocent explanations listed alongside."
      />
      {anomalies.length === 0 ? (
        <EmptyState
          icon={ShieldAlert}
          title="No pattern flags triggered"
          body="None of the engine's rules fired for this wallet inside the scanned window. That means no threshold was crossed — it is not a clean bill of health."
        />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {anomalies.map((a, i) => (
            <motion.div
              key={a.id}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.35, delay: i * 0.05 }}
              className="glass hud-corners p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  <TriangleAlert className="h-4 w-4 text-[#FCD34D]" />
                  <span className="font-display text-xs font-semibold uppercase tracking-wide2 text-ghost">{a.title}</span>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <Badge tone={SEVERITY_TONE[a.severity]}>{a.severity.toUpperCase()}</Badge>
                  <Badge tone="ice">{(a.confidence * 100).toFixed(0)}% CONF</Badge>
                </div>
              </div>
              <p className="mt-2.5 text-[0.6875rem] leading-relaxed text-muted">{a.detail}</p>

              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 border-t border-[rgba(141,190,255,0.1)] pt-2.5">
                {a.evidence.map((e) => (
                  <div key={e.label} className="min-w-0">
                    <dt className="text-[0.5625rem] uppercase tracking-wide2 text-[rgba(138,154,184,0.7)]">{e.label}</dt>
                    <dd className="truncate font-mono text-[0.6875rem] text-ghost" title={e.value}>
                      {e.value}
                    </dd>
                  </div>
                ))}
              </dl>

              {a.sampleTxHashes.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {a.sampleTxHashes.slice(0, 3).map((h) => (
                    <EvidenceLink key={h} href={explorerTxUrl(report.chainKey, h)} label={shortenHash(h, 8, 6)} />
                  ))}
                </div>
              ) : null}
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Graph summary
// ---------------------------------------------------------------------------
export function GraphSummary({ report }: { report: AnalysisReport }) {
  const { nodes, edges } = report.graph;
  const topEdges = [...edges].sort((a, b) => b.confidence - a.confidence).slice(0, 8);

  return (
    <div>
      <SectionHeading
        index="05"
        title="RELATIONSHIP GRAPH"
        subtitle="Edges are ranked by confidence, which blends transaction frequency, bidirectionality and how spread out the activity is. Confidence measures the strength of the observed pattern only — it is never a statement about who controls either address."
        action={
          <Button asChild variant="outline" size="sm">
            <a href={`/network?address=${report.subject}&chain=${report.chainKey}`}>
              <GitBranch className="h-3 w-3" />
              OPEN IN EXPLORER
            </a>
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="NODES" value={nodes.length} />
        <StatTile label="EDGES" value={edges.length} />
        <StatTile
          label="HIGHEST CONFIDENCE"
          value={topEdges[0] ? `${(topEdges[0].confidence * 100).toFixed(0)}%` : '—'}
          tone="ice"
        />
        <StatTile
          label="BIDIRECTIONAL EDGES"
          value={edges.filter((e) => e.direction === 'both').length}
          hint="Value moves both ways"
        />
      </div>

      {topEdges.length === 0 ? (
        <EmptyState icon={GitBranch} title="No edges to display" body="The window contained no counterparty activity." />
      ) : (
        <div className="mt-3 space-y-2">
          {topEdges.map((e) => (
            <div key={e.id} className="glass px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="ice">{(e.confidence * 100).toFixed(0)}% CONFIDENCE</Badge>
                <Badge tone={e.direction === 'both' ? 'violet' : 'neutral'}>{e.direction.toUpperCase()}</Badge>
                <span className="font-mono text-[0.6875rem] text-ghost">
                  {shortenAddress(e.source, 6, 4)} ↔ {shortenAddress(e.target, 6, 4)}
                </span>
                <span className="ml-auto font-mono text-[0.625rem] text-muted">
                  {e.txCount} TX · {formatEth(e.volumeWei)}
                </span>
              </div>
              <ul className="mt-2 space-y-1">
                {e.basis.map((b, i) => (
                  <li key={i} className="flex gap-2 text-[0.625rem] leading-relaxed text-muted">
                    <span className="mt-[5px] h-1 w-1 shrink-0 rounded-full bg-[rgba(141,190,255,0.5)]" />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// AI narrative
// ---------------------------------------------------------------------------
export function AiPanel({ report }: { report: AnalysisReport }) {
  const ai = report.ai;

  if (ai.status === 'not_configured') {
    return (
      <div>
        <SectionHeading
          index="06"
          title="AI NARRATIVE LAYER"
          subtitle="The narrative layer is optional. When it is absent, the deterministic analysis above is complete and unchanged."
        />
        <NotConfigured
          feature="AI NARRATIVE"
          requirement="Set AI_API_KEY (and optionally AI_BASE_URL / AI_MODEL) in the server environment to enable this section. No key is ever shipped to the browser."
        />
        {ai.limitations.length > 0 ? (
          <ul className="mt-3 space-y-1.5">
            {ai.limitations.map((l, i) => (
              <li key={i} className="flex gap-2 text-[0.6875rem] leading-relaxed text-muted">
                <span className="mt-[6px] h-1 w-1 shrink-0 rounded-full bg-[rgba(141,190,255,0.5)]" />
                <span>{l}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    );
  }

  if (ai.status === 'failed') {
    return (
      <div>
        <SectionHeading index="06" title="AI NARRATIVE LAYER" subtitle="The model was called but its output was rejected." />
        <Card className="border-[rgba(255,92,122,0.35)]">
          <CardHeader>
            <CardTitle className="text-[#FF9DB1]">AI OUTPUT REJECTED</CardTitle>
            <Badge tone="bad">{ai.error?.code ?? 'AI_FAILED'}</Badge>
          </CardHeader>
          <CardContent>
            <p className="text-xs leading-relaxed text-ghost">{ai.error?.message}</p>
            {ai.error?.detail ? (
              <p className="mt-2 font-mono text-[0.625rem] leading-relaxed text-muted">{ai.error.detail}</p>
            ) : null}
            <p className="mt-3 text-[0.6875rem] leading-relaxed text-muted">
              Invalid or non-conforming model output is discarded rather than displayed. The deterministic analysis in
              sections 01–05 is unaffected and remains the authoritative result.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <SectionHeading
        index="06"
        title="AI NARRATIVE LAYER"
        subtitle="Generated only from the deterministic statistics above — the model never receives raw chain data. Every finding states its own confidence, basis and limitations."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="violet">
              <Bot className="h-3 w-3" />
              {ai.model}
            </Badge>
            <Badge tone="neutral">{ai.generatedAt.slice(0, 19).replace('T', ' ')}Z</Badge>
          </div>
        }
      />

      <Card className="mb-3">
        <CardHeader>
          <CardTitle>SUMMARY</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="whitespace-pre-line text-xs leading-relaxed text-ghost">{ai.summary}</p>
        </CardContent>
      </Card>

      {ai.findings.length > 0 ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {ai.findings.map((f, i) => (
            <div key={i} className="glass hud-corners p-4">
              <div className="flex items-start justify-between gap-3">
                <span className="font-display text-xs font-semibold uppercase tracking-wide2 text-ghost">{f.title}</span>
                <Badge tone="ice">{(f.confidence * 100).toFixed(0)}% CONF</Badge>
              </div>
              <p className="mt-2.5 text-[0.6875rem] leading-relaxed text-muted">{f.detail}</p>

              {f.basis.length > 0 ? (
                <div className="mt-3">
                  <div className="hud-label mb-1.5">BASIS</div>
                  <ul className="space-y-1">
                    {f.basis.map((b, bi) => (
                      <li key={bi} className="flex gap-2 text-[0.625rem] leading-relaxed text-muted">
                        <Layers className="mt-[2px] h-2.5 w-2.5 shrink-0 text-ice" />
                        <span>{b}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {f.limitations.length > 0 ? (
                <div className="mt-3 border-t border-[rgba(141,190,255,0.1)] pt-2.5">
                  <div className="hud-label mb-1.5">LIMITATIONS</div>
                  <ul className="space-y-1">
                    {f.limitations.map((l, li) => (
                      <li key={li} className="flex gap-2 text-[0.625rem] leading-relaxed text-[rgba(138,154,184,0.9)]">
                        <ShieldAlert className="mt-[2px] h-2.5 w-2.5 shrink-0 text-[#FCD34D]" />
                        <span>{l}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {f.sampleTxHashes.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {f.sampleTxHashes.slice(0, 3).map((h) => (
                    <EvidenceLink key={h} href={explorerTxUrl(report.chainKey, h)} label={shortenHash(h, 8, 6)} />
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {ai.timeline.length > 0 ? (
        <Card className="mt-3">
          <CardHeader>
            <CardTitle>TIMELINE</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="relative space-y-4 border-l border-[rgba(141,190,255,0.2)] pl-5">
              {ai.timeline.map((t, i) => (
                <li key={i} className="relative">
                  <span className="absolute -left-[25px] top-[5px] h-1.5 w-1.5 rounded-full bg-ice shadow-[0_0_10px_rgba(141,190,255,1)]" />
                  <div className="font-mono text-[0.6875rem] uppercase tracking-wide2 text-ice">{t.label}</div>
                  <p className="mt-1 text-[0.6875rem] leading-relaxed text-muted">{t.detail}</p>
                  {t.txHashes.length > 0 ? (
                    <div className="mt-1.5 flex flex-wrap gap-2">
                      {t.txHashes.slice(0, 3).map((h) => (
                        <EvidenceLink key={h} href={explorerTxUrl(report.chainKey, h)} label={shortenHash(h, 8, 6)} />
                      ))}
                    </div>
                  ) : null}
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      ) : null}

      {ai.riskNotes.length > 0 ? (
        <Card className="mt-3 border-[rgba(251,191,36,0.28)]">
          <CardHeader>
            <CardTitle className="text-[#FCD34D]">RISK NOTES</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {ai.riskNotes.map((r, i) => (
                <li key={i} className="flex gap-2 text-[0.6875rem] leading-relaxed text-muted">
                  <TriangleAlert className="mt-[2px] h-3 w-3 shrink-0 text-[#FCD34D]" />
                  <span>{r}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <div className="mt-3 border border-[rgba(141,190,255,0.18)] bg-[rgba(141,190,255,0.04)] px-4 py-3">
        <div className="flex items-center gap-2">
          <Gauge className="h-3.5 w-3.5 text-ice" />
          <span className="font-display text-[0.6875rem] font-semibold uppercase tracking-hud text-ice">
            AI POLICY APPLIED TO THIS OUTPUT
          </span>
        </div>
        <p className="mt-1.5 text-[0.6875rem] leading-relaxed text-muted">{ai.policy}</p>
        {ai.limitations.length > 0 ? (
          <ul className="mt-2 space-y-1">
            {ai.limitations.map((l, i) => (
              <li key={i} className="flex gap-2 text-[0.625rem] leading-relaxed text-muted">
                <span className="mt-[6px] h-1 w-1 shrink-0 rounded-full bg-[rgba(141,190,255,0.5)]" />
                <span>{l}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Provenance + archive actions
// ---------------------------------------------------------------------------
export function ProvenancePanel({
  report,
  onArchive,
  archiving,
  archived,
}: {
  report: AnalysisReport;
  onArchive: (label: string) => void;
  archiving: boolean;
  archived: ArchiveRecord | null;
}) {
  const [label, setLabel] = React.useState('');

  return (
    <div>
      <SectionHeading
        index="07"
        title="PROVENANCE & ARCHIVE"
        subtitle="Exactly where each number came from, and what was actually examined. The digest below is the deterministic commitment to the inputs — that is what gets notarised, never the report body."
      />

      <div className="space-y-3">
        {report.dataSources.map((s, i) => (
          <DataSourceCard key={`${s.strategy}-${i}`} source={s} />
        ))}
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="glass hud-corners p-4">
          <div className="hud-label">REPORT DIGEST (SHA-256)</div>
          <div className="mt-2">
            <MonoHash value={report.reportHash} />
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 font-mono text-[0.625rem]">
            <div>
              <dt className="text-muted">VERSION</dt>
              <dd className="text-ghost">{report.reportVersion}</dd>
            </div>
            <div>
              <dt className="text-muted">GENERATED</dt>
              <dd className="text-ghost">{report.createdAt.slice(0, 19).replace('T', ' ')}Z</dd>
            </div>
            <div>
              <dt className="text-muted">CHAIN</dt>
              <dd className="text-ghost">
                {report.chainKey} · ID {report.chainId}
              </dd>
            </div>
            <div>
              <dt className="text-muted">TRANSACTIONS</dt>
              <dd className="text-ghost">{report.transactions.length}</dd>
            </div>
          </dl>
          <p className="mt-3 text-[0.625rem] leading-relaxed text-muted">
            Changing any input transaction changes this digest. Two reports with the same digest were computed from
            identical inputs.
          </p>
        </div>

        <div className="glass hud-corners p-4">
          <div className="hud-label">SAVE TO ARCHIVE</div>
          {archived ? (
            <div className="mt-2">
              <Badge tone={archived.attestation.status === 'confirmed' ? 'ok' : archived.attestation.status === 'not_deployed' ? 'neutral' : 'warn'}>
                {archived.attestation.status === 'not_deployed' ? 'SAVED · NOT DEPLOYED ON-CHAIN' : archived.attestation.status.toUpperCase()}
              </Badge>
              <p className="mt-2 text-[0.625rem] leading-relaxed text-muted">
                Record <span className="font-mono text-ghost">{archived.id}</span> created. {archived.attestation.error ?? ''}
              </p>
              <Button asChild variant="outline" size="sm" className="mt-3 w-full">
                <a href="/archive">
                  OPEN ARCHIVE
                  <ExternalLink className="h-3 w-3" />
                </a>
              </Button>
            </div>
          ) : (
            <>
              <Input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Label this analysis"
                className="mt-2 h-9 text-xs"
                maxLength={120}
                aria-label="Archive label"
              />
              <Button
                variant="primary"
                size="sm"
                className="mt-3 w-full"
                loading={archiving}
                onClick={() => onArchive(label.trim() || `Analysis of ${shortenAddress(report.subject, 8, 6)}`)}
              >
                <Wallet className="h-3 w-3" />
                SAVE ANALYSIS
              </Button>
              <p className="mt-2 text-[0.625rem] leading-relaxed text-muted">
                Stores the digest, version, subject wallet and timestamp. If the registry contract is not deployed, the
                record is saved and explicitly marked NOT DEPLOYED rather than presented as on-chain.
              </p>
            </>
          )}
        </div>
      </div>

      <p className="mt-4 border-l-2 border-[rgba(141,190,255,0.35)] pl-3 text-[0.6875rem] leading-relaxed text-muted">
        {report.disclaimer}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Time histogram (inline SVG, no chart dependency)
// ---------------------------------------------------------------------------
export function ActivityHistogram({ report }: { report: AnalysisReport }) {
  const reduce = useReducedMotion();
  const buckets = report.stats.activityByHour;
  if (buckets.length === 0) return null;

  const max = Math.max(...buckets.map((b) => b.txCount), 1);
  const width = 100;
  const barW = Math.max(width / buckets.length, 0.6);

  return (
    <div className="glass hud-corners p-4">
      <div className="flex items-center justify-between">
        <div className="hud-label">ACTIVITY BY HOUR (UTC)</div>
        <Badge tone="neutral">{buckets.length} ACTIVE HOURS</Badge>
      </div>
      <svg viewBox={`0 0 ${width} 34`} className="mt-3 h-24 w-full" preserveAspectRatio="none" role="img" aria-label="Transactions per hour">
        <defs>
          <linearGradient id="gp-hist" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0" stopColor="#827CFF" stopOpacity="0.35" />
            <stop offset="1" stopColor="#8DBEFF" stopOpacity="0.95" />
          </linearGradient>
        </defs>
        {buckets.map((b, i) => {
          const h = (b.txCount / max) * 30;
          const x = (i / buckets.length) * width;
          return (
            <motion.rect
              key={b.bucketStartISO}
              x={x}
              y={32 - h}
              width={Math.max(barW * 0.72, 0.35)}
              height={h}
              fill="url(#gp-hist)"
              initial={reduce ? undefined : { height: 0, y: 32 }}
              whileInView={reduce ? undefined : { height: h, y: 32 - h }}
              viewport={{ once: true }}
              transition={reduce ? undefined : { duration: 0.45, delay: Math.min(i * 0.012, 0.5) }}
            >
              <title>{`${b.bucketStartISO.slice(0, 16)}Z — ${b.txCount} tx, ${formatUnits(b.volumeWei, 18, 4)} ETH`}</title>
            </motion.rect>
          );
        })}
      </svg>
      <div className="mt-1 flex justify-between font-mono text-[0.5625rem] text-muted">
        <span>{buckets[0].bucketStartISO.slice(0, 16)}Z</span>
        <span>PEAK {max} TX/H</span>
        <span>{buckets[buckets.length - 1].bucketStartISO.slice(0, 16)}Z</span>
      </div>
    </div>
  );
}

export { RangeInput };
