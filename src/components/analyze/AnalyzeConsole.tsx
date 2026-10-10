'use client';

import * as React from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { AlertCircle, Fingerprint, Loader2, Play, ScanSearch, Settings2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input, Label, RangeInput } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ErrorState, EmptyState, NoticeBanner, SectionHeading, StatTile } from '@/components/ui/panel';
import {
  ActivityHistogram,
  AiPanel,
  AnomalyPanel,
  CounterpartyPanel,
  FlowOverview,
  GraphSummary,
  ProvenancePanel,
  TransactionTable,
} from './ReportSections';
import { CHAIN_META, type ChainKey } from '@/lib/chains';
import { getPublicConfig } from '@/lib/config';
import { cn, isValidAddress } from '@/lib/utils';
import type { CapabilityReport } from '@/lib/config';
import type { AnalysisReport, ArchiveRecord, DataSourceInfo } from '@/lib/types';

interface AnalyzeError {
  code: string;
  message: string;
  detail?: string;
}

const ADDRESS_PLACEHOLDER = '0x… (40 hex characters)';

export function AnalyzeConsole() {
  const params = useSearchParams();
  const pub = getPublicConfig();
  const reduce = useReducedMotion();

  const [chain, setChain] = React.useState<string>(pub.defaultChain);
  const [address, setAddress] = React.useState('');
  const [scanBlocks, setScanBlocks] = React.useState(3000);
  const [includeAi, setIncludeAi] = React.useState(true);
  const [advanced, setAdvanced] = React.useState(false);

  // Deep link support: /analyze?address=0x..&chain=robinhood
  React.useEffect(() => {
    const a = params.get('address');
    const c = params.get('chain');
    if (a && isValidAddress(a)) setAddress(a);
    if (c && (pub.chains as string[]).includes(c)) setChain(c);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const capabilities = useQuery<CapabilityReport>({
    queryKey: ['capabilities'],
    queryFn: async () => {
      const res = await fetch('/api/capabilities');
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? 'unavailable');
      return json.data as CapabilityReport;
    },
    staleTime: 60_000,
  });

  // Server-side validation: the chain itself confirms the address is reachable.
  const lookup = useMutation({
    mutationFn: async (args: { chain: string; address: string }) => {
      const res = await fetch('/api/wallet/lookup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(args),
      });
      const json = await res.json();
      if (!res.ok) throw Object.assign(new Error(json?.error?.message ?? 'Lookup failed'), { payload: json?.error });
      return json.data as {
        chainName: string;
        chainId: number;
        address: string;
        isContract: boolean | null;
        codeSize: number | null;
        balanceWei: string | null;
        nonce: number | null;
        readAtBlock: number | null;
        explorerUrl: string | null;
        coverageNote: string;
      };
    },
  });

  const analyze = useMutation({
    mutationFn: async (args: { chain: string; address: string; maxBlocks: number; includeAi: boolean }) => {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(args),
      });
      const json = await res.json();
      if (!res.ok) throw Object.assign(new Error(json?.error?.message ?? 'Analysis failed'), { payload: json?.error });
      return json.data as AnalysisReport;
    },
  });

  const archive = useMutation({
    mutationFn: async (args: { label: string; report: AnalysisReport }) => {
      const res = await fetch('/api/archive', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          subject: args.report.subject,
          chain: args.report.chainKey,
          reportHash: args.report.reportHash,
          reportVersion: args.report.reportVersion,
          label: args.label,
          analysisId: args.report.id,
          summary: {
            txCount: args.report.stats.txCount,
            counterparties: args.report.stats.counterparties.length,
            anomalyCount: args.report.stats.anomalies.length,
            netFlowWei: args.report.stats.flow.netFlowWei,
          },
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? 'Could not save to archive');
      return json.data as ArchiveRecord;
    },
  });

  const clientValid = isValidAddress(address.trim());
  const showClientError = address.trim().length > 0 && !clientValid;
  const limits = capabilities.data?.limits;
  const aiConfigured = capabilities.data?.ai.configured ?? false;

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const addr = address.trim();
    if (!isValidAddress(addr)) return;
    analyze.mutate({ chain, address: addr, maxBlocks: scanBlocks, includeAi });
  };

  const report = analyze.data;
  const error = analyze.error as (Error & { payload?: AnalyzeError }) | null;

  return (
    <div className="space-y-8">
      {/* ---------------- Console ---------------- */}
      <section className="container max-w-[1600px] pt-8">
        <SectionHeading
          index="//"
          title="WALLET INTELLIGENCE CONSOLE"
          subtitle="Reads the real chain through this deployment's RPC endpoint. Address validation, transaction history and relationship mapping all run server-side, so no API key is ever exposed to the browser."
          action={
            capabilities.data ? (
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={capabilities.data.ai.configured ? 'violet' : 'neutral'}>
                  AI {capabilities.data.ai.configured ? 'ENABLED' : 'NOT CONFIGURED'}
                </Badge>
                <Badge tone="ice">STORAGE {capabilities.data.database.driver.toUpperCase()}</Badge>
              </div>
            ) : null
          }
        />

        <form onSubmit={onSubmit} className="glass hud-corners scanline p-5">
          <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)_auto]">
            <div>
              <Label htmlFor="chain-select">NETWORK</Label>
              <Select value={chain} onValueChange={setChain}>
                <SelectTrigger id="chain-select" className="mt-2">
                  <SelectValue placeholder="Select network" />
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
              <div className="flex items-center justify-between">
                <Label htmlFor="address-input">WALLET ADDRESS</Label>
                {lookup.data ? (
                  <span className="font-mono text-[0.625rem] text-[#7EE2A8]">
                    VERIFIED ON {lookup.data.chainName.toUpperCase()} · BLOCK{' '}
                    {lookup.data.readAtBlock?.toLocaleString('en-US') ?? '—'}
                  </span>
                ) : null}
              </div>
              <div className="relative mt-2">
                <Fingerprint className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                <Input
                  id="address-input"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  onBlur={() => {
                    const addr = address.trim();
                    if (isValidAddress(addr)) lookup.mutate({ chain, address: addr });
                  }}
                  placeholder={ADDRESS_PLACEHOLDER}
                  spellCheck={false}
                  autoComplete="off"
                  className={cn('pl-10', showClientError && 'border-[rgba(255,92,122,0.6)]')}
                  aria-invalid={showClientError}
                  aria-describedby="address-help"
                />
                {lookup.isPending ? (
                  <Loader2 className="absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-ice" />
                ) : null}
              </div>
              <p id="address-help" className="mt-1.5 text-[0.6875rem] leading-relaxed text-muted">
                {showClientError
                  ? 'That is not a valid EVM address — expected 0x followed by 40 hexadecimal characters.'
                  : lookup.data
                    ? `${lookup.data.isContract ? 'Contract' : 'Externally owned account'} · ${lookup.data.codeSize ?? 0} bytes of code · nonce ${lookup.data.nonce ?? '—'}`
                    : 'Any 0x address works. The server confirms it against the selected chain before analysing.'}
              </p>
            </div>

            <div className="flex items-end gap-3">
              <Button type="submit" variant="primary" size="lg" clip disabled={!clientValid || analyze.isPending}>
                {analyze.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    TRACING…
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4" />
                    RUN ANALYSIS
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Advanced controls */}
          <div className="mt-4 border-t border-[rgba(141,190,255,0.1)] pt-3">
            <button
              type="button"
              onClick={() => setAdvanced((v) => !v)}
              className="focus-ring inline-flex items-center gap-2 font-mono text-[0.625rem] uppercase tracking-wide2 text-muted transition-colors hover:text-ice"
              aria-expanded={advanced}
            >
              <Settings2 className="h-3 w-3" />
              {advanced ? 'HIDE' : 'SHOW'} SCAN OPTIONS
            </button>

            {advanced ? (
              <div className="mt-3 grid gap-5 sm:grid-cols-2">
                <div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="scan-blocks">BLOCK SCAN WINDOW</Label>
                    <span className="font-mono text-[0.6875rem] tabular-nums text-ice">
                      {scanBlocks.toLocaleString('en-US')} blocks
                    </span>
                  </div>
                  <RangeInput
                    id="scan-blocks"
                    className="mt-3"
                    min={200}
                    max={Math.min(limits?.scanMaxBlocks ?? 3000, 20000)}
                    step={100}
                    value={scanBlocks}
                    onChange={(e) => setScanBlocks(Number(e.target.value))}
                  />
                  <p className="mt-2 text-[0.625rem] leading-relaxed text-muted">
                    How far back from the chain head to walk. {CHAIN_META[chain as ChainKey]?.blocksPerSecond
                      ? `This chain produces ~${CHAIN_META[chain as ChainKey].blocksPerSecond} blocks/second, so ${scanBlocks.toLocaleString('en-US')} blocks covers roughly ${Math.max(1, Math.round(scanBlocks / CHAIN_META[chain as ChainKey].blocksPerSecond! / 60))} minutes of chain time.`
                      : 'Larger windows take longer and cost more RPC calls.'}{' '}
                    Server ceiling: {limits?.scanMaxBlocks.toLocaleString('en-US') ?? '—'} blocks.
                  </p>
                </div>
                <div>
                  <Label>AI NARRATION</Label>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant={includeAi ? 'primary' : 'outline'}
                      size="sm"
                      onClick={() => setIncludeAi(true)}
                      disabled={!aiConfigured}
                    >
                      INCLUDE
                    </Button>
                    <Button
                      type="button"
                      variant={!includeAi ? 'primary' : 'outline'}
                      size="sm"
                      onClick={() => setIncludeAi(false)}
                    >
                      DETERMINISTIC ONLY
                    </Button>
                  </div>
                  <p className="mt-2 text-[0.625rem] leading-relaxed text-muted">
                    {aiConfigured
                      ? 'The model only ever receives the computed statistics — never raw chain data.'
                      : 'No AI provider is configured in this deployment, so the AI section will report NOT CONFIGURED either way. Deterministic analysis is unaffected.'}
                  </p>
                </div>
              </div>
            ) : null}
          </div>
        </form>

        {lookup.isError ? (
          <div className="mt-3">
            <ErrorState
              code={(lookup.error as Error & { payload?: AnalyzeError })?.payload?.code ?? 'LOOKUP_FAILED'}
              message={(lookup.error as Error)?.message ?? 'Address lookup failed.'}
              detail={(lookup.error as Error & { payload?: AnalyzeError })?.payload?.detail}
            />
          </div>
        ) : null}
      </section>

      {/* ---------------- Results ---------------- */}
      <AnimatePresence mode="wait">
        {analyze.isPending ? (
          <motion.section
            key="loading"
            initial={reduce ? undefined : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={reduce ? undefined : { opacity: 0 }}
            className="container max-w-[1600px]"
          >
            <div className="glass hud-corners flex flex-col items-center gap-4 px-6 py-14 text-center">
              <ScanSearch className="h-6 w-6 animate-pulse-soft text-ice" />
              <div className="font-display text-sm font-semibold uppercase tracking-hud text-ghost">
                READING CHAIN · {scanBlocks.toLocaleString('en-US')} BLOCKS
              </div>
              <p className="max-w-lg text-xs leading-relaxed text-muted">
                Walking blocks back from the head, collecting transactions and receipts, then running the deterministic
                engine. A cold scan over a large window can take up to a minute.
              </p>
              <div className="h-1 w-64 overflow-hidden rounded-full bg-[rgba(141,190,255,0.15)]">
                <div className="h-full w-1/3 animate-sweep-x bg-ice" />
              </div>
            </div>
          </motion.section>
        ) : analyze.isError ? (
          <motion.section
            key="error"
            initial={reduce ? undefined : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="container max-w-[1600px]"
          >
            <ErrorState
              code={error?.payload?.code ?? 'ANALYSIS_FAILED'}
              message={error?.message ?? 'The analysis could not be completed.'}
              detail={error?.payload?.detail}
            />
            <div className="mt-4">
              <NoticeBanner tone="info" title="WHAT TO TRY">
                <ul className="mt-1 space-y-1">
                  <li>· Widen or narrow the scan window — a very small window may contain no activity for this address.</li>
                  <li>· Confirm the address is active on this network rather than another chain.</li>
                  <li>· If the error mentions rate limiting or an edge challenge, wait a moment and retry; the public RPC is rate limited.</li>
                  <li>· Configure a dedicated RPC provider in the server environment for reliable throughput.</li>
                </ul>
              </NoticeBanner>
            </div>
          </motion.section>
        ) : report ? (
          <motion.section
            key="report"
            initial={reduce ? undefined : { opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={reduce ? undefined : { duration: 0.45 }}
            className="space-y-12"
          >
            {/* Report banner */}
            <div className="container max-w-[1600px]">
              <div className="glass hud-corners scanline p-5">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="ice">ANALYSIS COMPLETE</Badge>
                      <Badge tone={report.transactions.length > 0 ? 'ok' : 'warn'}>
                        {report.transactions.length} TX OBSERVED
                      </Badge>
                      <Badge tone="neutral">REPORT {report.reportVersion}</Badge>
                    </div>
                    <p className="mt-2.5 break-all font-mono text-[0.8125rem] text-ghost">{report.subject}</p>
                    <p className="mt-1 font-mono text-[0.625rem] text-muted">
                      {report.chainKey.toUpperCase()} · CHAIN {report.chainId} · GENERATED{' '}
                      {report.createdAt.slice(0, 19).replace('T', ' ')}Z
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={() => window.print()}>
                      PRINT / EXPORT
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => analyze.reset()}>
                      <AlertCircle className="h-3 w-3" />
                      CLEAR
                    </Button>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <StatTile label="TRANSACTIONS READ" value={report.stats.txCount} />
                  <StatTile label="COUNTERPARTIES" value={report.stats.counterparties.length} />
                  <StatTile label="PATTERN FLAGS" value={report.stats.anomalies.length} />
                  <StatTile
                    label="AI NARRATIVE"
                    value={report.ai.status === 'generated' ? 'GENERATED' : report.ai.status === 'not_configured' ? 'NOT CONFIGURED' : 'REJECTED'}
                    tone={report.ai.status === 'generated' ? 'ok' : 'warn'}
                  />
                </div>
              </div>
            </div>

            {report.transactions.length === 0 ? (
              <div className="container max-w-[1600px]">
                <EmptyState
                  icon={ScanSearch}
                  title="No transactions found in the scanned window"
                  body={`The engine read ${report.dataSources.find((s: DataSourceInfo) => s.strategy === 'rpc-block-scan')?.blocksScanned?.toLocaleString('en-US') ?? 'the requested'} blocks and found no transaction involving this address. That is a real, honest result: either the address is inactive here, or its activity sits outside the window. Increase the scan window to look further back.`}
                  tone="warn"
                />
              </div>
            ) : null}

            <div className="container max-w-[1600px]">
              <ActivityHistogram report={report} />
            </div>
            <div className="container max-w-[1600px]">
              <FlowOverview report={report} />
            </div>
            <div className="container max-w-[1600px]">
              <CounterpartyPanel report={report} />
            </div>
            <div className="container max-w-[1600px]">
              <TransactionTable report={report} />
            </div>
            <div className="container max-w-[1600px]">
              <AnomalyPanel report={report} />
            </div>
            <div className="container max-w-[1600px]">
              <GraphSummary report={report} />
            </div>
            <div className="container max-w-[1600px]">
              <AiPanel report={report} />
            </div>
            <div className="container max-w-[1600px]">
              <ProvenancePanel
                report={report}
                onArchive={(label) => archive.mutate({ label, report })}
                archiving={archive.isPending}
                archived={archive.data ?? null}
              />
            </div>

            {archive.isError ? (
              <div className="container max-w-[1600px]">
                <ErrorState
                  code="ARCHIVE_FAILED"
                  message={(archive.error as Error)?.message ?? 'Could not save the analysis to the archive.'}
                />
              </div>
            ) : null}
          </motion.section>
        ) : (
          <motion.section
            key="idle"
            initial={reduce ? undefined : { opacity: 0 }}
            animate={{ opacity: 1 }}
            className="container max-w-[1600px]"
          >
            <Card>
              <CardHeader>
                <CardTitle>WHAT YOU WILL GET</CardTitle>
                <Badge tone="neutral">IDLE</Badge>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  {[
                    { t: 'CAPITAL FLOW', d: 'Inbound, outbound, net flow, fees and observed success rate — computed from real transactions.' },
                    { t: 'COUNTERPARTIES', d: 'Every address on the other side of a transfer, with contract status confirmed from chain bytecode.' },
                    { t: 'PATTERN FLAGS', d: 'Deterministic rules for bursts, round-number transfers, pass-through routing and concentration.' },
                    { t: 'EVIDENCE LINKS', d: 'Each conclusion cites transaction hashes that open in the network explorer.' },
                  ].map((x) => (
                    <div key={x.t} className="border-l border-[rgba(141,190,255,0.2)] pl-3">
                      <div className="font-display text-[0.6875rem] font-semibold uppercase tracking-wide2 text-ice">{x.t}</div>
                      <p className="mt-1.5 text-[0.6875rem] leading-relaxed text-muted">{x.d}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </motion.section>
        )}
      </AnimatePresence>
    </div>
  );
}
