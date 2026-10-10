import * as React from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowUpRight, Info, Lock, ShieldAlert, WifiOff } from 'lucide-react';
import { Badge } from './badge';
import { cn } from '@/lib/utils';
import type { DataSourceInfo, ScanCompleteness } from '@/lib/types';

/** Uppercase HUD section heading with a numeric/segment prefix. */
export function SectionHeading({
  index,
  title,
  subtitle,
  action,
  className,
}: {
  index?: string;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('mb-4 flex flex-wrap items-end justify-between gap-4', className)}>
      <div className="min-w-0">
        <div className="flex items-center gap-3">
          {index ? (
            <span className="font-mono text-[0.6875rem] tracking-hud text-[rgba(141,190,255,0.55)]">{index}</span>
          ) : null}
          <h2 className="font-display text-lg font-semibold uppercase tracking-hud text-ghost sm:text-xl">{title}</h2>
        </div>
        {subtitle ? <p className="mt-1.5 max-w-3xl text-xs leading-relaxed text-muted">{subtitle}</p> : null}
      </div>
      {action ? <div className="min-w-0 max-w-full">{action}</div> : null}
    </div>
  );
}

/** KPI tile with an optional unit and tone. */
export function StatTile({
  label,
  value,
  unit,
  tone = 'default',
  hint,
  className,
}: {
  label: string;
  value: React.ReactNode;
  unit?: string;
  tone?: 'default' | 'ok' | 'warn' | 'bad' | 'ice';
  hint?: string;
  className?: string;
}) {
  const toneClass = {
    default: 'text-ghost',
    ok: 'text-[#7EE2A8]',
    warn: 'text-[#FCD34D]',
    bad: 'text-[#FF9DB1]',
    ice: 'text-ice',
  }[tone];

  return (
    <div className={cn('glass hud-corners relative px-4 py-3.5', className)}>
      <div className="hud-label">{label}</div>
      <div className={cn('mt-2 flex items-baseline gap-1.5 font-mono text-xl font-semibold tabular-nums', toneClass)}>
        <span className="break-all">{value}</span>
        {unit ? <span className="text-[0.6875rem] font-normal text-muted">{unit}</span> : null}
      </div>
      {hint ? <div className="mt-1.5 text-[0.6875rem] leading-snug text-muted">{hint}</div> : null}
    </div>
  );
}

const COMPLETENESS_TONE: Record<ScanCompleteness, { tone: 'ok' | 'warn' | 'bad'; label: string }> = {
  complete: { tone: 'ok', label: 'COMPLETE' },
  partial: { tone: 'warn', label: 'PARTIAL' },
  unavailable: { tone: 'bad', label: 'UNAVAILABLE' },
};

/**
 * Renders one data source with its coverage, block window and any limitation.
 * This component is the reason a user can tell real indexed data from a bounded
 * RPC scan at a glance.
 */
export function DataSourceCard({ source, className }: { source: DataSourceInfo; className?: string }) {
  const c = COMPLETENESS_TONE[source.completeness];
  const strategyLabel = {
    'rpc-block-scan': 'RPC BLOCK SCAN',
    'rpc-logs': 'RPC LOG QUERY',
    'explorer-indexer': 'EXPLORER INDEXER',
    'rpc-state': 'RPC STATE READ',
  }[source.strategy];

  return (
    <div className={cn('border border-[rgba(141,190,255,0.14)] bg-[rgba(3,6,13,0.5)] px-4 py-3', className)}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="ice">{strategyLabel}</Badge>
        <Badge tone={c.tone}>{c.label}</Badge>
        {source.fullHistoryIndex ? (
          <Badge tone="violet">FULL INDEX</Badge>
        ) : (
          <Badge tone="neutral">BOUNDED WINDOW</Badge>
        )}
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 font-mono text-[0.6875rem] sm:grid-cols-3">
        <Field label="ENDPOINT" value={source.host} />
        <Field label="CHAIN ID" value={String(source.chainId)} />
        {source.blocksScanned !== undefined ? (
          <Field label="BLOCKS SCANNED" value={source.blocksScanned.toLocaleString('en-US')} />
        ) : null}
        {source.fromBlock !== undefined ? <Field label="FROM BLOCK" value={source.fromBlock.toLocaleString('en-US')} /> : null}
        {source.toBlock !== undefined ? <Field label="TO BLOCK" value={source.toBlock.toLocaleString('en-US')} /> : null}
        {source.latestSyncedBlock !== undefined ? (
          <Field label="HEAD BLOCK" value={source.latestSyncedBlock.toLocaleString('en-US')} />
        ) : null}
        {source.latestBlockTimestamp ? <Field label="HEAD TIME" value={source.latestBlockTimestamp} /> : null}
        <Field label="FETCHED" value={source.fetchedAt} />
      </dl>

      {source.limitation ? (
        <p className="mt-3 flex gap-2 border-t border-[rgba(141,190,255,0.1)] pt-2.5 text-[0.6875rem] leading-relaxed text-[rgba(138,154,184,0.95)]">
          <Info className="mt-[2px] h-3 w-3 shrink-0 text-ice" />
          <span>{source.limitation}</span>
        </p>
      ) : null}

      {source.error ? (
        <p className="mt-2 flex gap-2 text-[0.6875rem] leading-relaxed text-[#FF9DB1]">
          <WifiOff className="mt-[2px] h-3 w-3 shrink-0" />
          <span>
            <span className="font-mono">{source.error.code}</span> — {source.error.message}
          </span>
        </p>
      ) : null}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[0.625rem] tracking-wide2 text-[rgba(138,154,184,0.75)]">{label}</dt>
      <dd className="truncate text-ghost" title={value}>
        {value}
      </dd>
    </div>
  );
}

export function EmptyState({
  icon: Icon = Info,
  title,
  body,
  action,
  tone = 'neutral',
}: {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  body?: string;
  action?: React.ReactNode;
  tone?: 'neutral' | 'warn' | 'bad';
}) {
  const iconTone = tone === 'bad' ? 'text-[#FF9DB1]' : tone === 'warn' ? 'text-[#FCD34D]' : 'text-ice';
  return (
    <div className="flex flex-col items-center justify-center gap-3 border border-dashed border-[rgba(141,190,255,0.2)] px-6 py-12 text-center">
      <Icon className={cn('h-6 w-6', iconTone)} />
      <div className="font-display text-sm font-semibold uppercase tracking-hud text-ghost">{title}</div>
      {body ? <p className="max-w-xl text-xs leading-relaxed text-muted">{body}</p> : null}
      {action}
    </div>
  );
}

export function ErrorState({
  code,
  message,
  detail,
}: {
  code: string;
  message: string;
  detail?: string;
}) {
  return (
    <div className="border border-[rgba(255,92,122,0.35)] bg-[rgba(255,92,122,0.06)] px-5 py-4">
      <div className="flex items-center gap-2">
        <ShieldAlert className="h-4 w-4 text-[#FF9DB1]" />
        <span className="font-mono text-xs uppercase tracking-wide2 text-[#FF9DB1]">{code}</span>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-ghost">{message}</p>
      {detail ? <p className="mt-2 font-mono text-[0.6875rem] leading-relaxed text-muted">{detail}</p> : null}
    </div>
  );
}

export function NoticeBanner({
  tone = 'warn',
  title,
  children,
  className,
}: {
  tone?: 'warn' | 'info' | 'bad';
  title: string;
  children?: React.ReactNode;
  className?: string;
}) {
  const map = {
    warn: { border: 'rgba(251,191,36,0.35)', bg: 'rgba(251,191,36,0.06)', fg: '#FCD34D', Icon: AlertTriangle },
    info: { border: 'rgba(141,190,255,0.3)', bg: 'rgba(141,190,255,0.06)', fg: '#8DBEFF', Icon: Info },
    bad: { border: 'rgba(255,92,122,0.35)', bg: 'rgba(255,92,122,0.06)', fg: '#FF9DB1', Icon: ShieldAlert },
  }[tone];

  return (
    <div
      className={cn('flex gap-3 border px-4 py-3', className)}
      style={{ borderColor: map.border, background: map.bg }}
    >
      <map.Icon className="mt-[2px] h-4 w-4 shrink-0" style={{ color: map.fg }} />
      <div className="min-w-0">
        <div className="font-display text-[0.6875rem] font-semibold uppercase tracking-hud" style={{ color: map.fg }}>
          {title}
        </div>
        {children ? <div className="mt-1.5 text-xs leading-relaxed text-muted">{children}</div> : null}
      </div>
    </div>
  );
}

export function NotConfigured({ feature, requirement }: { feature: string; requirement: string }) {
  return (
    <div className="flex items-start gap-3 border border-dashed border-[rgba(141,190,255,0.25)] bg-[rgba(141,190,255,0.03)] px-4 py-3">
      <Lock className="mt-[2px] h-4 w-4 shrink-0 text-[rgba(138,154,184,0.9)]" />
      <div>
        <div className="font-display text-[0.6875rem] font-semibold uppercase tracking-hud text-muted">
          {feature} — NOT CONFIGURED
        </div>
        <p className="mt-1 text-xs leading-relaxed text-[rgba(138,154,184,0.95)]">{requirement}</p>
      </div>
    </div>
  );
}

/** External evidence link. Opens the real explorer in a new tab. */
export function EvidenceLink({ href, label }: { href: string | null; label: string }) {
  if (!href) {
    return <span className="font-mono text-[0.6875rem] text-muted">{label} (no explorer configured)</span>;
  }
  return (
    <Link
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="focus-ring group inline-flex items-center gap-1 font-mono text-[0.6875rem] text-ice transition-colors hover:text-white"
    >
      {label}
      <ArrowUpRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
    </Link>
  );
}

export function MonoHash({ value, className }: { value: string; className?: string }) {
  return (
    <span className={cn('font-mono text-[0.6875rem] break-all text-[rgba(190,214,255,0.9)]', className)} title={value}>
      {value}
    </span>
  );
}
