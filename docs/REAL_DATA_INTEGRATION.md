# Real Data Integration

## Robinhood Chain

- Mainnet chain ID: `4663`
- Native asset: ETH, 18 decimals
- Default RPC: `https://rpc.mainnet.chain.robinhood.com`
- Explorer: `https://robinhoodchain.blockscout.com`
- Chain ID is checked with viem before a NETWORK graph request.

The public RPC is rate limited. It supports chain head, gas price, latest state, blocks, receipts and filtered logs, but it is not an address-history index. Robinhood Blockscout's v2 transaction endpoint is Cloudflare-challenged; the documented Etherscan-compatible `account/txlist` and `account/tokentx` endpoints are reachable server-side and are now the primary address-history source. RPC scanning remains the fallback.

## Data paths

| Feature | Source | Coverage |
|---|---|---|
| Header/HOME chain head | `eth_blockNumber`, `eth_getBlockByNumber`, `eth_gasPrice` | Current head |
| Wallet state | balance, nonce and code at `latest` | Latest state only |
| Native transactions | Bounded full-block scan + receipts | Exact returned block window |
| ERC-20/721 transfers | Transfer logs with `txHash + logIndex` dedupe | Exact log block window |
| NETWORK graph | Blockscout indexed native/token rows + RPC verification/fallback | Newest bounded indexed page; pagination limit is reported |
| ANALYZE | Deterministic statistics over returned evidence | Same bounded coverage |
| INTEL | Recent blocks polled from RPC | Recent configured window |
| ARCHIVE | PostgreSQL through Prisma, or disclosed volatile memory fallback | Deployment dependent |

Token amounts are returned as raw integers with token contract and nullable decimals/symbol. The UI never adds quantities from different contracts. Contract calls with zero value remain interactions, not transfers. Failed transactions are retained as evidence but not silently presented as successful value movement.

## API surface

- `GET /api/health`
- `GET /api/chain/status?chain=robinhood`
- `GET /api/network/head?chain=robinhood`
- `GET /api/wallet/{address}?chain=robinhood`
- `GET /api/wallet/{address}/transactions?limit=50&cursor=0`
- `GET /api/wallet/{address}/transfers?limit=50&cursor=0`
- `POST /api/network/graph`
- `POST /api/analyze`
- `GET /api/intel` and `GET /api/intel/events`
- `GET|POST /api/archive`
- `GET|PATCH /api/archive/{id}`

Job and private-report endpoints are not advertised as available. A durable queue and authenticated SIWE session are required before they can be implemented safely.

## Verified integration sample

Subject `0x7691af0d3d4cf28a4c3a645d03bd4a3fffb0a25e` was obtained from a live Robinhood block. The graph request returned two nodes, one relationship, five unique transaction hashes and six deduplicated Token Transfer logs. A representative evidence transaction is `0xdd410a20a2b1e4efc7963b6e9e3a3632579dfce5bd6ed218992d197e24ea8e19`.
