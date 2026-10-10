# Deployment Checklist

## Required for durable production

- [ ] Node.js 20 or newer.
- [ ] Set `DATABASE_URL` to PostgreSQL.
- [ ] Run `npm run prisma:generate` and `npm run prisma:deploy`.
- [ ] Set `RPC_URL_ROBINHOOD` to a production-capacity provider.
- [ ] Set `NEXT_PUBLIC_SITE_URL` to the canonical HTTPS origin.
- [ ] Run typecheck, tests, contract tests and production build.
- [ ] Confirm `/api/health` reports PostgreSQL rather than memory.

## Optional integrations

- [ ] Set `AI_API_KEY`; otherwise deterministic analysis works and AI summary is unavailable.
- [ ] Set `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`; otherwise only injected/Coinbase connectors are shown.
- [ ] Configure `EXPLORER_API_URL_ROBINHOOD` and `EXPLORER_API_KEY_ROBINHOOD` only for a verified reachable indexer.
- [ ] Deploy `AnalysisRegistry` intentionally, verify its bytecode, then set `NEXT_PUBLIC_REGISTRY_ADDRESS` and chain ID. Never reuse a test deployment.

## Security gates

- [ ] Keep private keys out of the web deployment. `DEPLOYER_PRIVATE_KEY` belongs only in an isolated deployment environment.
- [ ] Add a shared rate limiter when deploying more than one application instance.
- [ ] Do not enable private reports or DELETE until SIWE nonce/session authorization is implemented.
- [ ] Use a worker/queue before increasing scan windows beyond request-safe limits.
- [ ] Monitor RPC 403/429/timeout rates and stale head timestamps.
- [ ] Verify CSP, HTTPS, secure cookies and database backups at the hosting layer.

## Release verification

1. Query `/api/chain/status` and confirm chain ID 4663, head, timestamp and gas price.
2. Query a known active wallet and open every returned evidence hash in Blockscout.
3. Test empty, invalid, timeout and partial-data states.
4. Exercise wallet connect/disconnect/account change/network switch.
5. Confirm 2D/3D selection, filters and inspector.
6. Confirm AI unavailable state without a key.
7. Create and reopen an archive after a server restart.
8. Confirm no screen says VERIFIED/CONFIRMED unless a receipt and matching event exist.

