'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useMutation } from '@tanstack/react-query';
import {
  Activity,
  Bug,
  Gauge,
  Globe,
  MonitorSmartphone,
  RefreshCw,
  Save,
  Timer,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/controls';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input, Label, RangeInput } from '@/components/ui/input';
import { ErrorState, NoticeBanner, SectionHeading, StatTile } from '@/components/ui/panel';
import { WalletButton } from '@/components/wallet/WalletButton';
import { CHAIN_META, type ChainKey } from '@/lib/chains';
import { getPublicConfig, type CapabilityReport } from '@/lib/config';
import { cn, formatBlock } from '@/lib/utils';

const PREF_KEY = 'ghost-protocol:preferences:v1';

interface Preferences {
  defaultChain: string;
  scanBlocks: number;
  autoRefreshSeconds: number;
  reducedMotion: boolean;
  compactNumbers: boolean;
  showUnresolvedStatus: boolean;
}

const DEFAULTS: Preferences = {
  defaultChain: 'robinhood',
  scanBlocks: 3000,
  autoRefreshSeconds: 30,
  reducedMotion: false,
  compactNumbers: true,
  showUnresolvedStatus: true,
};

interface HealthResponse {
  service: string;
  status: string;
  time: string;
  storage: { driver: string; archives: number; analyses: number; wallets: number; transactions: number };
  ai: { configured: boolean; model: string | null; baseUrl: string | null };
  chains: { key: string; id: number; name: string; rpcUrlLabel: string; explorerConfigured: boolean }[];
  rpc: {
    host: string;
    requests: number;
    retries: number;
    failures: number;
    cacheHits: number;
    active: number;
    queued: number;
    cacheEntries: number;
    coolingDown: boolean;
    cooldownRemainingMs: number;
    lastCooldownReason: string | null;
    lastLatencyMs: number | null;
  }[];
}

export function SettingsView() {
  const pub = getPublicConfig();
  const [prefs, setPrefs] = React.useState<Preferences>(DEFAULTS);
  const [saved, setSaved] = React.useState(false);

  // Preferences are stored locally; nothing here is transmitted anywhere.
  React.useEffect(() => {
    try {
      const raw = window.localStorage.getItem(PREF_KEY);
      if (raw) setPrefs({ ...DEFAULTS, ...(JSON.parse(raw) as Partial<Preferences>) });
    } catch {
      /* fall back to defaults */
    }
  }, []);

  const update = <K extends keyof Preferences>(key: K, value: Preferences[K]) => {
    setPrefs((p) => ({ ...p, [key]: value }));
    setSaved(false);
  };

  const save = () => {
    try {
      window.localStorage.setItem(PREF_KEY, JSON.stringify(prefs));
      setSaved(true);
      setTimeout(() => setSaved(false), 2200);
    } catch {
      setSaved(false);
    }
  };

  const reset = () => {
    setPrefs(DEFAULTS);
    try {
      window.localStorage.removeItem(PREF_KEY);
    } catch {
      /* noop */
    }
    setSaved(false);
  };

  const health = useQuery<HealthResponse>({
    queryKey: ['health'],
    queryFn: async () => {
      const res = await fetch('/api/health');
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? 'Health check failed');
      return json.data as HealthResponse;
    },
    refetchInterval: 20_000,
    retry: 1,
  });

  const head = useMutation({
    mutationFn: async (chain: string) => {
      const res = await fetch(`/api/network/head?chain=${encodeURIComponent(chain)}`);
      const json = await res.json();
      if (!res.ok) throw Object.assign(new Error(json?.error?.message ?? 'unavailable'), { payload: json?.error });
      return json.data as {
        chainName: string;
        chainId: number;
        latestSyncedBlock: number;
        latestBlockTimestamp: string;
        sourceHost: string;
        latencyMs: number;
        rpcIsDefaultEndpoint: boolean;
        historyIndexMode: string;
      };
    },
  });

  const capabilities = useQuery<CapabilityReport>({
    queryKey: ['capabilities'],
    queryFn: async () => {
      const res = await fetch('/api/capabilities');
      const json = await res.json();
      return json.data as CapabilityReport;
    },
    staleTime: 60_000,
  });

  const testConnection = (chain: string) => head.mutate(chain);

  return (
    <div className="container max-w-[1600px] space-y-8 pb-10 pt-8">
      <SectionHeading
        index="//"
        title="SETTINGS"
        subtitle="Wallet connection state, network reachability and personal preferences. Preferences are stored in this browser only — nothing in this panel is sent to a server."
      />

      <Tabs defaultValue="wallet" className="min-w-0 max-w-full">
        <TabsList className="flex w-full max-w-full overflow-x-auto">
          <TabsTrigger value="wallet">WALLET</TabsTrigger>
          <TabsTrigger value="network">NETWORK</TabsTrigger>
          <TabsTrigger value="preferences">PREFERENCES</TabsTrigger>
          <TabsTrigger value="diagnostics">DIAGNOSTICS</TabsTrigger>
        </TabsList>

        {/* ---------------- WALLET ---------------- */}
        <TabsContent value="wallet">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div className="glass hud-corners p-5">
              <div className="hud-label mb-3">CONNECTION</div>
              <WalletButton />
              <p className="mt-4 text-xs leading-relaxed text-muted">
                Connecting shares your public address only. GHOST PROTOCOL AI never requests a private key or seed phrase
                and never sends a transaction when you connect. Signature requests are used solely to prove ownership of
                an address.
              </p>
            </div>

            <div className="glass hud-corners p-5">
              <div className="hud-label mb-3">SUPPORTED CONNECTORS</div>
              <ul className="space-y-2.5">
                {[
                  { name: 'MetaMask', note: 'Browser extension & mobile' },
                  { name: 'Rabby', note: 'Browser extension' },
                  { name: 'Coinbase Wallet', note: 'Extension & mobile' },
                  {
                    name: 'WalletConnect',
                    note: pub.features.walletConnect
                      ? 'Enabled for this deployment'
                      : 'NOT CONFIGURED — set NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID to enable',
                    disabled: !pub.features.walletConnect,
                  },
                ].map((w) => (
                  <li key={w.name} className="flex items-center justify-between gap-3 border-b border-[rgba(141,190,255,0.08)] pb-2.5 last:border-b-0">
                    <div>
                      <div className="font-mono text-[0.6875rem] uppercase tracking-wide2 text-ghost">{w.name}</div>
                      <div className={cn('mt-0.5 text-[0.625rem]', w.disabled ? 'text-[#FCD34D]' : 'text-muted')}>{w.note}</div>
                    </div>
                    <Badge tone={w.disabled ? 'warn' : 'ok'}>{w.disabled ? 'UNAVAILABLE' : 'AVAILABLE'}</Badge>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </TabsContent>

        {/* ---------------- NETWORK ---------------- */}
        <TabsContent value="network">
          <div className="space-y-4">
            <div className="glass hud-corners p-5">
              <div className="hud-label mb-3">NETWORK REACHABILITY</div>
              <div className="flex flex-wrap gap-2">
                {pub.chains.map((k: ChainKey) => (
                  <Button
                    key={k}
                    variant="outline"
                    size="sm"
                    loading={head.isPending && head.variables === k}
                    onClick={() => testConnection(k)}
                  >
                    <Activity className="h-3 w-3" />
                    TEST {CHAIN_META[k].shortName}
                  </Button>
                ))}
              </div>

              {head.data ? (
                <div className="mt-4 border border-[rgba(74,222,128,0.3)] bg-[rgba(74,222,128,0.06)] px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Badge tone="ok">REACHABLE</Badge>
                    <span className="font-mono text-[0.6875rem] text-ghost">{head.data.chainName}</span>
                  </div>
                  <div className="mt-2 grid gap-x-5 gap-y-1 font-mono text-[0.6875rem] sm:grid-cols-2">
                    <span className="text-muted">CHAIN ID <span className="text-ghost">{head.data.chainId}</span></span>
                    <span className="text-muted">HEAD BLOCK <span className="text-ghost">{formatBlock(head.data.latestSyncedBlock)}</span></span>
                    <span className="text-muted">HEAD TIME <span className="text-ghost">{head.data.latestBlockTimestamp}</span></span>
                    <span className="text-muted">LATENCY <span className="text-ghost">{head.data.latencyMs} ms</span></span>
                    <span className="text-muted">ENDPOINT <span className="text-ghost">{head.data.sourceHost}</span></span>
                    <span className="text-muted">HISTORY MODE <span className="text-ghost">{head.data.historyIndexMode}</span></span>
                  </div>
                  {head.data.rpcIsDefaultEndpoint ? (
                    <p className="mt-2 text-[0.625rem] leading-relaxed text-[#FCD34D]">
                      This deployment is using the public endpoint, which is rate limited and applies edge bot
                      protection under load. Configure a dedicated RPC provider for production use.
                    </p>
                  ) : null}
                </div>
              ) : null}

              {head.isError ? (
                <div className="mt-4">
                  <ErrorState
                    code={(head.error as Error & { payload?: { code: string } })?.payload?.code ?? 'UNREACHABLE'}
                    message={(head.error as Error)?.message ?? 'The endpoint could not be reached.'}
                  />
                </div>
              ) : null}
            </div>

            {capabilities.data ? (
              <div className="space-y-3">
                <div className="hud-label">COVERAGE PER NETWORK</div>
                {capabilities.data.chains.map((c) => (
                  <div key={c.key} className="glass hud-corners p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-display text-sm font-semibold uppercase tracking-wide2 text-ghost">{c.name}</span>
                      <Badge tone="neutral">ID {c.id}</Badge>
                      <Badge tone={c.rpcConfigured ? 'ok' : 'warn'}>
                        {c.rpcConfigured ? 'DEDICATED RPC' : 'PUBLIC RPC'}
                      </Badge>
                      <Badge tone={c.explorerConfigured ? 'violet' : 'neutral'}>
                        {c.explorerConfigured ? 'INDEXER' : 'NO INDEXER'}
                      </Badge>
                      <span className="font-mono text-[0.625rem] text-muted">{c.rpcUrlLabel}</span>
                    </div>
                    <p className="mt-2 text-[0.6875rem] leading-relaxed text-muted">{c.historyCoverage}</p>
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
            ) : null}
          </div>
        </TabsContent>

        {/* ---------------- PREFERENCES ---------------- */}
        <TabsContent value="preferences">
          <div className="glass hud-corners max-w-3xl p-5">
            <div className="space-y-6">
              <div>
                <Label htmlFor="pref-chain">DEFAULT NETWORK</Label>
                <Select value={prefs.defaultChain} onValueChange={(v) => update('defaultChain', v)}>
                  <SelectTrigger id="pref-chain" className="mt-2 max-w-xs">
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
                <p className="mt-1.5 text-[0.625rem] text-muted">
                  Used to pre-select the network on the console pages. The server default is set by
                  NEXT_PUBLIC_DEFAULT_CHAIN.
                </p>
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="pref-blocks">PREFERRED SCAN WINDOW</Label>
                  <span className="font-mono text-[0.6875rem] tabular-nums text-ice">
                    {prefs.scanBlocks.toLocaleString('en-US')} BLOCKS
                  </span>
                </div>
                <RangeInput
                  id="pref-blocks"
                  className="mt-3 max-w-md"
                  min={200}
                  max={20000}
                  step={100}
                  value={prefs.scanBlocks}
                  onChange={(e) => update('scanBlocks', Number(e.target.value))}
                />
                <p className="mt-1.5 text-[0.625rem] text-muted">
                  Pre-fills the analysis console. The server enforces its own ceiling regardless of this value.
                </p>
              </div>

              <div>
                <Label htmlFor="pref-refresh">AUTO-REFRESH INTERVAL</Label>
                <div className="mt-2 flex items-center gap-3">
                  <Input
                    id="pref-refresh"
                    type="number"
                    min={0}
                    max={600}
                    value={prefs.autoRefreshSeconds}
                    onChange={(e) => update('autoRefreshSeconds', Number(e.target.value))}
                    className="h-9 w-28"
                  />
                  <span className="font-mono text-[0.625rem] text-muted">SECONDS (0 = OFF)</span>
                </div>
              </div>

              <div className="hairline" />

              {[
                {
                  key: 'reducedMotion' as const,
                  label: 'REDUCE MOTION',
                  hint: 'Freezes the globe, particles and scan lines. The site also honours your operating system setting automatically.',
                },
                {
                  key: 'compactNumbers' as const,
                  label: 'COMPACT NUMBERS',
                  hint: 'Renders large values as 1.24M rather than 1,240,000.',
                },
                {
                  key: 'showUnresolvedStatus' as const,
                  label: 'SHOW UNRESOLVED TRANSACTION STATUS',
                  hint: 'Feed rows where confirmation status was not fetched are labelled UNRESOLVED rather than assumed successful.',
                },
              ].map((row) => (
                <div key={row.key} className="flex items-start justify-between gap-6">
                  <div className="min-w-0">
                    <div className="font-mono text-[0.6875rem] uppercase tracking-wide2 text-ghost">{row.label}</div>
                    <p className="mt-1 text-[0.625rem] leading-relaxed text-muted">{row.hint}</p>
                  </div>
                  <Switch checked={prefs[row.key]} onCheckedChange={(v) => update(row.key, v)} aria-label={row.label} />
                </div>
              ))}

              <div className="flex flex-wrap items-center gap-3 border-t border-[rgba(141,190,255,0.1)] pt-4">
                <Button variant="primary" size="sm" onClick={save}>
                  <Save className="h-3 w-3" />
                  SAVE PREFERENCES
                </Button>
                <Button variant="ghost" size="sm" onClick={reset}>
                  RESET TO DEFAULTS
                </Button>
                {saved ? (
                  <span className="font-mono text-[0.625rem] uppercase tracking-wide2 text-[#7EE2A8]">
                    SAVED LOCALLY
                  </span>
                ) : null}
              </div>
            </div>
          </div>
        </TabsContent>

        {/* ---------------- DIAGNOSTICS ---------------- */}
        <TabsContent value="diagnostics">
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <StatTile
                label="SERVICE"
                value={health.data?.status?.toUpperCase() ?? '—'}
                tone={health.data?.status === 'ok' ? 'ok' : 'warn'}
                hint={health.data?.time?.slice(0, 19).replace('T', ' ') + 'Z'}
              />
              <StatTile label="STORAGE DRIVER" value={health.data?.storage.driver?.toUpperCase() ?? '—'} />
              <StatTile label="ANALYSES STORED" value={health.data?.storage.analyses ?? 0} />
              <StatTile
                label="AI PROVIDER"
                value={health.data?.ai.configured ? 'CONFIGURED' : 'NOT CONFIGURED'}
                tone={health.data?.ai.configured ? 'ok' : 'warn'}
                hint={health.data?.ai.model ?? 'no model bound'}
              />
            </div>

            <div className="glass hud-corners p-5">
              <div className="flex items-center justify-between">
                <div className="hud-label">UPSTREAM RPC CLIENT STATISTICS</div>
                <Button variant="ghost" size="sm" onClick={() => void health.refetch()} loading={health.isFetching}>
                  <RefreshCw className="h-3 w-3" />
                  REFRESH
                </Button>
              </div>

              {health.data && health.data.rpc.length > 0 ? (
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full min-w-[760px] border-collapse">
                    <thead>
                      <tr className="border-b border-[rgba(141,190,255,0.14)]">
                        {['ENDPOINT', 'REQUESTS', 'RETRIES', 'FAILURES', 'CACHE HITS', 'IN FLIGHT', 'LAST LATENCY', 'STATE'].map((h) => (
                          <th key={h} className="px-3 py-2 text-left font-mono text-[0.5625rem] uppercase tracking-hud text-muted">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {health.data.rpc.map((r) => (
                        <tr key={r.host} className="border-b border-[rgba(141,190,255,0.06)]">
                          <td className="px-3 py-2 font-mono text-[0.6875rem] text-ghost">{r.host}</td>
                          <td className="px-3 py-2 font-mono text-[0.6875rem] tabular-nums text-muted">{r.requests}</td>
                          <td className="px-3 py-2 font-mono text-[0.6875rem] tabular-nums text-muted">{r.retries}</td>
                          <td className="px-3 py-2 font-mono text-[0.6875rem] tabular-nums text-[#FF9DB1]">{r.failures}</td>
                          <td className="px-3 py-2 font-mono text-[0.6875rem] tabular-nums text-muted">{r.cacheHits}</td>
                          <td className="px-3 py-2 font-mono text-[0.6875rem] tabular-nums text-muted">
                            {r.active}
                            {r.queued > 0 ? ` (+${r.queued} queued)` : ''}
                          </td>
                          <td className="px-3 py-2 font-mono text-[0.6875rem] tabular-nums text-muted">
                            {r.lastLatencyMs !== null ? `${r.lastLatencyMs} ms` : '—'}
                          </td>
                          <td className="px-3 py-2">
                            <Badge tone={r.coolingDown ? 'warn' : 'ok'}>
                              {r.coolingDown ? `COOLDOWN ${Math.ceil(r.cooldownRemainingMs / 1000)}S` : 'NOMINAL'}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="mt-3 text-xs leading-relaxed text-muted">
                  No RPC calls have been made from this server process yet. Statistics appear after the first chain read.
                </p>
              )}

              <p className="mt-3 text-[0.625rem] leading-relaxed text-muted">
                These counters are per-process and reset on restart. A brief cooldown after an edge bot-challenge or an
                HTTP 429 is expected behaviour, not a fault — it is the client deliberately backing off.
              </p>
            </div>

            <div className="glass hud-corners p-5">
              <div className="hud-label mb-3">DEPLOYMENT CONFIGURATION</div>
              {capabilities.data ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  {[
                    { k: 'SCAN_MAX_BLOCKS', v: capabilities.data.limits.scanMaxBlocks.toLocaleString('en-US') },
                    { k: 'SCAN_BATCH_SIZE', v: String(capabilities.data.limits.scanBatchSize) },
                    { k: 'RPC_MAX_CONCURRENCY', v: String(capabilities.data.limits.rpcMaxConcurrency) },
                    { k: 'RPC_TIMEOUT_MS', v: String(capabilities.data.limits.rpcTimeoutMs) },
                    { k: 'RPC_MAX_RETRIES', v: String(capabilities.data.limits.rpcMaxRetries) },
                    { k: 'CACHE_TTL_SECONDS', v: String(capabilities.data.limits.cacheTtlSeconds) },
                    { k: 'API_RATE_LIMIT_MAX', v: String(capabilities.data.limits.apiRateLimitMax) },
                    {
                      k: 'API_RATE_LIMIT_WINDOW_MS',
                      v: capabilities.data.limits.apiRateLimitWindowMs.toLocaleString('en-US'),
                    },
                  ].map((row) => (
                    <div key={row.k} className="flex items-center justify-between border-b border-[rgba(141,190,255,0.08)] py-1.5">
                      <span className="font-mono text-[0.625rem] text-muted">{row.k}</span>
                      <span className="font-mono text-[0.6875rem] tabular-nums text-ghost">{row.v}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted">Loading configuration…</p>
              )}
            </div>

            <NoticeBanner tone="info" title="REPORTING A PROBLEM">
              <div className="flex flex-wrap items-center gap-3">
                <span>
                  If a chain read fails, the API returns a machine-readable error code (<span className="font-mono">UPSTREAM_*</span>)
                  that identifies whether the endpoint was rate limited, edge-blocked, or timed out.
                </span>
                <span className="inline-flex items-center gap-1.5 font-mono text-[0.625rem] text-muted">
                  <Bug className="h-3 w-3" /> Include that code when reporting an issue.
                </span>
              </div>
            </NoticeBanner>
          </div>
        </TabsContent>
      </Tabs>

      {/* Ambient feature summary */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { icon: Globe, label: 'CONFIGURED NETWORKS', value: String(pub.chains.length) },
          {
            icon: Gauge,
            label: 'API RATE LIMIT',
            value: capabilities.data ? `${capabilities.data.limits.apiRateLimitMax}/min` : '—',
          },
          {
            icon: Timer,
            label: 'RPC TIMEOUT',
            value: capabilities.data ? `${capabilities.data.limits.rpcTimeoutMs} ms` : '—',
          },
          {
            icon: MonitorSmartphone,
            label: 'SIGNED-IN IDENTITY',
            value: 'NONE (READ-ONLY)',
          },
        ].map((x) => (
          <div key={x.label} className="glass hud-corners flex items-center gap-3 p-4">
            <x.icon className="h-4 w-4 shrink-0 text-ice" />
            <div className="min-w-0">
              <div className="hud-label">{x.label}</div>
              <div className="mt-1 truncate font-mono text-sm text-ghost">{x.value}</div>
            </div>
          </div>
        ))}
      </div>

      <NoticeBanner tone="info" title="WHAT THIS PANEL DOES NOT DO">
        <ul className="mt-1 space-y-1">
          <li>· It does not create an account or store your wallet address on any server.</li>
          <li>· It does not request a private key, seed phrase, or permission to move funds.</li>
          <li>· It does not hold keys on your behalf — every on-chain action is signed by your own wallet.</li>
          <li>· It does not display an "online agent count", demo balance, or any fabricated live metric.</li>
        </ul>
      </NoticeBanner>
    </div>
  );
}
