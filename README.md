# GHOST PROTOCOL AI

**THE INVISIBLE INTELLIGENCE LAYER**

On-chain wallet relationship analysis. Enter an EVM address, read its real
transactions, map its counterparties and trace value flow — with every result
traceable to a transaction hash.

---

## The one rule this codebase is built around

**Nothing is fabricated.** No fake transactions, no invented statistics, no
simulated profit, no "live" numbers that are not read from a chain, no button
that does nothing, no integration that is claimed but not configured.

That rule is enforced structurally, not by convention:

| Concern | How it is enforced |
| --- | --- |
| Where did this number come from? | Every payload carries a `DataSourceInfo` block: host, strategy, block window, blocks actually scanned, latest synced block, cache status, completeness (`complete` / `partial` / `unavailable`) and a written limitation. |
| Is the history complete? | It never claims to be. Robinhood Chain has no server-reachable indexer, so coverage is a **bounded recent-block scan** and the UI says so, with the exact block range. |
| Is the AI making things up? | The model only ever receives deterministic statistics, never raw RPC payloads. Its output is schema-validated, and statements asserting common ownership/control are stripped automatically and reported as redactions. |
| Is a wallet the same person as another wallet? | The platform never asserts it. Confidence is scored, `basis` and `limitations` are mandatory on every finding and every graph edge. |
| Is the contract deployed? | With no address configured the archive shows `NOT DEPLOYED`. Source verification refuses to claim success when the explorer blocks server-side requests. |
| Is the database durable? | With no `DATABASE_URL` the app uses a **volatile in-memory** store and says `in-memory (volatile)` in the UI. |

---

## Verified network parameters — provenance

Robinhood Chain was verified on **2026-10-09** from two independent sources and a
live probe. The values are recorded in `src/lib/chains.ts` together with where
they came from and when.

| | Mainnet | Testnet |
| --- | --- | --- |
| Chain ID | **4663** (`0x1237`) | **46630** (`0xb626`) |
| RPC | `https://rpc.mainnet.chain.robinhood.com` | `https://rpc.testnet.chain.robinhood.com` |
| Explorer | `https://robinhoodchain.blockscout.com` | `https://explorer.testnet.chain.robinhood.com` |
| Native asset | **ETH**, 18 decimals | ETH, 18 decimals |

Sources: `docs.robinhood.com/chain/deploy-smart-contracts`,
`robinhood.com/us/en/support/articles/robinhood-chain-mainnet`, plus a live
`eth_chainId` probe of the public RPC.

**There is no separate RH token.** Robinhood Chain is an Arbitrum Nitro / Orbit
L2 and uses ETH for gas.

### Measured capability envelope (public RPC, 2026-10-09)

These were measured, not assumed, and they drive the architecture:

| Capability | Result | Consequence |
| --- | --- | --- |
| `eth_getBlockByNumber` back to block 1 | ✅ archive **blocks** | A block-window scan is possible. |
| Historical **state** (`eth_balance` at a past block) | ❌ unavailable | Balances are latest-block only; the UI states `stateReadAtBlock`. |
| `eth_getLogs` filtered range | ceiling ≈ 30 000 blocks | Log queries are chunked. |
| `eth_getLogs` result count | ceiling 10 000 rows | Queries are narrowed, never truncated silently. |
| JSON-RPC batch size | 429 above ~100 | Batches are chunked (default 50). |
| Blockscout explorer API from the server | ❌ HTTP 403 + Cloudflare challenge | **No server-reachable history index.** Explorer links open in the user's browser instead. |
| Edge bot-challenge behaviour | intermittent 403/200; ~20 s recovery | Retry tolerance + circuit breaker with a 25 s cooldown. |

The last two are the reason this project does **not** offer "complete wallet
history". It offers an honest, bounded, fully-attributed recent-window scan, and
tells you exactly which blocks it read.

---

## Quick start

```bash
# 1. install (uses the public npm registry; mirrors are fine too)
npm install

# 2. nothing else is required — every key is optional
npm run dev
# → http://localhost:3000
```

Then:

```bash
npm run preflight     # what this deployment can and cannot do
npm run typecheck     # tsc --noEmit
npm run test          # 130+ unit tests, no network required
npm run build         # production build
npm run verify:routes # boots `next start` and asserts every route + API
```

### Optional configuration

Copy `.env.example` to `.env.local`. Each item below is genuinely optional and
each one degrades visibly rather than silently.

| Variable | Effect when set | Effect when absent |
| --- | --- | --- |
| `RPC_URL_ROBINHOOD` | Dedicated RPC — higher throughput, no edge challenges | Public RPC, rate-limited, occasional bot-challenge |
| `EXPLORER_API_URL_ROBINHOOD` | Adds an indexer adapter for deeper history | **Bounded RPC scan only** (the default, and what the public explorer currently forces) |
| `AI_API_KEY` | Enables the AI narrative layer | Deterministic analysis still works; the AI section renders `AI NOT CONFIGURED` |
| `DATABASE_URL` | PostgreSQL persistence via Prisma | Volatile in-memory store, labelled as such |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | Enables WalletConnect / QR flow | Injected wallets (MetaMask, Rabby, Coinbase) still work |
| `NEXT_PUBLIC_REGISTRY_ADDRESS` | Enables on-chain attestation | Archive shows `NOT DEPLOYED` |
| `SCAN_MAX_BLOCKS` | Larger scan window | Default 3 000 blocks (≈ 5 min of chain time at ~10 blocks/s) |

Secrets are read **server-side only**. `NEXT_PUBLIC_*` values are the only ones
that reach the browser, and they are all non-secret.

---

## Routes

| Route | What it does |
| --- | --- |
| `/` | Command-centre home: 3D chain-node globe, live intelligence feed, pipeline explainer, capability panel. |
| `/network` | Wallet relationship graph with a 2D canvas / 3D WebGL toggle, zoom, pan, node selection, wallet filter and relationship-depth control. |
| `/analyze` | Address input with chain + address validation, real transaction read, flow stats, counterparty table, contract interactions, anomaly flags, AI narrative, evidence links. |
| `/intel` | Live on-chain activity feed with search and filtering. Shows `NO LIVE DATA` rather than filling the screen. |
| `/archive` | Saved analyses and their on-chain attestation state. |
| `/docs` | Mechanism, data sources, AI boundaries, privacy, risk. |
| `/settings` | Wallet connection state, network switching, data-layer limits, coverage per network. |

Every navigation item resolves, every button performs an action, and no control
is decorative.

### API

| Endpoint | Purpose |
| --- | --- |
| `GET /api/health` | Liveness plus the full capability report. |
| `GET /api/capabilities` | What this deployment can and cannot do. |
| `GET /api/network/head` | Live chain head: latest block, block time, latency. |
| `POST /api/wallet/lookup` | Wallet state (balance, nonce, contract check). |
| `POST /api/analyze` | Full analysis run: real transactions, deterministic stats, graph, optional AI. |
| `GET /api/intel` | Recent on-chain events, paged and filterable. |
| `GET|POST /api/archive`, `PATCH /api/archive/[id]` | Saved analyses and attestation state. |

All endpoints return `{ ok, data, source, error, meta }` and honour
`X-RateLimit-*` headers.

---

## Architecture

```
src/
  app/                    Next.js App Router: 7 pages + 8 API routes
  components/
    home/                 Hero, GhostFigure (original SVG), GhostGlobeCanvas (R3F), LiveFeed, FeatureCards
    network/              GraphViews (2D canvas + 3D scene), NetworkExplorer
    analyze/              AnalyzeConsole, ReportSections
    intel/ archive/ settings/ layout/ system/ ui/
  lib/
    chains.ts             Chain registry WITH provenance blocks
    config.ts             Public vs server config, capability report
    types.ts              Domain types — every record carries its source
    data/
      rpc.ts              JSON-RPC client: semaphore, TTL cache, retry+backoff,
                          circuit breaker, edge-challenge handling, batching
      onchain.ts          Head, wallet state, block-window scanner, log reader
      method-labels.ts    Known 4-byte selectors ONLY — unknown stays unknown
    analysis/
      deterministic.ts    Flow, counterparties, graph, anomalies, report digest
      pipeline.ts         Orchestration + multi-hop expansion
    ai/llm.ts             Server-only LLM wrapper, schema-validated, redacting
    graph/layout.ts       Deterministic force layout (no Math.random → no hydration drift)
    db/repository.ts      Prisma adapter + in-memory fallback
    contracts/            AnalysisRegistry ABI
contracts/                Hardhat project: AnalysisRegistry.sol + tests + scripts
prisma/                   Schema + generated initial migration
tests/                    Node test-runner unit suite
scripts/                  preflight.mjs, verify-routes.mjs
```

### Data flow for one analysis

1. **Validate** — chain key and address are checked against anchored regexes.
2. **Read the head** — real `eth_blockNumber` + latest block, giving the window.
3. **Scan** — a bounded window of blocks is read in batches, keeping only
   transactions touching the subject. Receipts are fetched only for returned rows.
4. **Compute** — flow totals, counterparty ranking, graph edges, anomaly flags.
   All pure arithmetic over the rows above, seeded by a sha256 digest.
5. **Narrate** (optional) — the digest-checked statistics are handed to the model.
6. **Attribute** — every layer attaches its `DataSourceInfo`, including limits.

### Connection

`wagmi` + `viem` + RainbowKit. Connect, disconnect, switch account, switch
network and refresh all use the real connector APIs. Authentication is
**signature-based only** — no private key, no seed phrase, and connecting a
wallet never initiates a transaction.

---

## The contract (optional)

`contracts/contracts/AnalysisRegistry.sol` is a minimal append-only notary. It
records, for an analysis you choose to publish:

* `keccak256` of the report digest,
* the report schema version,
* the wallet analysed,
* the chain the analysis ran against,
* an optional metadata pointer (IPFS CID),
* the block timestamp.

It is **not** a token, **not** custody, **not** a transfer proxy, **not** a
yield mechanism. It has no `payable` function and no external call — the test
suite asserts that a plain ETH transfer to it reverts, and that the deployed
bytecode holds no balance. Report contents are never written on chain.

```bash
cd contracts
cp .env.example .env          # add DEPLOYER_PRIVATE_KEY (throwaway, funded)
npm install
npm run compile
npm test                       # 30 assertions across registration, indexing,
                              # revocation, evidence integrity
npm run deploy -- --network robinhoodTestnet
npm run verify -- --network robinhoodTestnet
```

`deploy.js` refuses to run if the reported chain ID does not match the
configured network, if there is no signer, or if the deployer balance is zero.
`verify.js` reports a blocked explorer as a **provider-side limitation** and
never claims verification succeeded.

After deploying, put the address in the root `.env.local`:

```
NEXT_PUBLIC_REGISTRY_ADDRESS=0x…
NEXT_PUBLIC_REGISTRY_CHAIN_ID=4663
```

---

## Testing

```bash
npm test            # compiles tests/ then runs the node test runner
npm run test:only   # re-run without recompiling
```

Coverage of the parts that matter:

| Area | What is asserted |
| --- | --- |
| Address / hash validation | Length, prefix, hex-only, checksum detection, whitespace |
| System addresses | Zero/burn/Nitro aliases are never reported as counterparties |
| RPC client | Retry on 5xx, no retry on 4xx, transient-403 recovery, sustained-403 circuit breaker with fail-fast, 429 cooldown, cache keying, in-flight de-duplication, batch chunking, per-item error isolation, concurrency ceiling |
| Deterministic engine | Flow arithmetic, net flow sign, counterparty isolation, anomaly evidence, graph edge confidence + basis, digest stability under reordering |
| Graph layout | Determinism, order-independence, finite coordinates, canvas clamping, subject anchoring |
| AI degradation | `not_configured` with no key, no network call, HTTP/schema/JSON failure modes, ownership-claim redaction, invented-hash rejection |
| Chain registry | No duplicate IDs, provenance present on every entry, probed values match the live probe, `rpc-scan-only` never claims an index |
| API boundary | Rate-limit windows, per-key isolation, request schemas, structured 400 envelope |
| Archive repository | Memory fallback driver, attestation lifecycle, filters, ordering |
| Contract | Registration, indexing, pagination, revocation authorisation, size limits, evidence integrity, non-payability |

Every test fixture is explicitly synthetic and is used only to exercise
arithmetic. The runtime path always reads from a real endpoint.

---

## Performance and accessibility

* **Canvas-first rendering.** The 3D scene caps device pixel ratio, and the 2D
  graph is drawn on a canvas rather than as thousands of DOM nodes.
* **Reduced motion.** `prefers-reduced-motion` disables globe rotation, scanlines
  and entrance animations.
* **Mobile degradation.** WebGL is replaced by the 2D renderer on small screens
  and where WebGL is unavailable.
* **Deterministic layout.** No `Math.random()` anywhere in render paths, so the
  server and client markup agree — no hydration warnings.
* **Keyboard and semantics.** Skip link, labelled controls, focus rings,
  `aria-*` on interactive widgets.

---

## Known limitations (stated, not hidden)

1. **No complete wallet history on Robinhood Chain.** The public explorer API is
   behind a Cloudflare challenge for server-side callers, and historical state is
   unavailable. Coverage is a bounded recent-block scan, reported with its exact
   window. Configure `EXPLORER_API_URL_ROBINHOOD` against an indexer you can reach
   to extend it.
2. **The public RPC is rate limited and intermittently challenged.** A dedicated
   provider is strongly recommended for anything beyond interactive use.
3. **Graph expansion beyond depth 1 is inferred, not scanned.** Second-hop edges
   are discovered inside the same scanned window and carry visibly lower
   confidence, with the reason written into the edge's `basis`.
4. **In-memory archives do not survive a restart.** Set `DATABASE_URL` for
   durability.
5. **The AI layer is disabled until you supply a key.** That is a deliberate
   default, not a bug.
6. **Multi-instance deployments need a shared rate limiter.** The built-in one is
   process-local and says so.

---

## Licence

MIT.
