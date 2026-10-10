/**
 * Domain types shared by the server data layer, the analysis engine and the UI.
 * Every record that reaches the UI carries its provenance — there is no path in
 * this codebase that produces a transaction, statistic or conclusion without a
 * traceable source.
 */

export type ScanCompleteness =
  /** The full requested window was read. */
  | 'complete'
  /** Part of the window was read (limit or upstream error stopped us early). */
  | 'partial'
  /** Nothing could be read. */
  | 'unavailable';

export interface DataSourceInfo {
  /** Human label, e.g. "Robinhood Chain RPC". */
  label: string;
  /** Host of the endpoint that answered. */
  host: string;
  /** Which strategy produced the data. */
  strategy: 'rpc-block-scan' | 'rpc-logs' | 'explorer-indexer' | 'rpc-state';
  chainKey: string;
  chainId: number;
  /** Whether this strategy provides a complete historical index. */
  fullHistoryIndex: boolean;
  /** Blocks covered by a scan strategy. */
  fromBlock?: number;
  toBlock?: number;
  blocksScanned?: number;
  /** Latest synchronised block height reported by the node. */
  latestSyncedBlock?: number;
  /** Server time when the data was assembled. */
  fetchedAt: string;
  /** Node block time at `latestSyncedBlock`. */
  latestBlockTimestamp?: string;
  cache: 'hit' | 'miss' | 'partial';
  completeness: ScanCompleteness;
  /** Set when coverage is limited; rendered verbatim in the UI. */
  limitation?: string;
  /** Set when the upstream itself failed. */
  error?: { code: string; message: string; detail?: string };
}

export interface TransactionRecord {
  hash: string;
  blockNumber: number;
  blockHash: string;
  timestamp: string;
  from: string;
  to: string | null;
  valueWei: string;
  valueEth: string;
  gasLimit: string;
  gasPriceWei: string;
  gasUsed: string | null;
  effectiveGasPriceWei: string | null;
  feeWei: string | null;
  nonce: number;
  inputSize: number;
  methodId: string | null;
  /** Only set for well-known selectors — never guessed. */
  methodLabel: string | null;
  txType: string;
  status: 'success' | 'failed' | 'unknown';
  isContractCreation: boolean;
  isContractInteraction: boolean;
  direction: 'in' | 'out' | 'self';
  explorerUrl: string | null;
  /** Always present: the strategy that produced this exact row. */
  sourceStrategy: DataSourceInfo['strategy'];
}

export interface WalletProfile {
  address: string;
  chainKey: string;
  chainId: number;
  /** Latest-block reads only — historical state is unavailable on this node. */
  balanceWei: string | null;
  balanceEth: string | null;
  nonce: number | null;
  isContract: boolean | null;
  codeSize: number | null;
  stateReadAtBlock: number | null;
  stateUnavailableReason?: string;
}

export interface CounterpartyStat {
  address: string;
  isContract: boolean | null;
  txCount: number;
  inboundCount: number;
  outboundCount: number;
  volumeInWei: string;
  volumeOutWei: string;
  firstSeenBlock: number;
  lastSeenBlock: number;
  firstSeenAt: string;
  lastSeenAt: string;
  /** Share of the subject wallet's observed activity, 0..1. */
  share: number;
  sampleTxHashes: string[];
}

export interface RelationshipNode {
  id: string;
  address: string;
  label: string;
  kind: 'subject' | 'counterparty' | 'contract' | 'token' | 'unknown';
  /** Graph depth from the subject wallet (0 = subject). */
  depth: number;
  txCount: number;
  volumeWei: string;
  isContract: boolean | null;
  riskScore: number;
  flags: string[];
  /** Real token contracts observed in Transfer logs for this relationship. */
  tokenActivity?: TokenTransferEvidence[];
  incomingValueWei?: string;
  outgoingValueWei?: string;
  lastActivity?: string | null;
  type?: 'subject' | 'counterparty' | 'contract' | 'token' | 'unknown';
  transactionCount?: number;
  incomingValue?: AssetAmount;
  outgoingValue?: AssetAmount;
}

export interface RelationshipEdge {
  id: string;
  source: string;
  target: string;
  txCount: number;
  volumeWei: string;
  direction: 'in' | 'out' | 'both';
  firstSeenAt: string;
  lastSeenAt: string;
  sampleTxHashes: string[];
  /** Confidence that the two addresses are economically related, 0..1. */
  confidence: number;
  /** Why the engine assigned that confidence. */
  basis: string[];
  /** Native currency only. Token quantities are kept separately below. */
  nativeValueWei?: string;
  tokenTransfers?: TokenTransferEvidence[];
  transactionCount?: number;
  transactionHashes?: string[];
  nativeValue?: AssetAmount;
  firstSeen?: string;
  lastSeen?: string;
}

export interface AssetAmount {
  assetType: 'native' | 'token';
  symbol: string | null;
  contractAddress: string | null;
  decimals: number | null;
  raw: string;
}

export interface TokenTransferEvidence {
  tokenAddress: string;
  transactionHash: string;
  logIndex: number;
  direction: 'in' | 'out';
  counterparty: string;
  /** Raw uint256 amount; decimals/symbol are null until verified on-chain. */
  amountRaw: string | null;
  decimals: number | null;
  symbol: string | null;
  standard: 'erc20' | 'erc721' | 'unknown';
  blockNumber: number;
  timestamp?: string | null;
}

export interface AnomalyFlag {
  id: string;
  kind:
    | 'high_frequency_burst'
    | 'round_number_transfers'
    | 'rapid_in_out'
    | 'single_counterparty_dominance'
    | 'fan_in'
    | 'fan_out'
    | 'failed_tx_spike'
    | 'contract_creation'
    | 'dormant_then_active'
    | 'self_transfer_loop';
  severity: 'info' | 'low' | 'medium' | 'high';
  title: string;
  detail: string;
  /** The observations that triggered it, with the numbers behind them. */
  evidence: { label: string; value: string }[];
  sampleTxHashes: string[];
  /** 0..1 — how strongly the observed data supports this flag. */
  confidence: number;
}

export interface FlowBreakdown {
  inboundTxCount: number;
  outboundTxCount: number;
  selfTxCount: number;
  inboundVolumeWei: string;
  outboundVolumeWei: string;
  netFlowWei: string;
  totalFeesWei: string;
  uniqueCounterparties: number;
  contractInteractions: number;
  contractCreations: number;
  failedTxCount: number;
  successRate: number;
  /** Observed activity window inside the scanned range. */
  firstActivityAt: string | null;
  lastActivityAt: string | null;
  activeBlocks: number;
  /** Transactions per hour inside the observed window. */
  txPerHour: number;
  busiestHourISO: string | null;
  busiestHourTxCount: number;
}

export interface DeterministicStats {
  profile: WalletProfile;
  flow: FlowBreakdown;
  counterparties: CounterpartyStat[];
  /** Activity histogram bucketed by hour, oldest first. */
  activityByHour: { bucketStartISO: string; txCount: number; volumeWei: string }[];
  anomalies: AnomalyFlag[];
  txCount: number;
  /** Observed tx methods (4-byte selector or "native-transfer"). */
  methodBreakdown: { method: string; label: string | null; count: number }[];
  /** Transaction type breakdown (legacy / EIP-1559 / Arbitrum internal). */
  typeBreakdown: { type: string; label: string; count: number }[];
}

export interface AiFinding {
  title: string;
  detail: string;
  confidence: number;
  basis: string[];
  limitations: string[];
  sampleTxHashes: string[];
}

export interface AiReport {
  status: 'generated' | 'not_configured' | 'failed';
  model: string | null;
  generatedAt: string;
  summary: string | null;
  findings: AiFinding[];
  riskNotes: string[];
  timeline: { label: string; detail: string; txHashes: string[] }[];
  limitations: string[];
  error?: { code: string; message: string; detail?: string };
  /** The model is explicitly forbidden from asserting common control. */
  policy: string;
}

export interface AnalysisReport {
  id: string;
  subject: string;
  chainKey: string;
  chainId: number;
  createdAt: string;
  /** Digest of the deterministic inputs; used for the on-chain attestation. */
  reportHash: string;
  reportVersion: string;
  dataSources: DataSourceInfo[];
  stats: DeterministicStats;
  graph: { nodes: RelationshipNode[]; edges: RelationshipEdge[] };
  ai: AiReport;
  transactions: TransactionRecord[];
  transactionPage: { returned: number; totalObserved: number };
  disclaimer: string;
  tokenTransfers?: TokenTransferEvidence[];
}

export interface ArchiveRecord {
  id: string;
  createdAt: string;
  subject: string;
  chainKey: string;
  chainId: number;
  reportHash: string;
  reportVersion: string;
  label: string;
  metadataCid: string | null;
  attestation: {
    status: 'not_deployed' | 'pending' | 'confirmed' | 'failed';
    txHash: string | null;
    explorerUrl: string | null;
    contractAddress: string | null;
    chainId: number;
    submittedAt: string | null;
    error?: string;
  };
  summary: {
    txCount: number;
    counterparties: number;
    anomalyCount: number;
    netFlowWei: string;
  };
}

export interface IntelEvent {
  id: string;
  chainKey: string;
  chainId: number;
  kind: 'native_transfer' | 'contract_call' | 'contract_creation' | 'failed_tx' | 'token_transfer';
  txHash: string;
  blockNumber: number;
  timestamp: string;
  from: string;
  to: string | null;
  valueWei: string;
  valueEth: string;
  methodId: string | null;
  methodLabel: string | null;
  status: 'success' | 'failed' | 'unknown';
  explorerUrl: string | null;
}

export interface Paged<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number | null;
  hasMore: boolean;
  nextCursor: string | null;
}

export interface ApiEnvelope<T> {
  ok: boolean;
  data: T | null;
  source?: DataSourceInfo | null;
  error?: { code: string; message: string; detail?: string } | null;
  meta?: Record<string, unknown>;
}

export interface RateLimitInfo {
  limit: number;
  remaining: number;
  resetAt: string;
}
