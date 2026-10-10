import { getServerConfig } from '../config';
import { clamp, formatUnits } from '../utils';
import { generateAiReport, AI_POLICY } from '../ai/llm';
import {
  buildGraph,
  computeCounterparties,
  computeReportHash,
  computeStats,
  REPORT_VERSION,
} from './deterministic';
import {
  getTransferLogs,
  getWalletState,
  resolveChain,
  scanAddressTransactions,
  scanBlockWindow,
  type ResolvedChain,
} from '../data/onchain';
import type { AnalysisReport, ApiEnvelope, DataSourceInfo, TokenTransferEvidence, TransactionRecord, WalletProfile } from '../types';
import { getBlockscoutAddressHistory } from '../data/blockscout';

export const ANALYSIS_DISCLAIMER =
  'This report is derived exclusively from public on-chain data read at the block heights listed under Data Sources. Relationship confidence describes the strength of the observed transaction pattern, not the identity of any person or organisation. A funds-flow relationship does not establish common ownership or control. Coverage is limited to the block window stated; nothing outside that window was examined. No part of this report is financial advice.';

export interface RunAnalysisOptions {
  maxBlocks?: number;
  batchSize?: number;
  maxTransactions?: number;
  includeAi?: boolean;
  logLookbackBlocks?: number;
  /**
   * Graph depth. 1 = the subject and its direct counterparties. 2 or 3 also
   * expands the most active counterparties so that counterparty-to-counterparty
   * edges appear. Expansion reuses the SAME block window and a single block
   * pass, so it does not multiply RPC load — but it necessarily only sees
   * indirect relationships that fall inside that window.
   */
  hops?: 1 | 2 | 3;
  /** How many of the top counterparties to expand when hops > 1. */
  expandTopK?: number;
}

export interface RunAnalysisResult {
  report: AnalysisReport | null;
  sources: DataSourceInfo[];
  error: { code: string; message: string; detail?: string } | null;
}

function deriveProfile(
  state: Awaited<ReturnType<typeof getWalletState>>,
  chainKey: string,
  chainId: number,
): WalletProfile {
  return {
    address: state.address,
    chainKey,
    chainId,
    balanceWei: state.balanceWei,
    balanceEth: state.balanceWei !== null ? formatUnits(state.balanceWei, 18, 8) : null,
    nonce: state.nonce,
    isContract: state.isContract,
    codeSize: state.codeSize,
    stateReadAtBlock: state.readAtBlock,
    stateUnavailableReason: state.unavailableReason,
  };
}

export async function runAnalysis(
  chainKeyInput: string,
  address: string,
  options: RunAnalysisOptions = {},
): Promise<RunAnalysisResult> {
  const subject = address.toLowerCase();
  const rc: ResolvedChain | null = resolveChain(chainKeyInput);
  if (!rc) {
    return {
      report: null,
      sources: [],
      error: { code: 'UNSUPPORTED_CHAIN', message: `Chain "${chainKeyInput}" is not in the supported set for this deployment.` },
    };
  }

  const limits = getServerConfig().limits;
  const sources: DataSourceInfo[] = [];

  // 1. State + block scan + log scan, in parallel (each has its own backoff).
  const [state, scan, logs, indexed] = await Promise.all([
    getWalletState(rc, subject),
    scanAddressTransactions(rc, subject, {
      maxBlocks: options.maxBlocks ?? limits.scanMaxBlocks,
      batchSize: options.batchSize ?? limits.scanBatchSize,
      maxTransactions: options.maxTransactions ?? 400,
      includeReceipts: true,
    }),
    getTransferLogs(rc, subject, { lookbackBlocks: options.logLookbackBlocks ?? 30_000 }),
    getBlockscoutAddressHistory(rc, subject, options.maxTransactions ?? 400),
  ]);

  if (indexed) sources.push(indexed.source);
  sources.push(scan.source);
  if (logs.source.completeness !== 'unavailable') sources.push(logs.source);
  sources.push({
    label: rc.label,
    host: scan.source.host,
    strategy: 'rpc-state',
    chainKey: rc.chainKey,
    chainId: rc.meta.id,
    fullHistoryIndex: false,
    latestSyncedBlock: state.readAtBlock ?? undefined,
    fetchedAt: new Date().toISOString(),
    cache: 'miss',
    completeness: state.unavailableReason ? 'unavailable' : 'complete',
    limitation:
      'Balance, nonce and code are read at the latest block. This node does not serve historical state, so these values cannot be reconstructed for a past block height.',
    error: state.unavailableReason ? { code: 'STATE_UNAVAILABLE', message: state.unavailableReason } : undefined,
  });

  const transactions: TransactionRecord[] = indexed?.transactions.length ? indexed.transactions : scan.transactions;
  const transferLogs = indexed?.transfers.length ? indexed.transfers : logs.logs;

  const hardFailure =
    transactions.length === 0 &&
    sources.every((s) => s.completeness === 'unavailable');
  if (hardFailure) {
    return {
      report: null,
      sources,
      error: {
        code: 'UPSTREAM_UNAVAILABLE',
        message:
          'No chain data could be read for this request. The configured RPC endpoint did not return block data. See the source list for the upstream error.',
        detail: scan.source.error?.message ?? logs.source.error?.message,
      },
    };
  }

  // 2. Counterparties (block-scan rows, enriched with contract hits from logs).
  const contractHits = new Set<string>();
  for (const l of transferLogs) {
    contractHits.add(l.token);
  }
  for (const tx of transactions) if (tx.to && tx.isContractInteraction) contractHits.add(tx.to);
  contractHits.delete(subject);

  const counterparties = computeCounterparties(transactions, subject, { knownContracts: contractHits });

  // 3. Multi-hop expansion (optional).
  const hops = options.hops ?? 1;
  let graph = buildGraph(subject, counterparties, transactions, { maxNodes: 60 });

  if (hops > 1 && counterparties.length > 0) {
    const expandK = Math.min(options.expandTopK ?? (hops === 2 ? 6 : 10), counterparties.length);
    const targets = counterparties.slice(0, expandK).map((c) => c.address);
    const watched = [subject, ...targets];

    const expansion = await scanBlockWindow(rc, watched, {
      maxBlocks: options.maxBlocks ?? limits.scanMaxBlocks,
      batchSize: options.batchSize ?? limits.scanBatchSize,
      maxTransactionsPerAddress: 150,
      includeReceipts: false,
    });

    sources.push({
      ...expansion.source,
      strategy: 'rpc-block-scan',
      limitation: `${expansion.source.limitation ?? ''} Multi-hop expansion re-read the same window while watching ${watched.length} addresses (the subject plus the ${expandK} most active counterparties). Only relationships inside this window are discoverable — an indirect link that happened outside it will not appear.`,
    });

    const watchedSet = new Set(watched);
    type Pair = {
      a: string;
      b: string;
      count: number;
      volume: bigint;
      hashes: string[];
      first: string;
      last: string;
      forward: boolean;
      backward: boolean;
    };
    const pairs = new Map<string, Pair>();

    for (const [owner, rows] of expansion.byAddress) {
      if (owner === subject) continue; // subject edges already exist
      for (const t of rows) {
        const other = t.direction === 'in' ? t.from : t.to;
        if (!other || !watchedSet.has(other) || other === owner) continue;
        const [a, b] = owner < other ? [owner, other] : [other, owner];
        const key = `${a}|${b}`;
        const volume = BigInt(t.valueWei || '0');
        let entry = pairs.get(key);
        if (!entry) {
          entry = { a, b, count: 0, volume: 0n, hashes: [], first: t.timestamp, last: t.timestamp, forward: false, backward: false };
          pairs.set(key, entry);
        }
        entry.count++;
        entry.volume += volume;
        if (entry.hashes.length < 4) entry.hashes.push(t.hash);
        if (t.timestamp < entry.first) entry.first = t.timestamp;
        if (t.timestamp > entry.last) entry.last = t.timestamp;
        // Record the actual direction of travel between a and b.
        if (t.from === a && t.to === b) entry.forward = true;
        if (t.from === b && t.to === a) entry.backward = true;
      }
    }

    const existingEdgeKeys = new Set(
      graph.edges.flatMap((e) => [`${e.source}|${e.target}`, `${e.target}|${e.source}`]),
    );
    const existingNodeIds = new Set(graph.nodes.map((n) => n.id));

    for (const p of pairs.values()) {
      if (existingEdgeKeys.has(`${p.a}|${p.b}`)) continue;
      const bidirectional = p.forward && p.backward;
      const confidence = clamp(0.18 + Math.min(p.count, 8) * 0.055 + (bidirectional ? 0.14 : 0), 0.05, 0.8);
      graph.edges.push({
        id: `${p.a}~${p.b}`,
        source: p.a,
        target: p.b,
        txCount: p.count,
        volumeWei: p.volume.toString(),
        direction: bidirectional ? 'both' : p.forward ? 'out' : 'in',
        firstSeenAt: p.first,
        lastSeenAt: p.last,
        sampleTxHashes: p.hashes,
        confidence: Number(confidence.toFixed(3)),
        basis: [
          `Discovered by multi-hop expansion: ${p.count} transaction${p.count === 1 ? '' : 's'} between two addresses that are both connected to the subject.`,
          bidirectional
            ? 'Value moves in both directions between these two addresses.'
            : 'Value was observed moving in one direction only inside the scanned window.',
          `Confidence is lower than a direct edge because this relationship is inferred from the shared scan window (${expansion.source.blocksScanned ?? 0} blocks) rather than a dedicated scan.`,
        ],
      });

      for (const addr of [p.a, p.b]) {
        if (existingNodeIds.has(addr)) continue;
        const isContract = contractHits.has(addr);
        graph.nodes.push({
          id: addr,
          address: addr,
          label: isContract ? 'CONTRACT' : 'COUNTERPARTY',
          kind: isContract ? 'contract' : 'counterparty',
          depth: 2,
          txCount: p.count,
          volumeWei: p.volume.toString(),
          isContract: isContract ? true : null,
          riskScore: 0.12,
          flags: ['HOP-2'],
        });
        existingNodeIds.add(addr);
      }
    }
  }

  // 4. Deterministic statistics (subject-scoped only).
  const profile = deriveProfile(state, rc.chainKey, rc.meta.id);
  const stats = computeStats(profile, transactions, counterparties);
  const reportHash = computeReportHash({ subject, chainId: rc.meta.id, transactions });

  // 5. AI narrative (only over the structured stats, never over raw chain data).
  const ai =
    options.includeAi === false
      ? {
          status: 'not_configured' as const,
          model: null,
          generatedAt: new Date().toISOString(),
          summary: null,
          findings: [],
          riskNotes: [],
          timeline: [],
          limitations: ['AI narration was disabled for this request.'],
          policy: AI_POLICY,
        }
      : await generateAiReport({ stats, sources, transactions });

  const report: AnalysisReport = {
    id: reportHash.slice(2, 18),
    subject,
    chainKey: rc.chainKey,
    chainId: rc.meta.id,
    createdAt: new Date().toISOString(),
    reportHash,
    reportVersion: REPORT_VERSION,
    dataSources: sources,
    stats,
    graph,
    ai,
    transactions,
    transactionPage: { returned: transactions.length, totalObserved: transactions.length },
    disclaimer: ANALYSIS_DISCLAIMER,
    tokenTransfers: transferLogs.map((log): TokenTransferEvidence => ({
      tokenAddress: log.token,
      transactionHash: log.txHash,
      logIndex: log.logIndex,
      direction: log.to === subject ? 'in' : 'out',
      counterparty: log.to === subject ? log.from : log.to,
      amountRaw: log.amountRaw,
      decimals: log.decimals ?? null,
      symbol: log.symbol ?? null,
      standard: log.standard,
      blockNumber: log.blockNumber,
      timestamp: log.timestamp,
    })),
  };

  return { report, sources, error: null };
}

export function envelope<T>(data: T | null, extra: Partial<ApiEnvelope<T>> = {}): ApiEnvelope<T> {
  return {
    ok: extra.error ? false : true,
    data,
    source: extra.source ?? null,
    error: extra.error ?? null,
    meta: extra.meta,
  };
}
