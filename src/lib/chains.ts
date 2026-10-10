import { defineChain, type Chain } from 'viem';
import {
  arbitrum,
  base,
  mainnet as ethereum,
  optimism,
  polygon,
} from 'viem/chains';

/**
 * Chain registry.
 *
 * PROVENANCE POLICY
 * -----------------
 * Every network entry carries a `provenance` block recording exactly where its
 * parameters came from and how they were verified. Nothing here is invented.
 *
 * Robinhood Chain was verified from two independent sources on 2026-10-09:
 *   1. Official documentation — docs.robinhood.com/chain/deploy-smart-contracts
 *      and robinhood.com/us/en/support/articles/robinhood-chain-mainnet
 *   2. A live read-only probe of the public RPC (`eth_chainId`) which returned
 *      `0x1237` (= 4663) for mainnet and `0xb626` (= 46630) for testnet.
 *
 * The other networks are canonical public constants restated from viem/chains;
 * they are marked `canonical` rather than `probed`.
 */
export type ChainVerification = 'probed' | 'canonical' | 'unverified';

export interface ChainProvenance {
  verification: ChainVerification;
  sources: string[];
  verifiedAt?: string;
  note?: string;
}

export interface ChainCapabilities {
  /** Archive block history reachable via eth_getBlockByNumber. */
  archiveBlocks: boolean;
  /** Historical state (eth_getBalance / call at a past block). */
  archiveState: boolean;
  /** Opaque eth_getLogs block-range ceiling before the node rejects the query. */
  logsRangeLimit: number | null;
  /** Max results the node returns for a single eth_getLogs query. */
  logsResultLimit: number | null;
  /** Effective max JSON-RPC batch size before HTTP 429. */
  batchLimit: number | null;
  /** No full historical transaction index is reachable from the public endpoint. */
  historyIndex: 'none' | 'rpc-scan-only' | 'explorer';
  explorerReachableFromServer: boolean;
}

export interface ChainMeta {
  key: ChainKey;
  id: number;
  name: string;
  shortName: string;
  nativeCurrency: { name: string; symbol: string; decimals: number };
  rpcUrl: string;
  publicRpcUrl: string;
  explorerName: string;
  explorerUrl: string;
  testnet: boolean;
  faucetUrl?: string;
  /** Blocks produced per second, from live block-timestamp sampling. */
  blocksPerSecond?: number;
  provenance: ChainProvenance;
  capabilities: ChainCapabilities;
}

export type ChainKey =
  | 'robinhood'
  | 'robinhoodTestnet'
  | 'ethereum'
  | 'base'
  | 'arbitrum'
  | 'optimism'
  | 'polygon';

export const CHAIN_KEYS: ChainKey[] = [
  'robinhood',
  'robinhoodTestnet',
  'ethereum',
  'base',
  'arbitrum',
  'optimism',
  'polygon',
];

// ---------------------------------------------------------------------------
// Robinhood Chain — VERIFIED
// ---------------------------------------------------------------------------
const ROBINHOOD_PROVENANCE: ChainProvenance = {
  verification: 'probed',
  sources: [
    'https://docs.robinhood.com/chain/deploy-smart-contracts',
    'https://robinhood.com/us/en/support/articles/robinhood-chain-mainnet',
    'live eth_chainId probe',
  ],
  verifiedAt: '2026-10-09T09:12:00.000Z',
  note:
    'Arbitrum Nitro / Orbit L2. Mainnet Chain ID 4663, testnet 46630. Native gas token is ETH (18 decimals) — there is no separate RH token. Launched 2026-07-01.',
};

/**
 * Capability envelope measured by probing the public RPC on 2026-10-09.
 * These are observations, not vendor promises — re-measure with
 * `npm run probe:capabilities` if you change RPC providers.
 */
const ROBINHOOD_CAPABILITIES: ChainCapabilities = {
  archiveBlocks: true, // eth_getBlockByNumber worked back to block 1
  archiveState: false, // eth_getBalance at a past block -> "historical state ... is not available"
  logsRangeLimit: 30000, // measured ceiling for filtered eth_getLogs
  logsResultLimit: 10000, // node error: "logs matched by query exceeds limit of 10000"
  batchLimit: 80, // HTTP 429 above this
  historyIndex: 'explorer',
  explorerReachableFromServer: true, // legacy account txlist/tokentx API verified server-side on 2026-10-10
};

export const robinhood: ChainMeta = {
  key: 'robinhood',
  id: 4663,
  name: 'Robinhood Chain',
  shortName: 'RH CHAIN',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrl: 'https://rpc.mainnet.chain.robinhood.com',
  publicRpcUrl: 'https://rpc.mainnet.chain.robinhood.com',
  explorerName: 'Robinhood Chain Explorer',
  explorerUrl: 'https://robinhoodchain.blockscout.com',
  testnet: false,
  blocksPerSecond: 10,
  provenance: ROBINHOOD_PROVENANCE,
  capabilities: ROBINHOOD_CAPABILITIES,
};

export const robinhoodTestnet: ChainMeta = {
  key: 'robinhoodTestnet',
  id: 46630,
  name: 'Robinhood Chain Testnet',
  shortName: 'RH TESTNET',
  nativeCurrency: { name: 'Test Ether', symbol: 'ETH', decimals: 18 },
  rpcUrl: 'https://rpc.testnet.chain.robinhood.com',
  publicRpcUrl: 'https://rpc.testnet.chain.robinhood.com',
  explorerName: 'Robinhood Chain Testnet Explorer',
  explorerUrl: 'https://explorer.testnet.chain.robinhood.com',
  testnet: true,
  faucetUrl: 'https://faucet.testnet.chain.robinhood.com',
  provenance: {
    verification: 'probed',
    sources: [
      'https://docs.robinhood.com/chain/deploy-smart-contracts',
      'live eth_chainId probe',
    ],
    verifiedAt: '2026-10-09T09:12:00.000Z',
    note: 'Testnet tokens have no real-world value. ETH is the gas currency.',
  },
  capabilities: { ...ROBINHOOD_CAPABILITIES, historyIndex: 'rpc-scan-only' },
};

// ---------------------------------------------------------------------------
// Canonical public networks (restated from viem/chains)
// ---------------------------------------------------------------------------
function canonical(
  key: ChainKey,
  chain: { id: number; name: string; nativeCurrency: { name: string; symbol: string; decimals: number }; rpcUrls: { default: { http: readonly string[] } }; blockExplorers?: { default: { name: string; url: string } }; testnet?: boolean },
  shortName: string,
  rpcEnvKey: string,
): ChainMeta {
  return {
    key,
    id: chain.id,
    name: chain.name,
    shortName,
    nativeCurrency: chain.nativeCurrency,
    rpcUrl: chain.rpcUrls.default.http[0],
    publicRpcUrl: chain.rpcUrls.default.http[0],
    explorerName: chain.blockExplorers?.default.name ?? 'Explorer',
    explorerUrl: chain.blockExplorers?.default.url ?? '',
    testnet: Boolean(chain.testnet),
    provenance: {
      verification: 'canonical',
      sources: ['viem/chains canonical definition'],
      note: `Override with ${rpcEnvKey} for production throughput; the built-in public endpoint is rate limited.`,
    },
    capabilities: {
      archiveBlocks: false, // depends entirely on the provider you configure
      archiveState: false,
      logsRangeLimit: 10000,
      logsResultLimit: 10000,
      batchLimit: 50,
      historyIndex: 'rpc-scan-only',
      explorerReachableFromServer: false,
    },
  };
}

export const ethereumMeta = canonical('ethereum', ethereum, 'ETH', 'RPC_URL_ETHEREUM');
export const baseMeta = canonical('base', base, 'BASE', 'RPC_URL_BASE');
export const arbitrumMeta = canonical('arbitrum', arbitrum, 'ARB', 'RPC_URL_ARBITRUM');
export const optimismMeta = canonical('optimism', optimism, 'OP', 'RPC_URL_OPTIMISM');
export const polygonMeta = canonical('polygon', polygon, 'POL', 'RPC_URL_POLYGON');

export const CHAIN_META: Record<ChainKey, ChainMeta> = {
  robinhood,
  robinhoodTestnet,
  ethereum: ethereumMeta,
  base: baseMeta,
  arbitrum: arbitrumMeta,
  optimism: optimismMeta,
  polygon: polygonMeta,
};

// ---------------------------------------------------------------------------
// viem chain objects (used by wagmi / RainbowKit on the client)
// ---------------------------------------------------------------------------
export const robinhoodViem = defineChain({
  id: robinhood.id,
  name: robinhood.name,
  nativeCurrency: robinhood.nativeCurrency,
  rpcUrls: { default: { http: [robinhood.publicRpcUrl] } },
  blockExplorers: {
    default: { name: robinhood.explorerName, url: robinhood.explorerUrl },
  },
  testnet: false,
});

export const robinhoodTestnetViem = defineChain({
  id: robinhoodTestnet.id,
  name: robinhoodTestnet.name,
  nativeCurrency: robinhoodTestnet.nativeCurrency,
  rpcUrls: { default: { http: [robinhoodTestnet.publicRpcUrl] } },
  blockExplorers: {
    default: { name: robinhoodTestnet.explorerName, url: robinhoodTestnet.explorerUrl },
  },
  testnet: true,
});

export const VIEM_CHAINS: Record<ChainKey, Chain> = {
  robinhood: robinhoodViem,
  robinhoodTestnet: robinhoodTestnetViem,
  ethereum,
  base,
  arbitrum,
  optimism,
  polygon,
};

export function isChainKey(value: string): value is ChainKey {
  return (CHAIN_KEYS as string[]).includes(value);
}

export function getChainMeta(key: string): ChainMeta | null {
  return isChainKey(key) ? CHAIN_META[key] : null;
}

export function getChainMetaById(id: number): ChainMeta | null {
  const found = CHAIN_KEYS.find((k) => CHAIN_META[k].id === id);
  return found ? CHAIN_META[found] : null;
}

/** Build a block-explorer link for a transaction hash, or null when unknown. */
export function explorerTxUrl(chainKey: string, hash: string): string | null {
  const meta = getChainMeta(chainKey);
  if (!meta || !meta.explorerUrl) return null;
  return `${meta.explorerUrl.replace(/\/$/, '')}/tx/${hash}`;
}

export function explorerAddressUrl(chainKey: string, address: string): string | null {
  const meta = getChainMeta(chainKey);
  if (!meta || !meta.explorerUrl) return null;
  return `${meta.explorerUrl.replace(/\/$/, '')}/address/${address}`;
}

export function explorerBlockUrl(chainKey: string, block: number | bigint): string | null {
  const meta = getChainMeta(chainKey);
  if (!meta || !meta.explorerUrl) return null;
  return `${meta.explorerUrl.replace(/\/$/, '')}/block/${block.toString()}`;
}
