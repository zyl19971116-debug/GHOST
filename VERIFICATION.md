# VERIFICATION

Measured, reproducible evidence that the build in this repository works. Every
number below came from a command run in this workspace; nothing is estimated.

- **Host:** Windows, Node `v22.22.2`
- **Chain under test:** Robinhood Chain mainnet (chainId `4663`) + testnet (`46630`)

---

## 1. Commands and observed results

| # | Command | Result |
|---|---------|--------|
| 1 | `tsc --noEmit` | exit `0`, zero diagnostics |
| 2 | `tsc -p tsconfig.test.json && node --test .test-build/tests/` | **184 tests, 184 pass, 0 fail** |
| 3 | `next build` | `✔ Compiled successfully`; `BUILD_EXIT=0` |
| 4 | `next start` + `node scripts/verify-routes.mjs` | **15 / 15 checks passed** |
| 5 | `npx hardhat compile` (in `contracts/`) | `Compiled 1 Solidity file successfully (evm target: paris)` |
| 6 | `npx hardhat test` (in `contracts/`) | **31 passing** |
| 7 | `npm run preflight` | full capability report, 4 documented degradations |

### Production build output (command 3)

```
✔ Compiled successfully
✔ Generating static pages (10/10)

Route (app)
├ ○ /                    ├ ƒ /api/analyze         ├ ○ /intel
├ ○ /_not-found          ├ ƒ /api/archive         ├ ○ /network
├ ○ /analyze             ├ ƒ /api/archive/[id]    ├ ○ /settings
├ ○ /archive             ├ ƒ /api/capabilities
├ ○ /docs                ├ ƒ /api/health
                         ├ ƒ /api/intel
                         ├ ƒ /api/network/head
                         └ ƒ /api/wallet/lookup
```

7 pages + 8 API routes. `○` = prerendered static, `ƒ` = server-rendered on demand.

### Route verification (command 4)

```
PAGES
  PASS  GET /           200, title ok, marker ok
  PASS  GET /network    200, title ok
  PASS  GET /analyze    200, title ok
  PASS  GET /intel      200, title ok
  PASS  GET /archive    200, title ok
  PASS  GET /docs       200, title ok, marker ok
  PASS  GET /settings   200, title ok
API
  PASS  GET /api/health       200, ok:true
  PASS  GET /api/capabilities 200, ok:true
  PASS  GET /api/intel        200, ok:true
  PASS  GET /api/archive      200, ok:true
BEHAVIOUR
  PASS  intel honesty                       payload carries events + windowScanned + source
  PASS  POST /api/analyze rejects bad input 400 INVALID_INPUT
  PASS  unsupported chain is refused        400 UNSUPPORTED_CHAIN
  PASS  unknown page returns 404            404
```

---

## 2. Defects found and fixed during this verification pass

Six were real defects in shipping code, not test noise:

| # | File | Defect | Impact if shipped |
|---|------|--------|-------------------|
| 1 | `src/lib/utils.ts` | `isChecksumAddress` compared the whole string, so `String.toUpperCase()` also uppercased the `0x` prefix's `x` | Every all-uppercase address was reported as EIP-55 checksummed |
| 2 | `src/lib/utils.ts` | `isSystemAddress` alias pattern used 34 leading zero nibbles instead of 32 | Arbitrum Nitro system/alias addresses were listed as human counterparties — a fabricated relationship |
| 3 | `src/lib/analysis/deterministic.ts` | `buildGraph` applied `maxNodes` to counterparties only, then added the subject | Graphs could exceed the caller's cap by one node |
| 4 | `src/lib/analysis/deterministic.ts` | Self-transfer anomaly required ≥ 2 self transactions | A single self-directed transaction was silently dropped |
| 5 | `src/lib/analysis/deterministic.ts` | Failed-transaction anomaly required ≥ 3 failures, and its detail text inferred the denominator with an unreadable formula | A lone failed transaction never surfaced; the text was not auditable |
| 6 | `src/lib/graph/layout.ts` | Relaxation accumulated float forces in caller-supplied array order | Identical graphs in different order differed in the last decimal → hydration-mismatch risk |

Plus seven test-expectation bugs in the suite itself (contract-interaction
double-counting, counterparty IN/OUT read from the wrong side, `isContract`
derivation, a too-strict policy regex, and two AI fixtures that violated the very
schema they were meant to exercise). Tests now pin down the real contract, and
`computeCounterparties` carries a doc comment stating that IN/OUT are measured
**relative to the subject**.

---

## 3. What is implemented and verified

- **Deterministic engine** — flow arithmetic, counterparty isolation, graph
  construction, anomaly flags with evidence + confidence, SHA-256 report digest
  that is stable under input reordering. Fully unit-tested; no randomness
  anywhere, so server and client agree.
- **Data layer** — real JSON-RPC reads with pagination, batching, TTL cache with
  in-flight de-duplication, retries with backoff + jitter, a semaphore
  concurrency gate, and a circuit breaker that distinguishes a transient edge
  bot-challenge from a hard failure. Every record carries a `DataSourceInfo`
  provenance block (host, strategy, block window, completeness, limitation).
- **AI boundary** — server-only key; the model receives deterministic statistics
  only, never raw chain payloads; Zod schema validation; automatic redaction of
  common-control assertions; invented transaction hashes are dropped. With no key
  the deterministic analysis is untouched and the narrative section reports
  `not_configured`.
- **Wallet** — wagmi + viem + RainbowKit; injected wallets plus WalletConnect
  when a project id is present. Signature-only; connecting never initiates a
  transaction.
- **Contract** — `AnalysisRegistry.sol`, an append-only notary that stores a
  32-byte report hash, version, subject, chain id and optional metadata CID.
  No payable functions, no token, no custody, no external calls. 31 tests cover
  registration, indexing, pagination, revocation and evidence integrity.
- **Pages** — home, network (2D/3D graph), analyze, intel, archive, docs,
  settings; all seven render with their own title and real content.
- **Database** — Prisma schema + committed migration for
  Wallet/Transaction/Relationship/Analysis/Archive/SyncState, with an in-memory
  repository fallback so the app runs with no database at all.

---

## 4. Pending configuration (explicitly degraded, never faked)

From `npm run preflight` on this machine, with an empty environment:

| Variable | Without it |
|----------|-----------|
| `AI_API_KEY` | `/analyze` shows **AI NOT CONFIGURED**; deterministic analysis is unaffected |
| `DATABASE_URL` | archives are volatile (in-memory); nothing is persisted |
| `NEXT_PUBLIC_REGISTRY_ADDRESS` | archive attestation shows **NOT DEPLOYED** |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | injected wallets still work; WalletConnect / mobile QR is hidden |
| `EXPLORER_API_URL_*` | no full historical index; coverage is a bounded recent-block RPC scan |

Deploying `AnalysisRegistry` additionally needs `DEPLOYER_PRIVATE_KEY` for a
funded account. The deploy script refuses to run on a mismatched chain id or a
zero balance rather than reporting a false success.

**Not covered headlessly:** end-to-end wallet connect/disconnect/network-switch
requires a browser with an injected wallet. The wallet state machine, the
`/settings` surface and the API boundary around it are exercised, but the real
extension handshake is a manual check.

---

## 5. Run steps

```bash
npm install
cp .env.example .env.local     # every value is optional
npm run preflight              # see exactly what this deployment can do
npm run dev                    # http://localhost:3000

npm run test                   # 184 unit tests
npm run lint                   # tsc --noEmit
npm run build && npm run verify:routes

npm run contracts:install
npm run contracts:compile
npm run contracts:test         # 31 contract tests
```

`prisma/migrations/` holds the initial migration; apply it with
`npm run prisma:deploy` once `DATABASE_URL` points at PostgreSQL.
