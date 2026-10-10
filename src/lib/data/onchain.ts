import { CHAIN_META, explorerAddressUrl, explorerTxUrl, getChainMeta, type ChainKey } from '../chains';
import { getEffectiveSource, getServerConfig, type EffectiveSource, type DataLimits } from '../config';
import {
  formatEth,
  formatUnits,
  isSystemAddress,
  parseHexBig,
  parseHexInt,
  toHex,
} from '../utils';
import { describeRpcError, getRpcClient, RpcError, type RpcClient } from './rpc';
import { labelForSelector, labelTxType, selectorFor } from './method-labels';
import type { DataSourceInfo, IntelEvent, ScanCompleteness, TransactionRecord } from '../types';

// ---------------------------------------------------------------------------
// Raw JSON-RPC shapes (Arbitrum Nitro flavoured)
// ---------------------------------------------------------------------------
interface RawTx {
  hash: string;
  blockHash: string;
  blockNumber: string;
  blockTimestamp?: string;
  from: string;
  to: string | null;
  value: string;
  gas: string;
  gasPrice: string;
  input: string;
  nonce: string;
  transactionIndex: string;
  type?: string;
}

interface RawBlock {
  number: string;
  hash: string;
  parentHash: string;
  timestamp: string;
  gasUsed: string;
  gasLimit: string;
  l1BlockNumber?: string;
  transactions: RawTx[];
}

interface RawReceipt {
  transactionHash: string;
  status: string;
  gasUsed: string;
  effectiveGasPrice?: string;
  contractAddress: string | null;
  logs?: unknown[];
}

export interface ResolvedChain {
  chainKey: ChainKey;
  meta: (typeof CHAIN_META)[ChainKey];
  source: EffectiveSource;
  client: RpcClient;
  limits: DataLimits;
  label: string;
}

export function resolveChain(chainKey: string): ResolvedChain | null {
  const meta = getChainMeta(chainKey);
  if (!meta) return null;
  const key = meta.key;
  const limits = getServerConfig().limits;
  const source = getEffectiveSource(key);
  const client = getRpcClient(source.rpcUrl, limits, meta.name);
  let host = source.rpcUrl;
  try {
    host = new URL(source.rpcUrl).host;
  } catch {
    /* noop */
  }
  return { chainKey: key, meta, source, client, limits, label: `${meta.name} RPC @ ${host}` };
}

function blockTimestampToIso(hexTs: string): string {
  return new Date(parseHexInt(hexTs) * 1000).toISOString();
}

// ---------------------------------------------------------------------------
// Head
// ---------------------------------------------------------------------------
export interface ChainHead {
  latestBlock: number;
  latestBlockHash: string;
  latestBlockTimestamp: string;
  gasPriceWei: string | null;
  latencyMs: number;
}

export async function getChainHead(rc: ResolvedChain): Promise<ChainHead> {
  const started = Date.now();
  const [blockHex, gasPriceHex] = await Promise.all([
    rc.client.callCached<string>('eth_blockNumber', [], 5_000),
    rc.client.callCached<string>('eth_gasPrice', [], 5_000).catch(() => null),
  ]);
  const latest = parseHexInt(blockHex);
  const block = await rc.client.callCached<RawBlock>('eth_getBlockByNumber', [toHex(latest), false], 5_000);
  return {
    latestBlock: latest,
    latestBlockHash: block?.hash ?? '',
    latestBlockTimestamp: block ? blockTimestampToIso(block.timestamp) : new Date().toISOString(),
    gasPriceWei: gasPriceHex ? parseHexBig(gasPriceHex).toString() : null,
    latencyMs: Date.now() - started,
  };
}

// ---------------------------------------------------------------------------
// Wallet state (latest block only on this node — historical state is unavailable)
// ---------------------------------------------------------------------------
export interface WalletState {
  address: string;
  balanceWei: string | null;
  nonce: number | null;
  codeSize: number | null;
  isContract: boolean | null;
  readAtBlock: number | null;
  unavailableReason?: string;
}

export async function getWalletState(rc: ResolvedChain, address: string): Promise<WalletState> {
  const base: WalletState = {
    address,
    balanceWei: null,
    nonce: null,
    codeSize: null,
    isContract: null,
    readAtBlock: null,
  };

  try {
    const [head, balanceHex, nonceHex, code] = await Promise.all([
      rc.client.callCached<string>('eth_blockNumber', [], 5_000),
      rc.client.call<string>('eth_getBalance', [address, 'latest']),
      rc.client.call<string>('eth_getTransactionCount', [address, 'latest']),
      rc.client.call<string>('eth_getCode', [address, 'latest']),
    ]);
    const codeSize = code && code !== '0x' ? Math.max(0, (code.length - 2) / 2) : 0;
    return {
      ...base,
      balanceWei: parseHexBig(balanceHex).toString(),
      nonce: parseHexInt(nonceHex),
      codeSize,
      isContract: codeSize > 0,
      readAtBlock: parseHexInt(head),
    };
  } catch (err) {
    const d = describeRpcError(err);
    return { ...base, unavailableReason: `${d.code}: ${d.message}` };
  }
}

// ---------------------------------------------------------------------------
// Normalisation
// ---------------------------------------------------------------------------
function normaliseTx(
  raw: RawTx,
  blockTimestamp: string,
  subject: string,
  receipts: Map<string, RawReceipt>,
  rc: ResolvedChain,
): TransactionRecord {
  const from = (raw.from ?? '').toLowerCase();
  const to = raw.to ? raw.to.toLowerCase() : null;
  const subjectLower = subject.toLowerCase();
  const receipt = receipts.get(raw.hash.toLowerCase());

  const direction: TransactionRecord['direction'] =
    from === subjectLower && to === subjectLower ? 'self' : from === subjectLower ? 'out' : 'in';

  const isContractCreation = to === null;
  const selector = selectorFor(raw.input);
  const isContractInteraction = Boolean(selector);

  let status: TransactionRecord['status'] = 'unknown';
  if (receipt?.status === '0x1') status = 'success';
  else if (receipt?.status === '0x0') status = 'failed';

  const gasUsed = receipt?.gasUsed ?? null;
  const effectiveGasPrice = receipt?.effectiveGasPrice ?? null;
  const feeWei =
    gasUsed && effectiveGasPrice
      ? (parseHexBig(gasUsed) * parseHexBig(effectiveGasPrice)).toString()
      : null;

  const valueWei = parseHexBig(raw.value).toString();

  return {
    hash: raw.hash,
    blockNumber: parseHexInt(raw.blockNumber),
    blockHash: raw.blockHash,
    timestamp: blockTimestamp,
    from,
    to,
    valueWei,
    valueEth: formatUnits(valueWei, 18, 8),
    gasLimit: parseHexBig(raw.gas).toString(),
    gasPriceWei: parseHexBig(raw.gasPrice).toString(),
    gasUsed: gasUsed ? parseHexBig(gasUsed).toString() : null,
    effectiveGasPriceWei: effectiveGasPrice ? parseHexBig(effectiveGasPrice).toString() : null,
    feeWei,
    nonce: parseHexInt(raw.nonce),
    inputSize: Math.max(0, ((raw.input?.length ?? 2) - 2) / 2),
    methodId: selector,
    methodLabel: labelForSelector(raw.input),
    txType: labelTxType(raw.type),
    status,
    isContractCreation,
    isContractInteraction,
    direction,
    explorerUrl: explorerTxUrl(rc.chainKey, raw.hash),
    sourceStrategy: 'rpc-block-scan',
  };
}

function makeSource(
  rc: ResolvedChain,
  partial: Partial<DataSourceInfo> & Pick<DataSourceInfo, 'strategy' | 'completeness'>,
): DataSourceInfo {
  let host = rc.source.rpcUrl;
  try {
    host = new URL(rc.source.rpcUrl).host;
  } catch {
    /* noop */
  }
  return {
    label: rc.label,
    host,
    chainKey: rc.chainKey,
    chainId: rc.meta.id,
    fullHistoryIndex: false,
    fetchedAt: new Date().toISOString(),
    cache: 'miss',
    ...partial,
  } as DataSourceInfo;
}

// ---------------------------------------------------------------------------
// Block scanning
// ---------------------------------------------------------------------------
export interface ScanWindow {
  fromBlock: number;
  toBlock: number;
  blocksScanned: number;
}

export interface AddressScanResult {
  transactions: TransactionRecord[];
  source: DataSourceInfo;
  window: ScanWindow | null;
  truncated: boolean;
  receiptsFetched: number;
}

/**
 * Walk a bounded window of blocks backwards from the head once, keeping every
 * transaction that touches ANY address in `addresses`.
 *
 * Scanning a set in a single pass is what makes multi-hop expansion affordable:
 * expanding six counterparties costs exactly the same number of RPC calls as
 * analysing one address, instead of six times as many.
 *
 * HONESTY NOTE: this is a *bounded recent-window scan*, not a historical index.
 * Robinhood Chain produces ~10 blocks/second, so a few thousand blocks is only
 * minutes of chain time. The UI always reports the exact window, the number of
 * blocks actually read, and whether the scan completed or was cut short.
 */
export async function scanBlockWindow(
  rc: ResolvedChain,
  addresses: string[],
  options: { maxBlocks?: number; batchSize?: number; maxTransactionsPerAddress?: number; includeReceipts?: boolean } = {},
): Promise<{ byAddress: Map<string, TransactionRecord[]>; source: DataSourceInfo; window: ScanWindow | null; truncated: boolean; receiptsFetched: number }> {
  const maxBlocks = Math.min(options.maxBlocks ?? rc.limits.scanMaxBlocks, 20_000);
  const batchSize = Math.min(options.batchSize ?? rc.limits.scanBatchSize, 100);
  const maxPerAddress = options.maxTransactionsPerAddress ?? 400;
  const includeReceipts = options.includeReceipts ?? true;
  const watched = new Set(addresses.map((a) => a.toLowerCase()));

  const empty = new Map<string, TransactionRecord[]>();
  for (const a of watched) empty.set(a, []);

  let head: ChainHead;
  try {
    head = await getChainHead(rc);
  } catch (err) {
    const d = describeRpcError(err);
    return {
      byAddress: empty,
      source: makeSource(rc, { strategy: 'rpc-block-scan', completeness: 'unavailable', error: d }),
      window: null,
      truncated: false,
      receiptsFetched: 0,
    };
  }

  const toBlock = head.latestBlock;
  const fromBlock = Math.max(0, toBlock - maxBlocks + 1);
  const found: { raw: RawTx; blockTimestamp: string; matched: string[] }[] = [];
  let blocksScanned = 0;
  let scannedUpTo = toBlock;
  let stoppedEarly: { code: string; message: string } | null = null;

  for (let end = toBlock; end >= fromBlock; end -= batchSize) {
    const start = Math.max(fromBlock, end - batchSize + 1);
    const calls: { method: string; params: unknown[] }[] = [];
    for (let n = end; n >= start; n--) {
      calls.push({ method: 'eth_getBlockByNumber', params: [toHex(n), true] });
    }

    let blocks: (RawBlock | null)[];
    try {
      blocks = await rc.client.batch<RawBlock>(calls, batchSize);
    } catch (err) {
      stoppedEarly = describeRpcError(err);
      break;
    }

    let anyBlock = false;
    for (const block of blocks) {
      if (!block || !Array.isArray(block.transactions)) continue;
      anyBlock = true;
      blocksScanned++;
      scannedUpTo = parseHexInt(block.number);
      const ts = blockTimestampToIso(block.timestamp);
      for (const tx of block.transactions) {
        const from = (tx.from ?? '').toLowerCase();
        const to = tx.to ? tx.to.toLowerCase() : null;
        const matched: string[] = [];
        if (watched.has(from)) matched.push(from);
        if (to && watched.has(to) && to !== from) matched.push(to);
        if (matched.length > 0) found.push({ raw: tx, blockTimestamp: ts, matched });
      }
    }
    if (!anyBlock && blocks.every((b) => b === null)) {
      stoppedEarly = { code: 'UPSTREAM_EMPTY_BATCH', message: 'The upstream returned no block data for this range.' };
      break;
    }
    // Stop early only when every watched address has hit its own cap.
    const counts = new Map<string, number>();
    for (const f of found) for (const m of f.matched) counts.set(m, (counts.get(m) ?? 0) + 1);
    if ([...watched].every((a) => (counts.get(a) ?? 0) >= maxPerAddress)) break;
  }

  // De-duplicate per address, newest first, then apply the per-address cap.
  const byAddress = new Map<string, TransactionRecord[]>();
  const matchedTx = new Map<string, { raw: RawTx; blockTimestamp: string }[]>();
  for (const address of watched) {
    const seen = new Set<string>();
    const rows = found
      .filter((f) => f.matched.includes(address))
      .filter((f) => {
        const h = f.raw.hash.toLowerCase();
        if (seen.has(h)) return false;
        seen.add(h);
        return true;
      })
      .sort((a, b) => parseHexInt(b.raw.blockNumber) - parseHexInt(a.raw.blockNumber))
      .slice(0, maxPerAddress);
    matchedTx.set(address, rows);
  }

  // One receipt batch covers every matched hash across all watched addresses.
  const allHashes = new Map<string, RawTx>();
  for (const rows of matchedTx.values()) for (const r of rows) allHashes.set(r.raw.hash.toLowerCase(), r.raw);

  const receipts = new Map<string, RawReceipt>();
  if (includeReceipts && allHashes.size > 0) {
    try {
      const calls = [...allHashes.keys()].map((h) => ({ method: 'eth_getTransactionReceipt', params: [h] }));
      const results = await rc.client.batch<RawReceipt>(calls, Math.min(batchSize * 2, 100));
      for (const r of results) {
        if (r && r.transactionHash) receipts.set(r.transactionHash.toLowerCase(), r);
      }
    } catch {
      // Receipts are enrichment only — a failure here degrades status fields,
      // it does not invalidate the transaction rows.
    }
  }

  for (const [address, rows] of matchedTx) {
    const subjectForRow = addresses.find((a) => a.toLowerCase() === address) ?? address;
    byAddress.set(
      address,
      rows.map((r) => normaliseTx(r.raw, r.blockTimestamp, subjectForRow, receipts, rc)),
    );
  }

  const totalMatched = [...matchedTx.values()].reduce((acc, r) => acc + r.length, 0);
  const completeness: ScanCompleteness = stoppedEarly ? (blocksScanned > 0 ? 'partial' : 'unavailable') : 'complete';

  const limitation = stoppedEarly
    ? `Scan stopped after ${blocksScanned.toLocaleString('en-US')} of ${maxBlocks.toLocaleString('en-US')} requested blocks: ${stoppedEarly.message}`
    : `Bounded recent-window scan only — ${blocksScanned.toLocaleString('en-US')} blocks (≈ ${Math.round(blocksScanned / (rc.meta.blocksPerSecond ?? 1) / 60)} min of chain time) were read. This is NOT a complete historical index; transactions older than block ${fromBlock.toLocaleString('en-US')} are not covered.`;

  return {
    byAddress,
    source: makeSource(rc, {
      strategy: 'rpc-block-scan',
      completeness,
      fromBlock: Math.max(fromBlock, scannedUpTo - blocksScanned + 1),
      toBlock,
      blocksScanned,
      latestSyncedBlock: head.latestBlock,
      latestBlockTimestamp: head.latestBlockTimestamp,
      limitation: `${limitation}${totalMatched > 0 ? ` ${totalMatched} matching transaction(s) captured across ${watched.size} watched address(es).` : ''}`,
      error: stoppedEarly ?? undefined,
    }),
    window: { fromBlock, toBlock, blocksScanned },
    truncated: Boolean(stoppedEarly),
    receiptsFetched: receipts.size,
  };
}

/** Single-address convenience wrapper. */
export async function scanAddressTransactions(
  rc: ResolvedChain,
  address: string,
  options: { maxBlocks?: number; batchSize?: number; maxTransactions?: number; includeReceipts?: boolean } = {},
): Promise<AddressScanResult> {
  const result = await scanBlockWindow(rc, [address], {
    maxBlocks: options.maxBlocks,
    batchSize: options.batchSize,
    maxTransactionsPerAddress: options.maxTransactions,
    includeReceipts: options.includeReceipts,
  });
  const transactions = result.byAddress.get(address.toLowerCase()) ?? [];
  return {
    transactions,
    source: result.source,
    window: result.window,
    truncated: result.truncated,
    receiptsFetched: result.receiptsFetched,
  };
}

// ---------------------------------------------------------------------------
// Recent chain activity (for the INTEL feed and the home LIVE INTELLIGENCE FEED)
// ---------------------------------------------------------------------------
export interface RecentActivityResult {
  events: IntelEvent[];
  source: DataSourceInfo;
}

export async function getRecentActivity(
  rc: ResolvedChain,
  options: { blocks?: number; limit?: number; batchSize?: number } = {},
): Promise<RecentActivityResult> {
  const blocks = Math.min(options.blocks ?? 30, 500);
  const limit = options.limit ?? 60;
  const batchSize = Math.min(options.batchSize ?? rc.limits.scanBatchSize, 60);

  let head: ChainHead;
  try {
    head = await getChainHead(rc);
  } catch (err) {
    const d = describeRpcError(err);
    return {
      events: [],
      source: makeSource(rc, { strategy: 'rpc-block-scan', completeness: 'unavailable', error: d }),
    };
  }

  const fromBlock = Math.max(0, head.latestBlock - blocks + 1);
  const events: IntelEvent[] = [];
  let blocksScanned = 0;
  let stoppedEarly: { code: string; message: string } | null = null;

  for (let end = head.latestBlock; end >= fromBlock; end -= batchSize) {
    const start = Math.max(fromBlock, end - batchSize + 1);
    const calls: { method: string; params: unknown[] }[] = [];
    for (let n = end; n >= start; n--) calls.push({ method: 'eth_getBlockByNumber', params: [toHex(n), true] });
    let result: (RawBlock | null)[];
    try {
      result = await rc.client.batch<RawBlock>(calls, batchSize);
    } catch (err) {
      stoppedEarly = describeRpcError(err);
      break;
    }
    for (const block of result) {
      if (!block || !Array.isArray(block.transactions)) continue;
      blocksScanned++;
      const iso = blockTimestampToIso(block.timestamp);
      const bn = parseHexInt(block.number);
      for (const tx of block.transactions) {
        const selector = selectorFor(tx.input);
        const to = tx.to ? tx.to.toLowerCase() : null;
        const valueWei = parseHexBig(tx.value).toString();
        const failed = false; // receipts are not fetched for the feed — status stays 'unknown'
        events.push({
          id: `${tx.hash}`,
          chainKey: rc.chainKey,
          chainId: rc.meta.id,
          kind: to === null ? 'contract_creation' : selector ? 'contract_call' : 'native_transfer',
          txHash: tx.hash,
          blockNumber: bn,
          timestamp: iso,
          from: (tx.from ?? '').toLowerCase(),
          to,
          valueWei,
          valueEth: formatEth(valueWei),
          methodId: selector,
          methodLabel: labelForSelector(tx.input),
          status: failed ? 'failed' : 'unknown',
          explorerUrl: explorerTxUrl(rc.chainKey, tx.hash),
        });
      }
    }
    if (events.length >= limit * 3) break;
  }

  events.sort((a, b) => b.blockNumber - a.blockNumber);

  const completeness: ScanCompleteness = stoppedEarly ? (blocksScanned > 0 ? 'partial' : 'unavailable') : 'complete';

  return {
    events: events.slice(0, limit),
    source: makeSource(rc, {
      strategy: 'rpc-block-scan',
      completeness,
      fromBlock: Math.max(fromBlock, head.latestBlock - blocksScanned + 1),
      toBlock: head.latestBlock,
      blocksScanned,
      latestSyncedBlock: head.latestBlock,
      latestBlockTimestamp: head.latestBlockTimestamp,
      limitation: stoppedEarly
        ? `Feed scan stopped early: ${stoppedEarly.message}`
        : `Showing the most recent ${blocksScanned} blocks. Transaction receipts are not fetched for the feed, so confirmation status is reported as UNKNOWN rather than guessed.`,
      error: stoppedEarly ?? undefined,
    }),
  };
}

// ---------------------------------------------------------------------------
// Logs (fast, wide discovery for token movements)
// ---------------------------------------------------------------------------
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

export interface TokenTransferLog {
  address: string;
  blockNumber: number;
  txHash: string;
  from: string;
  to: string;
  token: string;
  logIndex: number;
  amountRaw: string | null;
  standard: 'erc20' | 'erc721' | 'unknown';
  timestamp: string | null;
  decimals?: number | null;
  symbol?: string | null;
}

interface RawLog {
  address: string;
  blockNumber: string;
  transactionHash: string;
  logIndex: string;
  topics: string[];
  data?: string;
}

function topicToAddress(topic: string): string {
  return `0x${topic.slice(-40)}`.toLowerCase();
}

/**
 * ERC-20/721 Transfer events involving `address`, read straight from logs.
 * This is far cheaper than a block scan and covers a much wider block range,
 * which is why the analysis engine uses both strategies and labels each row
 * with the strategy that produced it.
 */
export async function getTransferLogs(
  rc: ResolvedChain,
  address: string,
  options: { lookbackBlocks?: number } = {},
): Promise<{ logs: TokenTransferLog[]; source: DataSourceInfo }> {
  const lookback = Math.min(options.lookbackBlocks ?? 30_000, rc.meta.capabilities.logsRangeLimit ?? 30_000);
  const padded = `0x${'0'.repeat(24)}${address.toLowerCase().slice(2)}`;

  let head: ChainHead;
  try {
    head = await getChainHead(rc);
  } catch (err) {
    const d = describeRpcError(err);
    return { logs: [], source: makeSource(rc, { strategy: 'rpc-logs', completeness: 'unavailable', error: d }) };
  }

  const fromBlock = Math.max(0, head.latestBlock - lookback + 1);
  const collected: TokenTransferLog[] = [];
  let error: { code: string; message: string } | null = null;

  const queries = [
    { fromBlock: toHex(fromBlock), toBlock: toHex(head.latestBlock), topics: [TRANSFER_TOPIC, padded] },
    { fromBlock: toHex(fromBlock), toBlock: toHex(head.latestBlock), topics: [TRANSFER_TOPIC, null, padded] },
  ];

  for (const q of queries) {
    try {
      const logs = await rc.client.call<RawLog[]>('eth_getLogs', [q]);
      for (const l of logs) {
        if (!Array.isArray(l.topics) || l.topics.length < 3) continue;
        collected.push({
          address: l.address.toLowerCase(),
          blockNumber: parseHexInt(l.blockNumber),
          txHash: l.transactionHash,
          from: topicToAddress(l.topics[1]),
          to: topicToAddress(l.topics[2]),
          token: l.address.toLowerCase(),
          logIndex: parseHexInt(l.logIndex),
          amountRaw: l.topics.length === 3 && l.data ? parseHexBig(l.data).toString() : null,
          standard: l.topics.length === 3 ? 'erc20' : l.topics.length >= 4 ? 'erc721' : 'unknown',
          timestamp: null,
        });
      }
    } catch (err) {
      error = describeRpcError(err);
      break;
    }
  }

  const seen = new Set<string>();
  const logs = collected.filter((l) => {
    const key = `${l.txHash}:${l.logIndex}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Fetch timestamps only for the bounded evidence set. The block number is
  // always preserved even when this enrichment is unavailable.
  const uniqueBlocks = [...new Set(logs.slice(0, 500).map((l) => l.blockNumber))];
  if (uniqueBlocks.length > 0) {
    try {
      const blocks = await rc.client.batch<RawBlock>(
        uniqueBlocks.map((block) => ({ method: 'eth_getBlockByNumber', params: [toHex(block), false] })),
        Math.min(rc.limits.scanBatchSize, 80),
      );
      const timestamps = new Map<number, string>();
      for (const block of blocks) if (block?.number && block.timestamp) timestamps.set(parseHexInt(block.number), blockTimestampToIso(block.timestamp));
      for (const log of logs) log.timestamp = timestamps.get(log.blockNumber) ?? null;
    } catch {
      // Timestamp enrichment is optional; hashes and block numbers remain verifiable.
    }
  }

  return {
    logs,
    source: makeSource(rc, {
      strategy: 'rpc-logs',
      completeness: error ? (logs.length > 0 ? 'partial' : 'unavailable') : 'complete',
      fromBlock,
      toBlock: head.latestBlock,
      latestSyncedBlock: head.latestBlock,
      latestBlockTimestamp: head.latestBlockTimestamp,
      limitation: error
        ? `Log query failed: ${error.message}`
        : `Transfer logs cover the last ${lookback.toLocaleString('en-US')} blocks. Only ERC-20/721 Transfer events are captured here; native value transfers come from the block scan.`,
      error: error ?? undefined,
    }),
  };
}

// ---------------------------------------------------------------------------
// Helpers exposed to the UI layer
// ---------------------------------------------------------------------------
export function addressExplorerLink(chainKey: string, address: string): string | null {
  return explorerAddressUrl(chainKey, address);
}

export function isSystemAddressLike(address: string | null | undefined): boolean {
  return isSystemAddress(address);
}

export function describeRpcFailure(err: unknown) {
  return describeRpcError(err);
}

export { RpcError };
