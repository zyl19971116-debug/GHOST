import { createHash } from 'node:crypto';
import {
  clamp,
  formatUnits,
  isSystemAddress,
  safeBigInt,
} from '../utils';
import type {
  AnomalyFlag,
  CounterpartyStat,
  DeterministicStats,
  FlowBreakdown,
  RelationshipEdge,
  RelationshipNode,
  TransactionRecord,
  WalletProfile,
} from '../types';

export const REPORT_VERSION = 'gp-1.0.0';

// ---------------------------------------------------------------------------
// Small helpers — all deterministic, no randomness anywhere.
// ---------------------------------------------------------------------------
function sumWei(values: string[]): bigint {
  let total = 0n;
  for (const v of values) total += safeBigInt(v);
  return total;
}

/** Confidence grows with the number of observations, capped below certainty. */
function confidenceFrom(count: number, base = 0.32, step = 0.07, cap = 0.95): number {
  return clamp(Number((base + step * count).toFixed(3)), 0, cap);
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function hourBucket(iso: string): string {
  const d = new Date(iso);
  d.setUTCMinutes(0, 0, 0);
  return d.toISOString();
}

function isRoundNumber(wei: bigint): boolean {
  if (wei === 0n) return false;
  // 0.01 ETH = 1e16 wei and above, and an exact multiple of it.
  const unit = 10n ** 16n;
  return wei % unit === 0n && wei >= unit;
}

// ---------------------------------------------------------------------------
// Flow
// ---------------------------------------------------------------------------
export function computeFlow(transactions: TransactionRecord[], subject: string): FlowBreakdown {
  const s = subject.toLowerCase();
  const inbound = transactions.filter((t) => t.direction === 'in');
  const outbound = transactions.filter((t) => t.direction === 'out');
  const self = transactions.filter((t) => t.direction === 'self');

  const inboundVolume = sumWei(inbound.map((t) => t.valueWei));
  const outboundVolume = sumWei(outbound.map((t) => t.valueWei));
  const totalFees = sumWei(transactions.map((t) => t.feeWei ?? '0'));

  const counterparties = new Set<string>();
  for (const t of transactions) {
    const other = t.direction === 'in' ? t.from : t.to;
    if (other && other !== s && !isSystemAddress(other)) counterparties.add(other);
  }

  const successCount = transactions.filter((t) => t.status === 'success').length;
  const knownStatus = transactions.filter((t) => t.status !== 'unknown').length;
  const failedCount = transactions.filter((t) => t.status === 'failed').length;

  const timestamps = transactions.map((t) => new Date(t.timestamp).getTime()).filter((n) => Number.isFinite(n));
  const firstMs = timestamps.length ? Math.min(...timestamps) : null;
  const lastMs = timestamps.length ? Math.max(...timestamps) : null;

  const buckets = new Map<string, number>();
  for (const t of transactions) {
    const k = hourBucket(t.timestamp);
    buckets.set(k, (buckets.get(k) ?? 0) + 1);
  }
  let busiestHourISO: string | null = null;
  let busiestHourTxCount = 0;
  for (const [k, v] of buckets) {
    if (v > busiestHourTxCount) {
      busiestHourTxCount = v;
      busiestHourISO = k;
    }
  }

  const spanHours = firstMs !== null && lastMs !== null ? Math.max((lastMs - firstMs) / 3_600_000, 1 / 60) : 1;

  return {
    inboundTxCount: inbound.length,
    outboundTxCount: outbound.length,
    selfTxCount: self.length,
    inboundVolumeWei: inboundVolume.toString(),
    outboundVolumeWei: outboundVolume.toString(),
    netFlowWei: (inboundVolume - outboundVolume).toString(),
    totalFeesWei: totalFees.toString(),
    uniqueCounterparties: counterparties.size,
    contractInteractions: transactions.filter((t) => t.isContractInteraction && !t.isContractCreation).length,
    contractCreations: transactions.filter((t) => t.isContractCreation).length,
    failedTxCount: failedCount,
    successRate: knownStatus > 0 ? Number((successCount / knownStatus).toFixed(4)) : 0,
    firstActivityAt: firstMs !== null ? new Date(firstMs).toISOString() : null,
    lastActivityAt: lastMs !== null ? new Date(lastMs).toISOString() : null,
    activeBlocks: new Set(transactions.map((t) => t.blockNumber)).size,
    txPerHour: Number((transactions.length / spanHours).toFixed(3)),
    busiestHourISO,
    busiestHourTxCount,
  };
}

// ---------------------------------------------------------------------------
// Counterparties
// ---------------------------------------------------------------------------
export interface CounterpartyOptions {
  /** Extra known-contract addresses harvested from logs. */
  knownContracts?: Set<string>;
}

/**
 * One row per address the subject actually exchanged value or calldata with.
 *
 * Direction convention: `inbound*` / `volumeInWei` describe value flowing INTO
 * the subject FROM this counterparty, and `outbound*` / `volumeOutWei` describe
 * value the subject sent OUT to it. This matches `computeFlow`'s subject-centric
 * inbound/outbound and `buildGraph`'s edge direction, and it is what the report
 * table's IN / OUT columns mean.
 *
 * Rows are ranked by descending transaction count (the report labels this
 * "highest activity"), ties broken on ascending address so the order is stable.
 */
export function computeCounterparties(
  transactions: TransactionRecord[],
  subject: string,
  options: CounterpartyOptions = {},
): CounterpartyStat[] {
  const s = subject.toLowerCase();
  const map = new Map<string, CounterpartyStat>();

  for (const t of transactions) {
    const other = t.direction === 'in' ? t.from : t.direction === 'out' ? t.to : t.to ?? t.from;
    if (!other) continue;
    const addr = other.toLowerCase();
    if (addr === s) continue;
    if (isSystemAddress(addr)) continue;

    let entry = map.get(addr);
    if (!entry) {
      entry = {
        address: addr,
        isContract:
          options.knownContracts?.has(addr) ?? (t.isContractInteraction || t.isContractCreation ? true : null),
        txCount: 0,
        inboundCount: 0,
        outboundCount: 0,
        volumeInWei: '0',
        volumeOutWei: '0',
        firstSeenBlock: t.blockNumber,
        lastSeenBlock: t.blockNumber,
        firstSeenAt: t.timestamp,
        lastSeenAt: t.timestamp,
        share: 0,
        sampleTxHashes: [],
      };
      map.set(addr, entry);
    }

    // A single observed contract call is real evidence this address is a
    // contract, even if the first row we saw merely moved native value.
    if (t.isContractInteraction || t.isContractCreation) entry.isContract = true;

    entry.txCount++;
    if (t.direction === 'in') {
      entry.inboundCount++;
      entry.volumeInWei = (safeBigInt(entry.volumeInWei) + safeBigInt(t.valueWei)).toString();
    } else if (t.direction === 'out') {
      entry.outboundCount++;
      entry.volumeOutWei = (safeBigInt(entry.volumeOutWei) + safeBigInt(t.valueWei)).toString();
    }
    if (t.blockNumber < entry.firstSeenBlock) {
      entry.firstSeenBlock = t.blockNumber;
      entry.firstSeenAt = t.timestamp;
    }
    if (t.blockNumber > entry.lastSeenBlock) {
      entry.lastSeenBlock = t.blockNumber;
      entry.lastSeenAt = t.timestamp;
    }
    if (entry.sampleTxHashes.length < 4) entry.sampleTxHashes.push(t.hash);
  }

  const total = transactions.length || 1;
  const list = [...map.values()];
  for (const entry of list) entry.share = Number((entry.txCount / total).toFixed(4));
  list.sort((a, b) => b.txCount - a.txCount || a.address.localeCompare(b.address));
  return list;
}

// ---------------------------------------------------------------------------
// Graph construction
// ---------------------------------------------------------------------------
export function buildGraph(
  subject: string,
  counterparties: CounterpartyStat[],
  transactions: TransactionRecord[],
  options: { maxNodes?: number; minConfidence?: number } = {},
): { nodes: RelationshipNode[]; edges: RelationshipEdge[] } {
  const maxNodes = options.maxNodes ?? 60;
  const s = subject.toLowerCase();
  const subjectTxCount = transactions.length;

  const nodes: RelationshipNode[] = [
    {
      id: s,
      address: s,
      label: 'SUBJECT',
      kind: 'subject',
      depth: 0,
      txCount: subjectTxCount,
      volumeWei: sumWei(transactions.map((t) => t.valueWei)).toString(),
      isContract: null,
      riskScore: 0,
      flags: [],
    },
  ];

  const edges: RelationshipEdge[] = [];
  // `maxNodes` bounds the whole graph, and the subject always occupies one slot,
  // so only `maxNodes - 1` counterparties may be drawn.
  const top = counterparties.slice(0, Math.max(0, maxNodes - 1));

  for (const cp of top) {
    const related = transactions.filter(
      (t) => t.from === cp.address || t.to === cp.address,
    );
    const direction: RelationshipEdge['direction'] =
      cp.inboundCount > 0 && cp.outboundCount > 0 ? 'both' : cp.inboundCount > 0 ? 'in' : 'out';

    const basis: string[] = [
      `${cp.txCount} transaction${cp.txCount === 1 ? '' : 's'} observed between the two addresses in the scanned window.`,
    ];
    if (cp.inboundCount > 0 && cp.outboundCount > 0) {
      basis.push(
        `Value moves in both directions (${cp.inboundCount} in / ${cp.outboundCount} out), which is stronger evidence of a recurring relationship than one-way flow.`,
      );
    }
    const spanBlocks = Math.max(1, cp.lastSeenBlock - cp.firstSeenBlock);
    if (cp.txCount >= 3 && spanBlocks > 0) {
      basis.push(
        `Activity is spread across ${spanBlocks} blocks rather than clustered in a single block.`,
      );
    }

    // Confidence: frequency, bidirectionality, and recency spread.
    let conf = 0.25;
    conf += Math.min(cp.txCount, 10) * 0.055;
    if (direction === 'both') conf += 0.12;
    if (spanBlocks > 10) conf += 0.08;
    const confidence = clamp(Number(conf.toFixed(3)), 0.05, 0.92);

    edges.push({
      id: `${s}->${cp.address}`,
      source: s,
      target: cp.address,
      txCount: cp.txCount,
      volumeWei: (safeBigInt(cp.volumeInWei) + safeBigInt(cp.volumeOutWei)).toString(),
      direction,
      firstSeenAt: cp.firstSeenAt,
      lastSeenAt: cp.lastSeenAt,
      sampleTxHashes: cp.sampleTxHashes,
      confidence,
      basis,
    });

    const flags: string[] = [];
    if (cp.share >= 0.5) flags.push('DOMINANT_COUNTERPARTY');
    if (cp.isContract) flags.push('CONTRACT');
    if (direction === 'both') flags.push('BIDIRECTIONAL');

    let risk = 0;
    if (cp.share >= 0.5) risk += 0.4;
    if (cp.isContract) risk += 0.1;
    if (cp.txCount >= 10) risk += 0.15;
    if (direction === 'both' && cp.txCount >= 5) risk += 0.15;

    nodes.push({
      id: cp.address,
      address: cp.address,
      label: cp.isContract ? 'CONTRACT' : 'COUNTERPARTY',
      kind: cp.isContract ? 'contract' : 'counterparty',
      depth: 1,
      txCount: cp.txCount,
      volumeWei: (safeBigInt(cp.volumeInWei) + safeBigInt(cp.volumeOutWei)).toString(),
      isContract: cp.isContract,
      riskScore: clamp(Number(risk.toFixed(3)), 0, 1),
      flags,
    });
  }

  return { nodes, edges };
}

// ---------------------------------------------------------------------------
// Anomaly detection — every flag states its evidence and its own confidence.
// ---------------------------------------------------------------------------
export function detectAnomalies(
  transactions: TransactionRecord[],
  flow: FlowBreakdown,
  counterparties: CounterpartyStat[],
): AnomalyFlag[] {
  const flags: AnomalyFlag[] = [];
  if (transactions.length === 0) return flags;

  // 1. High-frequency burst
  const buckets = new Map<string, { count: number; hashes: string[]; volume: bigint }>();
  for (const t of transactions) {
    const k = hourBucket(t.timestamp);
    const b = buckets.get(k) ?? { count: 0, hashes: [], volume: 0n };
    b.count++;
    b.volume += safeBigInt(t.valueWei);
    if (b.hashes.length < 5) b.hashes.push(t.hash);
    buckets.set(k, b);
  }
  const counts = [...buckets.values()].map((b) => b.count);
  const med = median(counts);
  const busiest = [...buckets.entries()].sort((a, b) => b[1].count - a[1].count)[0];
  if (busiest && busiest[1].count >= 5 && busiest[1].count >= Math.max(3, med * 3)) {
    flags.push({
      id: 'high_frequency_burst',
      kind: 'high_frequency_burst',
      severity: busiest[1].count >= 20 ? 'high' : busiest[1].count >= 10 ? 'medium' : 'low',
      title: 'Activity burst detected',
      detail: `${busiest[1].count} transactions were observed inside the single hour beginning ${busiest[0]}, against a median of ${med} per active hour across the scanned window. A burst is a pattern, not a conclusion — it can equally come from legitimate automation, a claim window, or an airdrop.`,
      evidence: [
        { label: 'Transactions in busiest hour', value: String(busiest[1].count) },
        { label: 'Median per active hour', value: String(med) },
        { label: 'Busiest hour (UTC)', value: busiest[0] },
        { label: 'Value moved in that hour', value: `${formatUnits(busiest[1].volume, 18, 6)} ETH` },
      ],
      sampleTxHashes: busiest[1].hashes,
      confidence: confidenceFrom(busiest[1].count, 0.35, 0.045),
    });
  }

  // 2. Round-number outbound transfers
  const outbound = transactions.filter((t) => t.direction === 'out' && safeBigInt(t.valueWei) > 0n);
  const round = outbound.filter((t) => isRoundNumber(safeBigInt(t.valueWei)));
  if (outbound.length >= 3 && round.length >= 3 && round.length / outbound.length >= 0.6) {
    flags.push({
      id: 'round_number_transfers',
      kind: 'round_number_transfers',
      severity: 'medium',
      title: 'Round-number value transfers',
      detail: `${round.length} of ${outbound.length} outbound native transfers are exact multiples of 0.01 ETH. Round amounts are common in manual transfers, exchange withdrawals and OTC settlements; on their own they are weak evidence and are reported as a pattern only.`,
      evidence: [
        { label: 'Round transfers', value: `${round.length} / ${outbound.length}` },
        { label: 'Share', value: `${Math.round((round.length / outbound.length) * 100)}%` },
        { label: 'Smallest unit treated as round', value: '0.01 ETH' },
      ],
      sampleTxHashes: round.slice(0, 5).map((t) => t.hash),
      confidence: confidenceFrom(round.length, 0.3, 0.05, 0.8),
    });
  }

  // 3. Rapid in-and-out of the same value
  const inByValue = new Map<string, TransactionRecord[]>();
  for (const t of transactions.filter((x) => x.direction === 'in' && safeBigInt(x.valueWei) > 0n)) {
    const k = t.valueWei;
    inByValue.set(k, [...(inByValue.get(k) ?? []), t]);
  }
  const rapid: { in: TransactionRecord; out: TransactionRecord }[] = [];
  for (const t of transactions.filter((x) => x.direction === 'out' && safeBigInt(x.valueWei) > 0n)) {
    const candidates = inByValue.get(t.valueWei) ?? [];
    for (const c of candidates) {
      const delta = t.blockNumber - c.blockNumber;
      if (delta > 0 && delta <= 60) rapid.push({ in: c, out: t });
    }
  }
  if (rapid.length >= 2) {
    const hashes = [...new Set(rapid.flatMap((r) => [r.in.hash, r.out.hash]))].slice(0, 6);
    flags.push({
      id: 'rapid_in_out',
      kind: 'rapid_in_out',
      severity: 'medium',
      title: 'Same value received and forwarded',
      detail: `${rapid.length} pair${rapid.length === 1 ? '' : 's'} of transactions saw an identical value arrive and leave within 60 blocks (~6 seconds at 10 blocks/s). This is consistent with pass-through routing, but identical amounts also occur by coincidence and in batched payouts.`,
      evidence: [
        { label: 'Matched pairs', value: String(rapid.length) },
        { label: 'Max block gap considered', value: '60 blocks' },
        { label: 'Matched value', value: `${formatUnits(safeBigInt(rapid[0].in.valueWei), 18, 8)} ETH` },
      ],
      sampleTxHashes: hashes,
      confidence: confidenceFrom(rapid.length, 0.3, 0.08, 0.85),
    });
  }

  // 4. Single counterparty dominance
  const top = counterparties[0];
  if (top && top.share >= 0.5 && top.txCount >= 5) {
    flags.push({
      id: 'single_counterparty_dominance',
      kind: 'single_counterparty_dominance',
      severity: top.share >= 0.8 ? 'high' : 'medium',
      title: 'One counterparty dominates activity',
      detail: `${Math.round(top.share * 100)}% of the scanned transactions in this window involve a single counterparty (${top.address}). Concentration is a shape, not a verdict: it is equally typical of a personal wallet with one main exchange, a treasury operating one venue, or a bot bound to one contract.`,
      evidence: [
        { label: 'Dominant counterparty', value: top.address },
        { label: 'Share of window transactions', value: `${Math.round(top.share * 100)}%` },
        { label: 'Transactions together', value: String(top.txCount) },
      ],
      sampleTxHashes: top.sampleTxHashes,
      confidence: confidenceFrom(top.txCount, 0.4, 0.05, 0.9),
    });
  }

  // 5 / 6. Fan-in and fan-out
  if (flow.inboundTxCount >= 8 && flow.outboundTxCount <= 2) {
    flags.push({
      id: 'fan_in',
      kind: 'fan_in',
      severity: 'low',
      title: 'Many senders, little outbound activity',
      detail: `${flow.inboundTxCount} inbound transactions against ${flow.outboundTxCount} outbound in the scanned window. Collecting addresses, payout recipients, airdrop targets and exchange deposit addresses all produce this shape.`,
      evidence: [
        { label: 'Inbound transactions', value: String(flow.inboundTxCount) },
        { label: 'Outbound transactions', value: String(flow.outboundTxCount) },
        { label: 'Unique counterparties', value: String(flow.uniqueCounterparties) },
      ],
      sampleTxHashes: transactions.filter((t) => t.direction === 'in').slice(0, 5).map((t) => t.hash),
      confidence: confidenceFrom(flow.inboundTxCount, 0.28, 0.035, 0.75),
    });
  }
  if (flow.outboundTxCount >= 8 && flow.inboundTxCount <= 2) {
    flags.push({
      id: 'fan_out',
      kind: 'fan_out',
      severity: 'low',
      title: 'Many recipients, little inbound activity',
      detail: `${flow.outboundTxCount} outbound transactions against ${flow.inboundTxCount} inbound in the scanned window. Distributions, payroll-style payouts and dusting campaigns all share this shape.`,
      evidence: [
        { label: 'Outbound transactions', value: String(flow.outboundTxCount) },
        { label: 'Inbound transactions', value: String(flow.inboundTxCount) },
        { label: 'Unique counterparties', value: String(flow.uniqueCounterparties) },
      ],
      sampleTxHashes: transactions.filter((t) => t.direction === 'out').slice(0, 5).map((t) => t.hash),
      confidence: confidenceFrom(flow.outboundTxCount, 0.28, 0.035, 0.75),
    });
  }

  // 7. Failed transactions. A single failure is worth an informational note; a
  // cluster with a depressed success rate is a spike worth a warning.
  const observedTotal = flow.inboundTxCount + flow.outboundTxCount + flow.selfTxCount;
  if (flow.failedTxCount >= 1 && observedTotal > 0) {
    const isSpike = flow.failedTxCount >= 3 && flow.successRate > 0 && flow.successRate <= 0.75;
    flags.push({
      id: 'failed_tx_spike',
      kind: 'failed_tx_spike',
      severity: isSpike ? (flow.successRate <= 0.5 ? 'medium' : 'low') : 'info',
      title: isSpike ? 'Elevated transaction failure rate' : 'Failed transaction observed',
      detail: `${flow.failedTxCount} of ${observedTotal} observed transactions failed in the scanned window (observed success rate ${Math.round(flow.successRate * 100)}%). Failures usually indicate slippage guards, out-of-gas, or racing state — not misconduct.`,
      evidence: [
        { label: 'Failed transactions', value: String(flow.failedTxCount) },
        { label: 'Observed transactions', value: String(observedTotal) },
        { label: 'Observed success rate', value: `${Math.round(flow.successRate * 100)}%` },
      ],
      sampleTxHashes: transactions.filter((t) => t.status === 'failed').slice(0, 5).map((t) => t.hash),
      confidence: confidenceFrom(flow.failedTxCount, 0.35, 0.06, 0.88),
    });
  }

  // 8. Contract creation
  const creations = transactions.filter((t) => t.isContractCreation);
  if (creations.length > 0) {
    flags.push({
      id: 'contract_creation',
      kind: 'contract_creation',
      severity: creations.length >= 3 ? 'medium' : 'low',
      title: 'Contract deployment observed',
      detail: `This address deployed ${creations.length} contract${creations.length === 1 ? '' : 's'} inside the scanned window. Deployment is a neutral technical event; it is flagged because deployers are frequently the highest-signal addresses in a graph.`,
      evidence: [
        { label: 'Contracts deployed', value: String(creations.length) },
        { label: 'First deployment block', value: String(Math.min(...creations.map((c) => c.blockNumber))) },
      ],
      sampleTxHashes: creations.slice(0, 5).map((t) => t.hash),
      confidence: confidenceFrom(creations.length, 0.6, 0.06, 0.95),
    });
  }

  // 9. Dormant then active
  if (flow.firstActivityAt && flow.lastActivityAt && transactions.length >= 6) {
    const all = transactions.map((t) => new Date(t.timestamp).getTime()).sort((a, b) => a - b);
    const span = all[all.length - 1] - all[0];
    if (span > 0) {
      let maxGap = 0;
      let gapEndIdx = 0;
      for (let i = 1; i < all.length; i++) {
        const gap = all[i] - all[i - 1];
        if (gap > maxGap) {
          maxGap = gap;
          gapEndIdx = i;
        }
      }
      if (maxGap / span >= 0.7 && maxGap >= 3_600_000) {
        flags.push({
          id: 'dormant_then_active',
          kind: 'dormant_then_active',
          severity: 'low',
          title: 'Long quiet period inside the window',
          detail: `The scanned window contains a ${(maxGap / 3_600_000).toFixed(1)}-hour gap with no activity, followed by ${transactions.length - gapEndIdx} transactions. Wallets going quiet and then waking up is extremely common and carries no inherent meaning.`,
          evidence: [
            { label: 'Longest quiet gap', value: `${(maxGap / 3_600_000).toFixed(1)} h` },
            { label: 'Gap share of observed window', value: `${Math.round((maxGap / span) * 100)}%` },
            { label: 'Transactions after the gap', value: String(transactions.length - gapEndIdx) },
          ],
          sampleTxHashes: transactions.slice(0, 4).map((t) => t.hash),
          confidence: confidenceFrom(transactions.length - gapEndIdx, 0.3, 0.05, 0.75),
        });
      }
    }
  }

  // 10. Self transfers. Even one is an informational signal worth surfacing.
  if (flow.selfTxCount >= 1) {
    flags.push({
      id: 'self_transfer_loop',
      kind: 'self_transfer_loop',
      severity: 'info',
      title: 'Self-directed transactions',
      detail: `${flow.selfTxCount} transaction${flow.selfTxCount === 1 ? '' : 's'} had this address on both sides. Routine causes include sweep operations, contract calls on a self-owned contract, and MEV/bot bookkeeping.`,
      evidence: [{ label: 'Self transactions', value: String(flow.selfTxCount) }],
      sampleTxHashes: transactions.filter((t) => t.direction === 'self').slice(0, 4).map((t) => t.hash),
      confidence: confidenceFrom(flow.selfTxCount, 0.5, 0.06, 0.9),
    });
  }

  flags.sort((a, b) => b.confidence - a.confidence);
  return flags;
}

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------
export function computeActivityByHour(
  transactions: TransactionRecord[],
): { bucketStartISO: string; txCount: number; volumeWei: string }[] {
  const map = new Map<string, { txCount: number; volume: bigint }>();
  for (const t of transactions) {
    const k = hourBucket(t.timestamp);
    const e = map.get(k) ?? { txCount: 0, volume: 0n };
    e.txCount++;
    e.volume += safeBigInt(t.valueWei);
    map.set(k, e);
  }
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([bucketStartISO, e]) => ({ bucketStartISO, txCount: e.txCount, volumeWei: e.volume.toString() }));
}

export function computeMethodBreakdown(transactions: TransactionRecord[]) {
  const map = new Map<string, { method: string; label: string | null; count: number }>();
  for (const t of transactions) {
    const key = t.methodId ?? 'native-transfer';
    const e = map.get(key) ?? { method: key, label: t.methodLabel, count: 0 };
    e.count++;
    map.set(key, e);
  }
  return [...map.values()].sort((a, b) => b.count - a.count);
}

export function computeTypeBreakdown(transactions: TransactionRecord[]) {
  const map = new Map<string, number>();
  for (const t of transactions) map.set(t.txType, (map.get(t.txType) ?? 0) + 1);
  return [...map.entries()]
    .map(([type, count]) => ({ type, label: type, count }))
    .sort((a, b) => b.count - a.count);
}

export function computeStats(
  profile: WalletProfile,
  transactions: TransactionRecord[],
  counterparties: CounterpartyStat[],
): DeterministicStats {
  const flow = computeFlow(transactions, profile.address);
  return {
    profile,
    flow,
    counterparties,
    activityByHour: computeActivityByHour(transactions),
    anomalies: detectAnomalies(transactions, flow, counterparties),
    txCount: transactions.length,
    methodBreakdown: computeMethodBreakdown(transactions),
    typeBreakdown: computeTypeBreakdown(transactions),
  };
}

/**
 * Deterministic digest of everything the AI is allowed to see. This is what gets
 * notarised on-chain — it commits to the inputs, not to the model's prose.
 */
export function computeReportHash(input: {
  subject: string;
  chainId: number;
  transactions: TransactionRecord[];
  version?: string;
}): string {
  const canonical = JSON.stringify({
    v: input.version ?? REPORT_VERSION,
    subject: input.subject.toLowerCase(),
    chainId: input.chainId,
    txs: input.transactions
      .map((t) => [t.hash, t.blockNumber, t.from, t.to, t.valueWei, t.status])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
  });
  return `0x${createHash('sha256').update(canonical).digest('hex')}`;
}
