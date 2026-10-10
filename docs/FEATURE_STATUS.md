# Feature Status

| Feature | Status | Notes |
|---|---|---|
| HOME real chain head | AVAILABLE | Current block, chain ID and recent real activity |
| Wallet connect/disconnect | AVAILABLE | Injected and Coinbase; WalletConnect is configuration-dependent |
| Public subject lookup | AVAILABLE | Does not require connecting a wallet |
| NETWORK depth 1 | AVAILABLE / LIMITED | Real bounded RPC/log evidence; not complete history |
| NETWORK depth 2 | AVAILABLE / LIMITED | Top counterparties only, bounded by node/scan limits |
| NETWORK depth 3 | COMING SOON | UI must not claim it is currently complete |
| 2D/3D graph and inspector | AVAILABLE | Decorative idle scene is isolated from real graph state |
| Deterministic ANALYZE | AVAILABLE / LIMITED | Real evidence inside reported coverage |
| AI narrative | CONFIGURATION REQUIRED | `AI_API_KEY`; no template is substituted |
| INTEL feed | AVAILABLE / POLLING | Recent RPC blocks, not a websocket subscription |
| ARCHIVE with PostgreSQL | CONFIGURATION REQUIRED | `DATABASE_URL` and migration required |
| ARCHIVE memory fallback | LIMITED | Explicitly volatile |
| Private reports | BLOCKED | Requires SIWE/session authorization |
| Archive deletion | BLOCKED | Deliberately absent until ownership is authenticated |
| On-chain attestation | CONFIGURATION REQUIRED | Optional contract; receipt and event are server-verified |
| Full historical address index | AVAILABLE / PAGINATED | Robinhood Blockscout legacy account index; current graph request returns the newest bounded page and reports pagination limits |
| Background scan jobs | BLOCKED | Requires queue/worker infrastructure |
