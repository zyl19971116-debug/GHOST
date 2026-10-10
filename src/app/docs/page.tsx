import type { Metadata } from 'next';
import Link from 'next/link';
import { AlertTriangle, Cpu, Database, FileKey2, Lock, Network, ShieldCheck, TerminalSquare } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { SectionHeading } from '@/components/ui/panel';
import { CHAIN_META, CHAIN_KEYS } from '@/lib/chains';
import { getCapabilityReport } from '@/lib/config';

export const metadata: Metadata = {
  title: 'Docs',
  description:
    'How GHOST PROTOCOL AI works: mechanism, data sources, analysis limits, AI boundaries, the attestation contract, privacy and risk.',
};

const SECTIONS = [
  { id: 'mechanism', label: 'MECHANISM' },
  { id: 'data-sources', label: 'DATA SOURCES' },
  { id: 'limits', label: 'COVERAGE LIMITS' },
  { id: 'ai-boundaries', label: 'AI BOUNDARIES' },
  { id: 'attestation', label: 'ATTESTATION CONTRACT' },
  { id: 'api', label: 'API REFERENCE' },
  { id: 'privacy', label: 'PRIVACY & KEYS' },
  { id: 'risk', label: 'RISK DISCLOSURE' },
];

function Rule({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="glass hud-corners p-4">
      <div className="font-display text-[0.6875rem] font-semibold uppercase tracking-hud text-ice">{title}</div>
      <div className="mt-2 text-xs leading-relaxed text-muted">{children}</div>
    </div>
  );
}

function H2({ id, index, title }: { id: string; index: string; title: string }) {
  return (
    <h2 id={id} className="scroll-mt-24 font-display text-lg font-semibold uppercase tracking-hud text-ghost sm:text-xl">
      <span className="mr-3 font-mono text-[0.6875rem] tracking-hud text-[rgba(141,190,255,0.55)]">{index}</span>
      {title}
    </h2>
  );
}

export default function DocsPage() {
  const cap = getCapabilityReport();
  const enabled = (process.env.NEXT_PUBLIC_CHAINS ?? 'robinhood,robinhoodTestnet,ethereum,base')
    .split(',')
    .map((s) => s.trim())
    .filter((k): k is (typeof CHAIN_KEYS)[number] => (CHAIN_KEYS as string[]).includes(k));

  return (
    <div className="container max-w-[1600px] pb-16 pt-8">
      <SectionHeading
        index="//"
        title="DOCUMENTATION"
        subtitle="What this platform does, what it deliberately refuses to do, and exactly where its numbers come from."
      />

      <div className="grid min-w-0 gap-10 lg:grid-cols-[220px_minmax(0,1fr)]">
        {/* TOC */}
        <nav aria-label="Sections" className="min-w-0 lg:sticky lg:top-24 lg:self-start">
          <div className="hud-label mb-3">CONTENTS</div>
          <ul className="space-y-1.5">
            {SECTIONS.map((s, i) => (
              <li key={s.id}>
                <Link
                  href={`#${s.id}`}
                  className="focus-ring flex items-center gap-2 text-[0.6875rem] uppercase tracking-wide2 text-muted transition-colors hover:text-ice"
                >
                  <span className="font-mono text-[0.5625rem] text-[rgba(141,190,255,0.5)]">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  {s.label}
                </Link>
              </li>
            ))}
          </ul>

          <div className="hairline my-5" />

          <div className="hud-label mb-2">LIVE CONFIG</div>
          <ul className="space-y-1 font-mono text-[0.625rem]">
            <li className="flex justify-between gap-2">
              <span className="text-muted">AI</span>
              <span className={cap.ai.configured ? 'text-[#7EE2A8]' : 'text-[#FCD34D]'}>
                {cap.ai.configured ? 'ENABLED' : 'OFF'}
              </span>
            </li>
            <li className="flex justify-between gap-2">
              <span className="text-muted">DB</span>
              <span className={cap.database.configured ? 'text-[#7EE2A8]' : 'text-[#FCD34D]'}>
                {cap.database.configured ? 'POSTGRES' : 'MEMORY'}
              </span>
            </li>
            <li className="flex justify-between gap-2">
              <span className="text-muted">REGISTRY</span>
              <span className={cap.registry.configured ? 'text-[#7EE2A8]' : 'text-[#FCD34D]'}>
                {cap.registry.configured ? 'LIVE' : 'NOT DEPLOYED'}
              </span>
            </li>
          </ul>
        </nav>

        {/* Body */}
        <div className="min-w-0 max-w-3xl space-y-14">
          {/* ---------- MECHANISM ---------- */}
          <section className="min-w-0 space-y-4">
            <H2 id="mechanism" index="01" title="Mechanism" />
            <p className="text-sm leading-relaxed text-muted">
              GHOST PROTOCOL AI turns a wallet address into a source-linked report. The pipeline has four stages, and each
              one records what it did so the next stage can be checked against it.
            </p>

            <div className="grid gap-3 sm:grid-cols-2">
              <Rule title="1 · READ">
                The server reads blocks from a configured EVM RPC endpoint: full transactions, receipts, address state and
                bytecode. Reads are cached briefly, batched, rate limited and retried with backoff. Nothing is seeded,
                sampled or simulated.
              </Rule>
              <Rule title="2 · NORMALISE">
                Raw JSON-RPC payloads are normalised into typed records. Values stay as exact wei integers — never floats —
                so no rounding is introduced before the statistics run.
              </Rule>
              <Rule title="3 · COMPUTE">
                Deterministic algorithms compute inflow, outflow, fees, frequency, counterparties, contract interactions,
                method breakdown and pattern flags. Every rule has a stated threshold and cites the transactions behind it.
              </Rule>
              <Rule title="4 · NARRATE">
                A language model — only if configured — receives the computed statistics and writes them up. It never
                receives raw chain data and cannot alter a number.
              </Rule>
            </div>

            <Rule title="EVIDENCE CHAIN">
              Every transaction row carries its hash and, where an explorer is known for the network, a link to it. Any
              figure in a report can therefore be traced back through the hash to the block it came from. If the numbers
              and the hashes disagree, the hashes are correct.
            </Rule>
          </section>

          {/* ---------- DATA SOURCES ---------- */}
          <section className="space-y-4">
            <H2 id="data-sources" index="02" title="Data sources" />
            <p className="text-sm leading-relaxed text-muted">
              All chain access happens on the server so that RPC credentials never reach the browser. Which networks are
              reachable, and how far back, depends on what this deployment has configured.
            </p>

            <div className="space-y-3">
              {cap.chains.map((c) => (
                <div key={c.key} className="glass hud-corners p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-display text-sm font-semibold uppercase tracking-wide2 text-ghost">{c.name}</span>
                    <Badge tone="neutral">CHAIN ID {c.id}</Badge>
                    <Badge tone={c.rpcConfigured ? 'ok' : 'warn'}>{c.rpcConfigured ? 'DEDICATED RPC' : 'PUBLIC RPC'}</Badge>
                    <Badge tone={c.explorerConfigured ? 'violet' : 'neutral'}>
                      {c.explorerConfigured ? 'INDEXER CONFIGURED' : 'NO INDEXER'}
                    </Badge>
                  </div>
                  <dl className="mt-3 space-y-1.5 font-mono text-[0.625rem]">
                    <div className="flex gap-2">
                      <dt className="w-28 shrink-0 text-muted">ENDPOINT</dt>
                      <dd className="text-ghost">{c.rpcUrlLabel}</dd>
                    </div>
                    <div className="flex gap-2">
                      <dt className="w-28 shrink-0 text-muted">COVERAGE</dt>
                      <dd className="text-ghost">{c.historyCoverage}</dd>
                    </div>
                  </dl>
                  {c.limitations.length > 0 ? (
                    <ul className="mt-3 space-y-1.5 border-t border-[rgba(141,190,255,0.1)] pt-2.5">
                      {c.limitations.map((l, i) => (
                        <li key={i} className="flex gap-2 text-[0.6875rem] leading-relaxed text-[rgba(138,154,184,0.95)]">
                          <AlertTriangle className="mt-[2px] h-3 w-3 shrink-0 text-[#FCD34D]" />
                          <span>{l}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ))}
            </div>

            <div className="glass hud-corners border-l-2 border-l-[rgba(141,190,255,0.5)] p-4">
              <div className="flex items-center gap-2">
                <Database className="h-4 w-4 text-ice" />
                <span className="font-display text-[0.6875rem] font-semibold uppercase tracking-hud text-ice">
                  ON ROBINHOOD CHAIN SPECIFICALLY
                </span>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-muted">
                Robinhood Chain parameters were verified against Robinhood&apos;s own documentation and a live{' '}
                <span className="font-mono">eth_chainId</span> read, which returned{' '}
                <span className="font-mono">0x1237</span> (4663) for mainnet and <span className="font-mono">0xb626</span>{' '}
                (46630) for testnet. The public RPC is a full-archive <em>block</em> node — historical block contents are
                retrievable all the way back — but it does not serve historical <em>state</em>, so a past balance cannot be
                reconstructed. The public endpoint also applies edge bot protection under sustained load, which the client
                handles by backing off and reporting a capability limit rather than failing silently.
              </p>
            </div>
          </section>

          {/* ---------- LIMITS ---------- */}
          <section className="space-y-4">
            <H2 id="limits" index="03" title="Coverage limits" />
            <p className="text-sm leading-relaxed text-muted">
              Being explicit about the edges of coverage matters more than the coverage itself. These are the hard limits
              of what a report can claim.
            </p>

            <div className="grid gap-3">
              <Rule title="NO FULL HISTORY INDEX BY DEFAULT">
                Without a configured explorer or indexer API, transaction history comes from a bounded scan of the most
                recent blocks. Each report states the exact block range it read. Activity older than that range is not
                examined — it is absent, not empty, and the two are different things.
              </Rule>
              <Rule title="A BOUNDED WINDOW IS SHORT ON FAST CHAINS">
                Robinhood Chain produces roughly ten blocks per second. A {cap.limits.scanMaxBlocks.toLocaleString('en-US')}
                -block window therefore covers only a handful of minutes of chain time. This is a property of the network
                and of reading directly from RPC, not a hidden limitation.
              </Rule>
              <Rule title="STOPPED SCANS ARE REPORTED, NOT HIDDEN">
                If the upstream rate limits or blocks the client mid-scan, the scan stops and the partial result is
                returned with a <span className="font-mono">PARTIAL</span> marker and the exact reason. The engine never
                fills the gap with extrapolation.
              </Rule>
              <Rule title="NATIVE VALUE IS NOT TOKEN VALUE">
                Flow totals cover the chain&apos;s native currency only. ERC-20 and ERC-721 transfers are detected through
                their event logs and shown as counterparty relationships, but their amounts are not summed into the flow
                figures, because doing so would require per-token decimals and price data this platform does not have.
              </Rule>
              <Rule title="UNRESOLVED MEANS UNRESOLVED">
                The activity feed does not fetch receipts, so it labels every row{" "}
                <span className="font-mono">UNRESOLVED</span> instead of assuming success. The analysis pipeline does fetch
                receipts, so its status column is populated.
              </Rule>
            </div>
          </section>

          {/* ---------- AI BOUNDARIES ---------- */}
          <section className="space-y-4">
            <H2 id="ai-boundaries" index="04" title="AI boundaries" />
            <p className="text-sm leading-relaxed text-muted">
              The AI layer is deliberately narrow, optional, and mechanically constrained rather than merely instructed.
            </p>

            <div className="grid gap-3 sm:grid-cols-2">
              <Rule title="WHAT IT RECEIVES">
                Only deterministic statistics: flow totals, frequency metrics, the ranked counterparty list, method and
                type breakdowns, the engine&apos;s own pattern flags, and the provenance block describing coverage. It never
                receives raw transactions.
              </Rule>
              <Rule title="WHAT IT CANNOT DO">
                It cannot introduce a transaction, hash, counterparty, amount or date. It cannot state or imply that two
                addresses share a person, entity or controller. It cannot assert a profit, return or valuation. It cannot
                name a real-world organisation that was not in its input.
              </Rule>
              <Rule title="ENFORCED, NOT REQUESTED">
                The response is validated against a strict schema. Anything that fails validation is discarded and surfaced
                as REJECTED, with the reason, rather than displayed. Text matching known common-control assertion patterns
                is stripped automatically and the removal is disclosed in the report.
              </Rule>
              <Rule title="CONFIDENCE IS EXPLICIT">
                Every finding carries a confidence value, the evidence it rests on, and its limitations. Low-sample findings
                are expected to carry low confidence, and the UI shows both together so a confident-sounding sentence
                cannot travel without its basis.
              </Rule>
            </div>

            <div className="glass hud-corners border-l-2 border-l-[rgba(251,191,36,0.5)] p-4">
              <div className="flex items-center gap-2">
                <Cpu className="h-4 w-4 text-[#FCD34D]" />
                <span className="font-display text-[0.6875rem] font-semibold uppercase tracking-hud text-[#FCD34D]">
                  FUNDS FLOW IS NOT IDENTITY
                </span>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-muted">
                A wallet sending value to another wallet is a fact about transfers, not about people. Co-occurrence,
                round numbers, pass-through routing and shared contracts all have ordinary explanations — exchanges,
                custodians, bots, payment processors, treasuries, or simple coincidence. This platform reports observed
                patterns with an explicit confidence and never converts them into a claim about who controls an address.
                Treat every relationship score as a reason to look at the cited transactions, not as a conclusion.
              </p>
            </div>
          </section>

          {/* ---------- ATTESTATION ---------- */}
          <section className="space-y-4">
            <H2 id="attestation" index="05" title="Attestation contract" />
            <p className="text-sm leading-relaxed text-muted">
              The only smart contract in this project is an optional notary for analysis digests. It is deliberately
              minimal.
            </p>

            <div className="glass hud-corners p-4">
              <div className="flex items-center gap-2">
                <FileKey2 className="h-4 w-4 text-ice" />
                <span className="font-mono text-[0.6875rem] uppercase tracking-wide2 text-ghost">
                  AnalysisRegistry.sol
                </span>
                <Badge tone={cap.registry.configured ? 'ok' : 'warn'}>
                  {cap.registry.configured ? 'DEPLOYED' : 'NOT DEPLOYED'}
                </Badge>
              </div>
              <ul className="mt-3 space-y-1.5 text-[0.6875rem] leading-relaxed text-muted">
                <li>· Registers a report hash, a version string, the subject wallet, a metadata CID and a timestamp.</li>
                <li>· The registrant is the signing wallet; only the registrant may revoke their own record.</li>
                <li>· No report body, transaction list, statistic or narrative is ever written on-chain.</li>
                <li>· It cannot move funds, mint tokens, proxy transfers, or promise any return.</li>
                <li>· Registration is optional. The platform never signs on your behalf — every attestation is a transaction from your own wallet.</li>
              </ul>
              {!cap.registry.configured ? (
                <p className="mt-3 border-t border-[rgba(141,190,255,0.1)] pt-2.5 text-[0.6875rem] leading-relaxed text-[#FCD34D]">
                  No registry address is configured for this deployment, so the UI shows NOT DEPLOYED and no attestation
                  can be submitted. Saved records still state this explicitly instead of implying on-chain provenance.
                </p>
              ) : null}
            </div>
          </section>

          {/* ---------- API ---------- */}
          <section className="min-w-0 space-y-4">
            <H2 id="api" index="06" title="API reference" />
            <p className="text-sm leading-relaxed text-muted">
              All endpoints live under <span className="font-mono text-ice">/api</span>, return JSON, and are rate limited
              per client. Responses carry a rate-limit header set.
            </p>

            <div className="glass w-full min-w-0 max-w-full overflow-hidden">
              <div className="w-full max-w-full overflow-x-auto">
                <table className="w-full min-w-[620px] border-collapse text-left">
                  <thead>
                    <tr className="border-b border-[rgba(141,190,255,0.14)] bg-[rgba(3,6,13,0.5)]">
                      {['ENDPOINT', 'METHOD', 'PURPOSE'].map((h) => (
                        <th key={h} className="px-3 py-2.5 font-mono text-[0.5625rem] uppercase tracking-hud text-muted">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="font-mono text-[0.6875rem]">
                    {[
                      ['/api/health', 'GET', 'Service, storage, per-endpoint RPC statistics.'],
                      ['/api/capabilities', 'GET', 'What this deployment can and cannot do.'],
                      ['/api/chain/status', 'GET', 'Compatibility alias for live chain status and gas price.'],
                      ['/api/network/head', 'GET', 'Live chain head: block number, hash, timestamp, latency.'],
                      ['/api/network/graph', 'POST', 'Build a bounded, evidence-backed wallet relationship graph.'],
                      ['/api/wallet/[address]', 'GET', 'Address state, code type and explicit observation coverage.'],
                      ['/api/wallet/[address]/transactions', 'GET', 'Observed native transactions with pagination and coverage.'],
                      ['/api/wallet/[address]/transfers', 'GET', 'Observed ERC-20 transfers with token identity and precision.'],
                      ['/api/wallet/lookup', 'POST', 'Validate an address against the chain and read its state.'],
                      ['/api/analyze', 'POST', 'Run the full analysis pipeline and return a report.'],
                      ['/api/intel', 'GET', 'Recent on-chain activity with server-side filtering.'],
                      ['/api/intel/events', 'GET', 'Compatibility alias for the real recent-block intelligence feed.'],
                      ['/api/archive', 'GET/POST', 'List saved digests, or save a new one.'],
                      ['/api/archive/[id]', 'GET/PATCH', 'Fetch a record, or record an attestation outcome.'],
                    ].map(([ep, m, d]) => (
                      <tr key={ep} className="border-b border-[rgba(141,190,255,0.06)]">
                        <td className="px-3 py-2.5 text-ice">{ep}</td>
                        <td className="px-3 py-2.5 text-muted">{m}</td>
                        <td className="px-3 py-2.5 font-sans text-[0.6875rem] text-ghost">{d}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="glass hud-corners p-4">
              <div className="flex items-center gap-2">
                <TerminalSquare className="h-4 w-4 text-ice" />
                <span className="font-display text-[0.6875rem] font-semibold uppercase tracking-hud text-ice">
                  ERROR CODES
                </span>
              </div>
              <ul className="mt-2.5 space-y-1.5 font-mono text-[0.625rem] text-muted">
                <li><span className="text-[#FF9DB1]">UPSTREAM_TIMEOUT</span> — the endpoint did not answer in time.</li>
                <li><span className="text-[#FF9DB1]">UPSTREAM_RATE_LIMITED</span> — HTTP 429; configure a dedicated provider or retry.</li>
                <li><span className="text-[#FF9DB1]">UPSTREAM_EDGE_BLOCKED</span> — an edge bot challenge was served instead of JSON.</li>
                <li><span className="text-[#FF9DB1]">UNSUPPORTED_CHAIN</span> — the chain key is not enabled here.</li>
                <li><span className="text-[#FF9DB1]">INVALID_INPUT</span> — payload failed validation; the message names the field.</li>
                <li><span className="text-[#FF9DB1]">RATE_LIMITED</span> — you exceeded this deployment&apos;s own API budget.</li>
              </ul>
            </div>
          </section>

          {/* ---------- PRIVACY ---------- */}
          <section className="space-y-4">
            <H2 id="privacy" index="07" title="Privacy & keys" />
            <div className="grid gap-3 sm:grid-cols-2">
              <Rule title="NO SECRETS ON THE CLIENT">
                RPC credentials and the AI key are read from server environment variables only. Anything prefixed
                <span className="font-mono"> NEXT_PUBLIC_</span> is by definition public, and this project keeps no secret
                behind that prefix.
              </Rule>
              <Rule title="NO CUSTODY">
                The platform never asks for a private key or seed phrase, never holds funds, and never signs a transaction
                on your behalf. Wallet connection is read-only; attestations are signed in your wallet.
              </Rule>
              <Rule title="PUBLIC DATA ONLY">
                All analysed data is already public on-chain. Addresses are not linked to real-world identities, and no
                attempt is made to do so.
              </Rule>
              <Rule title="MINIMAL LOCAL STATE">
                Interface preferences are stored in your browser. The server keeps short-lived in-process caches; with a
                database configured, saved archives are persisted. No analytics or tracking scripts are loaded.
              </Rule>
            </div>
          </section>

          {/* ---------- RISK ---------- */}
          <section className="space-y-4">
            <H2 id="risk" index="08" title="Risk disclosure" />
            <div className="glass hud-corners border-l-2 border-l-[rgba(255,92,122,0.5)] p-5">
              <div className="flex items-center gap-2">
                <Lock className="h-4 w-4 text-[#FF9DB1]" />
                <span className="font-display text-[0.6875rem] font-semibold uppercase tracking-hud text-[#FF9DB1]">
                  READ BEFORE ACTING ON ANY REPORT
                </span>
              </div>
              <ul className="mt-3 space-y-2 text-xs leading-relaxed text-muted">
                <li>
                  · <span className="text-ghost">Not financial advice.</span> Nothing here is an offer, a solicitation, or a
                  recommendation to buy, sell or hold anything.
                </li>
                <li>
                  · <span className="text-ghost">Not identity attribution.</span> A relationship score describes a
                  transaction pattern. It is not evidence that two addresses share a controller, and must not be presented
                  as such.
                </li>
                <li>
                  · <span className="text-ghost">Incomplete by construction.</span> Coverage is limited to the block window
                  stated in each report. Absence of a relationship inside that window says nothing about the whole chain.
                </li>
                <li>
                  · <span className="text-ghost">Heuristics can be wrong.</span> Pattern flags have innocent explanations
                  listed alongside them. Treat them as triage signals requiring manual verification against the cited
                  hashes.
                </li>
                <li>
                  · <span className="text-ghost">Upstream dependence.</span> Correctness of the underlying data depends on
                  the configured RPC provider. A compromised or misbehaving provider could return incorrect data; the
                  hashes let you check.
                </li>
                <li>
                  · <span className="text-ghost">Chain reorganisations.</span> Very recent blocks may be reorged, so the
                  newest transactions can change. Treat the head of the chain as provisional.
                </li>
                <li>
                  · <span className="text-ghost">No warranty.</span> This is analysis software provided as-is, with no
                  guarantee of accuracy or fitness for any particular purpose.
                </li>
              </ul>
            </div>

            <Rule title="NETWORKS ENABLED IN THIS DEPLOYMENT">
              {enabled.map((k) => (
                <span key={k} className="mr-2 inline-block font-mono text-[0.625rem] text-ice">
                  {CHAIN_META[k].name} (ID {CHAIN_META[k].id})
                </span>
              ))}
            </Rule>
          </section>

          <div className="hairline" />

          <p className="text-[0.6875rem] leading-relaxed text-muted">
            This documentation is generated alongside the application and reflects the deployment you are reading it from.
            Where it states that something is not configured, that statement is derived from the running server
            environment, not from a static list.
          </p>
        </div>
      </div>
    </div>
  );
}
