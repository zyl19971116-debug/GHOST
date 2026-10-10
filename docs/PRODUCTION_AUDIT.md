# GHOST PROTOCOL AI — Production Audit

Audit date: 2026-10-09. Severity order: P0, P1, P2, P3.

| Severity | Feature / File | Current status | Data source | Problem | Fix / disposition | Test result |
|---|---|---|---|---|---|---|
| P0 | NETWORK graph | LIMITED | Robinhood RPC blocks, receipts, Transfer logs | Public RPC cannot provide complete address history | Real bounded scanner, exact coverage, dedupe, partial flag and evidence hashes | Real mainnet address returned verified graph |
| P0 | Archive attestation ABI | FIXED | Solidity source | Handwritten ABI did not match `AnalysisRegistry.sol` | ABI and client call changed to `registerAnalysis` with correct argument order | Typecheck + contract suite |
| P0 | Archive confirmation API | FIXED | Transaction receipt and event logs | Client could mark a record confirmed without server verification | Require successful receipt, configured registry target and matching `AnalysisRegistered` event | Invalid/unconfigured confirmations rejected |
| P0 | Blockscout history | FIXED / PAGINATED | Blockscout legacy account API | v2 transactions endpoint returns HTTP 403 while RPC scanning quickly rate-limits | Use reachable `txlist`/`tokentx` address index first and keep RPC as fallback; report page limits | Active mainnet wallet returned 94 nodes, 93 edges and verifiable hashes |
| P0 | Chain telemetry | FIXED | Robinhood RPC | Gas price was always null | Added real `eth_gasPrice` read and `/api/chain/status` | Typecheck/build |
| P1 | ANALYZE | AVAILABLE / LIMITED | RPC scan + deterministic engine + optional AI | AI narrative unavailable without key; history bounded without indexer | Deterministic results remain available; AI says NOT CONFIGURED | Unit tests cover AI failure and evidence filtering |
| P1 | INTEL | AVAILABLE / POLLING | Recent real blocks | Not a websocket subscription | UI/API state is polling, with fetch timestamp and upstream errors; no generated events | Route and browser checks |
| P1 | ARCHIVE persistence | LIMITED | Prisma PostgreSQL or process memory | No `DATABASE_URL` means restart loses records | UI/API disclose volatile driver; production checklist requires PostgreSQL | Repository tests |
| P1 | Private archives / deletion | BLOCKED | — | No SIWE/session ownership model | No insecure DELETE endpoint added. Requires nonce/session/signature design | Security decision documented |
| P2 | Wallet connection | AVAILABLE / LIMITED | wagmi injected, Coinbase, optional WalletConnect | WalletConnect unavailable without project id | Only configured connectors are shown | Typecheck/browser |
| P2 | HOME telemetry | AVAILABLE | Chain head and real recent blocks | Block time is chain metadata, not sampled per render | Label retained as configured network characteristic; failure shows OFFLINE | Browser route check |
| P2 | DOCS | UPDATED STATUS | Capability report | Some endpoint/status information was incomplete | Status and limitations recorded in integration documents | Documentation review |
| P2 | Responsive layout | FIXED | Browser viewport audit | Header/action badges, docs table and settings tabs could exceed narrow viewports | Mobile header wallet moved into drawer; flexible actions and bounded scroll containers added | No horizontal overflow at 390×844, 1440×900 or 1920×1080 across all routes |
| P3 | Long-running jobs | BLOCKED | — | Scans are request-bound; no worker/queue deployment exists | Bounded scan and 120s ceiling remain. Production worker requires infrastructure choice | Explicitly not claimed |
| P3 | Reorg reconciliation | LIMITED | Block hash stored with transactions | No background canonical-chain reconciliation | Evidence retains block hash; background reconciler remains future work | Schema inspection |

## Authenticity search

No production transaction fixtures, random graph nodes, random balances, fake profits, or simulated live events were found. `Math.random` in the RPC client is retry jitter. `setTimeout` occurrences are debounce, copy feedback, retry/backoff, or request timeout. Decorative WebGL particles are isolated from loaded graph data and explicitly labelled decorative.

## Security summary

- API keys are read only from server environment variables; only explicitly public wallet/chain configuration uses `NEXT_PUBLIC_*`.
- Inputs use Zod/anchored address patterns, fixed chain registries, bounded limits and process-level rate limiting.
- No arbitrary upstream URL is accepted from a request, preventing the graph APIs from becoming SSRF proxies.
- Token quantities retain contract, raw amount and decimals. Unknown decimals stay null; different assets are not summed.
- Relationship confidence describes observed interaction strength and never common ownership.
- Private archive authorization and deletion remain blocked until SIWE/session ownership exists.

## Verification summary

- TypeScript / repository `lint` script: passed (`lint` is currently an alias for `tsc --noEmit`; a standalone ESLint ruleset is not configured).
- Next.js production build: passed. Webpack reported a recoverable local cache deserialization warning and rebuilt successfully.
- Application unit tests: 185 passed.
- Solidity contract tests: 31 passed.
- Production route verifier: 15 passed.
- Browser E2E: all seven pages rendered without console errors; 2D/3D switching passed; all routes had no horizontal overflow at 390×844, 1440×900 and 1920×1080.
