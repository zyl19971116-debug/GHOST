import { CHAIN_KEYS, CHAIN_META, type ChainKey } from './chains';

function env(key: string): string | undefined {
  const v = process.env[key];
  if (v === undefined) return undefined;
  const trimmed = v.trim();
  return trimmed === '' ? undefined : trimmed;
}

function envInt(key: string, fallback: number): number {
  const raw = env(key);
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

function envList(key: string, fallback: string[]): string[] {
  const raw = env(key);
  if (!raw) return fallback;
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

// ---------------------------------------------------------------------------
// Public (browser-safe) configuration
// ---------------------------------------------------------------------------
export interface PublicConfig {
  siteUrl: string;
  chains: ChainKey[];
  defaultChain: ChainKey;
  walletConnectProjectId: string | null;
  registryAddress: string | null;
  registryChainId: number;
  features: {
    walletConnect: boolean;
    onchainRegistry: boolean;
  };
}

export function getPublicConfig(): PublicConfig {
  const chainKeys = envList('NEXT_PUBLIC_CHAINS', ['robinhood', 'robinhoodTestnet', 'ethereum', 'base'])
    .filter((k): k is ChainKey => (CHAIN_KEYS as string[]).includes(k));

  const chains = chainKeys.length > 0 ? chainKeys : (['robinhood'] as ChainKey[]);

  const defaultRaw = env('NEXT_PUBLIC_DEFAULT_CHAIN');
  const defaultChain =
    defaultRaw && (chains as string[]).includes(defaultRaw) ? (defaultRaw as ChainKey) : chains[0];

  const wcId = env('NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID');
  const registryAddress = env('NEXT_PUBLIC_REGISTRY_ADDRESS');

  return {
    siteUrl: env('NEXT_PUBLIC_SITE_URL') ?? 'http://localhost:3000',
    chains,
    defaultChain,
    walletConnectProjectId: wcId ?? null,
    registryAddress: registryAddress ?? null,
    registryChainId: envInt('NEXT_PUBLIC_REGISTRY_CHAIN_ID', 4663),
    features: {
      walletConnect: Boolean(wcId),
      onchainRegistry: Boolean(registryAddress),
    },
  };
}

// ---------------------------------------------------------------------------
// Server-only configuration
// ---------------------------------------------------------------------------
export interface DataLimits {
  scanMaxBlocks: number;
  scanBatchSize: number;
  rpcMaxConcurrency: number;
  rpcTimeoutMs: number;
  rpcMaxRetries: number;
  cacheTtlSeconds: number;
  apiRateLimitMax: number;
  apiRateLimitWindowMs: number;
}

const RPC_ENV_BY_CHAIN: Record<ChainKey, string> = {
  robinhood: 'RPC_URL_ROBINHOOD',
  robinhoodTestnet: 'RPC_URL_ROBINHOOD_TESTNET',
  ethereum: 'RPC_URL_ETHEREUM',
  base: 'RPC_URL_BASE',
  arbitrum: 'RPC_URL_ARBITRUM',
  optimism: 'RPC_URL_OPTIMISM',
  polygon: 'RPC_URL_POLYGON',
};

const EXPLORER_ENV_BY_CHAIN: Record<ChainKey, string> = {
  robinhood: 'EXPLORER_API_URL_ROBINHOOD',
  robinhoodTestnet: 'EXPLORER_API_URL_ROBINHOOD_TESTNET',
  ethereum: 'EXPLORER_API_URL_ETHEREUM',
  base: 'EXPLORER_API_URL_BASE',
  arbitrum: 'EXPLORER_API_URL_ARBITRUM',
  optimism: 'EXPLORER_API_URL_OPTIMISM',
  polygon: 'EXPLORER_API_URL_POLYGON',
};

const EXPLORER_KEY_BY_CHAIN: Record<ChainKey, string> = {
  robinhood: 'EXPLORER_API_KEY_ROBINHOOD',
  robinhoodTestnet: 'EXPLORER_API_KEY_ROBINHOOD_TESTNET',
  ethereum: 'EXPLORER_API_KEY_ETHEREUM',
  base: 'EXPLORER_API_KEY_BASE',
  arbitrum: 'EXPLORER_API_KEY_ARBITRUM',
  optimism: 'EXPLORER_API_KEY_OPTIMISM',
  polygon: 'EXPLORER_API_KEY_POLYGON',
};

export interface ServerConfig {
  limits: DataLimits;
  ai: {
    configured: boolean;
    baseUrl: string;
    model: string;
    apiKey: string | null;
    timeoutMs: number;
    maxOutputTokens: number;
  };
  database: {
    configured: boolean;
    url: string | null;
  };
}

export function getServerConfig(): ServerConfig {
  const apiKey = env('AI_API_KEY') ?? null;
  const dbUrl = env('DATABASE_URL') ?? null;

  return {
    limits: {
      scanMaxBlocks: Math.min(envInt('SCAN_MAX_BLOCKS', 3000), 20000),
      scanBatchSize: Math.min(envInt('SCAN_BATCH_SIZE', 50), 100),
      rpcMaxConcurrency: Math.max(1, Math.min(envInt('RPC_MAX_CONCURRENCY', 4), 16)),
      rpcTimeoutMs: envInt('RPC_TIMEOUT_MS', 20000),
      rpcMaxRetries: Math.max(0, Math.min(envInt('RPC_MAX_RETRIES', 3), 6)),
      cacheTtlSeconds: envInt('CACHE_TTL_SECONDS', 45),
      apiRateLimitMax: envInt('API_RATE_LIMIT_MAX', 60),
      apiRateLimitWindowMs: envInt('API_RATE_LIMIT_WINDOW_MS', 60000),
    },
    ai: {
      configured: Boolean(apiKey),
      baseUrl: (env('AI_BASE_URL') ?? 'https://api.openai.com/v1').replace(/\/$/, ''),
      model: env('AI_MODEL') ?? 'gpt-4o-mini',
      apiKey,
      timeoutMs: envInt('AI_TIMEOUT_MS', 45000),
      maxOutputTokens: envInt('AI_MAX_OUTPUT_TOKENS', 1600),
    },
    database: {
      configured: Boolean(dbUrl),
      url: dbUrl,
    },
  };
}

export interface EffectiveSource {
  chainKey: ChainKey;
  rpcUrl: string;
  rpcIsDefault: boolean;
  explorerUrl: string | null;
  explorerApiKey: string | null;
}

export function getEffectiveSource(chainKey: ChainKey): EffectiveSource {
  const meta = CHAIN_META[chainKey];
  const configuredRpc = env(RPC_ENV_BY_CHAIN[chainKey]);
  const explorerUrl = env(EXPLORER_ENV_BY_CHAIN[chainKey]) ?? null;
  const explorerKey = env(EXPLORER_KEY_BY_CHAIN[chainKey]) ?? null;

  return {
    chainKey,
    rpcUrl: configuredRpc ?? meta.rpcUrl,
    rpcIsDefault: !configuredRpc,
    explorerUrl: explorerUrl ? explorerUrl.replace(/\/$/, '') : null,
    explorerApiKey: explorerKey,
  };
}

/** Browser-side RPC for wagmi. Falls back to the public endpoint. */
export function getBrowserRpcUrl(chainKey: ChainKey): string {
  const map: Record<string, string | undefined> = {
    robinhood: env('NEXT_PUBLIC_RPC_URL_ROBINHOOD'),
    robinhoodTestnet: env('NEXT_PUBLIC_RPC_URL_ROBINHOOD_TESTNET'),
    ethereum: env('NEXT_PUBLIC_RPC_URL_ETHEREUM'),
    base: env('NEXT_PUBLIC_RPC_URL_BASE'),
  };
  return map[chainKey] ?? CHAIN_META[chainKey].publicRpcUrl;
}

// ---------------------------------------------------------------------------
// Live capability report — what this deployment can and cannot actually do
// ---------------------------------------------------------------------------
export interface CapabilityReport {
  chains: {
    key: ChainKey;
    id: number;
    name: string;
    rpcConfigured: boolean;
    rpcUrlLabel: string;
    explorerConfigured: boolean;
    /** Human-readable description of the guaranteed data coverage. */
    historyCoverage: string;
    limitations: string[];
  }[];
  ai: { configured: boolean; model: string | null; baseUrl: string | null };
  database: { configured: boolean; driver: string };
  registry: { configured: boolean; address: string | null; chainId: number };
  limits: DataLimits;
  generatedAt: string;
}

function labelRpc(url: string): string {
  try {
    const u = new URL(url);
    return u.host;
  } catch {
    return 'invalid-url';
  }
}

export function getCapabilityReport(now: Date = new Date()): CapabilityReport {
  const server = getServerConfig();
  const pub = getPublicConfig();

  return {
    chains: pub.chains.map((key) => {
      const meta = CHAIN_META[key];
      const src = getEffectiveSource(key);
      const builtInExplorer = key === 'robinhood' && meta.capabilities.explorerReachableFromServer;
      const limitations: string[] = [];

      if (!src.explorerUrl && !builtInExplorer) {
        limitations.push(
          'No block-explorer/indexer API is configured for this deployment, so there is no full historical transaction index. Coverage is limited to a bounded scan of recent blocks over the RPC endpoint.',
        );
      }
      if (!meta.capabilities.archiveState) {
        limitations.push(
          'Historical state is unavailable: balances and contract calls can only be read at the latest block, not at a past block height.',
        );
      }
      if (!meta.capabilities.explorerReachableFromServer) {
        limitations.push(
          `${meta.explorerName} applies an edge bot-challenge and returns HTTP 403 to server-side requests, so it cannot be scraped or proxied. Transaction evidence links open in your browser instead.`,
        );
      }

      const seconds = server.limits.scanMaxBlocks / (meta.blocksPerSecond ?? 1);
      const historyCoverage = src.explorerUrl || builtInExplorer
        ? 'Indexer-backed history (paged through the configured explorer API).'
        : `Bounded RPC scan of the most recent ${server.limits.scanMaxBlocks.toLocaleString('en-US')} blocks${meta.blocksPerSecond ? ` (≈ ${Math.round(seconds / 60)} minutes of chain time at ~${meta.blocksPerSecond} blocks/s)` : ''}.`;

      return {
        key,
        id: meta.id,
        name: meta.name,
        rpcConfigured: !src.rpcIsDefault,
        rpcUrlLabel: labelRpc(src.rpcUrl),
        explorerConfigured: Boolean(src.explorerUrl) || builtInExplorer,
        historyCoverage,
        limitations,
      };
    }),
    ai: server.ai.configured
      ? { configured: true, model: server.ai.model, baseUrl: labelRpc(server.ai.baseUrl) }
      : { configured: false, model: null, baseUrl: null },
    database: server.database.configured
      ? { configured: true, driver: 'postgresql (prisma)' }
      : { configured: false, driver: 'in-memory (volatile)' },
    registry: {
      configured: pub.features.onchainRegistry,
      address: pub.registryAddress,
      chainId: pub.registryChainId,
    },
    limits: server.limits,
    generatedAt: now.toISOString(),
  };
}
