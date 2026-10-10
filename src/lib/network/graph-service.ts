import { createPublicClient, http } from 'viem';
import { robinhoodViem } from '../chains';
import { runAnalysis, ANALYSIS_DISCLAIMER } from '../analysis/pipeline';
import { isSystemAddress } from '../utils';
import type { AnalysisReport, RelationshipEdge, RelationshipNode, TokenTransferEvidence } from '../types';

export interface NetworkGraphResult {
  subject: string;
  chainId: 4663;
  nodes: RelationshipNode[];
  edges: RelationshipEdge[];
  coverage: { fromBlock: number | null; toBlock: number | null; complete: false; blocksScanned: number; note: string };
  hasMore: boolean;
  nextCursor: string | null;
  report: AnalysisReport;
  relationshipDisclaimer: string;
}

let verifiedAt = 0;
async function verifyMainnet(): Promise<void> {
  if (Date.now() - verifiedAt < 60_000) return;
  const client = createPublicClient({
    chain: robinhoodViem,
    transport: http(robinhoodViem.rpcUrls.default.http[0], {
      timeout: 20_000,
      fetchOptions: { headers: { 'User-Agent': 'GhostProtocolAI/1.0' } },
    }),
  });
  const chainId = await client.getChainId();
  if (chainId !== 4663) throw new Error(`CHAIN_ID_MISMATCH: expected 4663, RPC returned ${chainId}`);
  verifiedAt = Date.now();
}

const cache = new Map<string, { expires: number; value: NetworkGraphResult }>();

export async function buildNetworkGraph(address: string, depth: 1 | 2, limit: number, cursor?: string): Promise<NetworkGraphResult> {
  await verifyMainnet();
  const subject = address.toLowerCase();
  const offset = cursor && /^\d+$/.test(cursor) ? Number(cursor) : 0;
  const cacheKey = `${subject}:${depth}:${limit}:${offset}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return cached.value;

  const result = await runAnalysis('robinhood', subject, {
    includeAi: false,
    hops: depth,
    expandTopK: depth === 2 ? 8 : undefined,
    maxTransactions: 1_000,
  });
  if (!result.report) throw new Error(`${result.error?.code ?? 'GRAPH_QUERY_FAILED'}: ${result.error?.message ?? 'Unable to query chain data.'}`);

  const report = result.report;
  const nodes = report.graph.nodes.map((node) => ({ ...node, type: node.kind, transactionCount: node.txCount }));
  const edges: RelationshipEdge[] = report.graph.edges.map((edge) => ({
    ...edge,
    transactionCount: edge.txCount,
    transactionHashes: edge.sampleTxHashes,
    nativeValueWei: edge.volumeWei,
    nativeValue: { assetType: 'native', symbol: 'ETH', contractAddress: null, decimals: 18, raw: edge.volumeWei },
    tokenTransfers: [] as TokenTransferEvidence[],
    firstSeen: edge.firstSeenAt,
    lastSeen: edge.lastSeenAt,
  }));
  const nodesByAddress = new Map(nodes.map((node) => [node.address, node]));
  const edgeByCounterparty = new Map<string, RelationshipEdge>();
  for (const edge of edges) edgeByCounterparty.set(edge.source === subject ? edge.target : edge.source, edge);

  const counterpartyStats = new Map(report.stats.counterparties.map((item) => [item.address, item]));
  for (const node of nodes) {
    const stat = counterpartyStats.get(node.address);
    if (stat) {
      node.incomingValueWei = stat.volumeInWei;
      node.outgoingValueWei = stat.volumeOutWei;
      node.incomingValue = { assetType: 'native', symbol: 'ETH', contractAddress: null, decimals: 18, raw: stat.volumeInWei };
      node.outgoingValue = { assetType: 'native', symbol: 'ETH', contractAddress: null, decimals: 18, raw: stat.volumeOutWei };
      node.lastActivity = stat.lastSeenAt;
    }
  }
  const subjectNode = nodesByAddress.get(subject);
  if (subjectNode) {
    subjectNode.incomingValueWei = report.stats.flow.inboundVolumeWei;
    subjectNode.outgoingValueWei = report.stats.flow.outboundVolumeWei;
    subjectNode.incomingValue = { assetType: 'native', symbol: 'ETH', contractAddress: null, decimals: 18, raw: report.stats.flow.inboundVolumeWei };
    subjectNode.outgoingValue = { assetType: 'native', symbol: 'ETH', contractAddress: null, decimals: 18, raw: report.stats.flow.outboundVolumeWei };
    subjectNode.lastActivity = report.stats.flow.lastActivityAt;
    subjectNode.tokenActivity = report.tokenTransfers ?? [];
    const subjectHashes = new Set([
      ...report.transactions.map((tx) => tx.hash.toLowerCase()),
      ...(report.tokenTransfers ?? []).map((row) => row.transactionHash.toLowerCase()),
    ]);
    subjectNode.txCount = subjectHashes.size;
    subjectNode.transactionCount = subjectHashes.size;
  }

  const tokenGroups = new Map<string, TokenTransferEvidence[]>();
  for (const evidence of report.tokenTransfers ?? []) {
    const counterparty = evidence.counterparty.toLowerCase();
    if (counterparty === subject || isSystemAddress(counterparty)) continue;
    const rows = tokenGroups.get(counterparty) ?? [];
    if (!rows.some((row) => row.transactionHash.toLowerCase() === evidence.transactionHash.toLowerCase() && row.logIndex === evidence.logIndex)) rows.push(evidence);
    tokenGroups.set(counterparty, rows);
  }

  for (const [counterparty, evidence] of tokenGroups) {
    let node = nodesByAddress.get(counterparty);
    if (!node) {
      const latest = evidence.map((row) => row.timestamp).filter((v): v is string => Boolean(v)).sort().at(-1) ?? null;
      node = {
        id: counterparty, address: counterparty, label: 'TOKEN COUNTERPARTY', kind: 'counterparty', depth: 1,
        txCount: new Set(evidence.map((row) => row.transactionHash.toLowerCase())).size, volumeWei: '0', isContract: null,
        riskScore: 0, flags: ['TOKEN_TRANSFER_ONLY'], tokenActivity: evidence, incomingValueWei: '0', outgoingValueWei: '0', lastActivity: latest,
        type: 'counterparty', transactionCount: new Set(evidence.map((row) => row.transactionHash.toLowerCase())).size,
        incomingValue: { assetType: 'native', symbol: 'ETH', contractAddress: null, decimals: 18, raw: '0' },
        outgoingValue: { assetType: 'native', symbol: 'ETH', contractAddress: null, decimals: 18, raw: '0' },
      };
      nodes.push(node); nodesByAddress.set(counterparty, node);
    } else {
      node.tokenActivity = evidence;
      const relatedEdge = edgeByCounterparty.get(counterparty);
      const hashes = new Set([...(relatedEdge?.sampleTxHashes ?? []), ...evidence.map((row) => row.transactionHash)]);
      node.txCount = hashes.size;
      node.transactionCount = hashes.size;
    }

    let edge = edgeByCounterparty.get(counterparty);
    if (!edge) {
      const timestamps = evidence.map((row) => row.timestamp).filter((v): v is string => Boolean(v)).sort();
      const incoming = evidence.some((row) => row.direction === 'in');
      const outgoing = evidence.some((row) => row.direction === 'out');
      const hashes = [...new Set(evidence.map((row) => row.transactionHash))];
      edge = {
        id: `${subject}->${counterparty}:token`, source: subject, target: counterparty, txCount: hashes.length,
        volumeWei: '0', nativeValueWei: '0', direction: incoming && outgoing ? 'both' : incoming ? 'in' : 'out',
        firstSeenAt: timestamps[0] ?? report.createdAt, lastSeenAt: timestamps.at(-1) ?? report.createdAt,
        sampleTxHashes: hashes.slice(0, 8), confidence: Math.min(0.82, 0.25 + hashes.length * 0.055),
        basis: [`${evidence.length} verified Transfer log(s) observed on Robinhood Chain.`, 'Token amounts remain separated by token contract and raw precision.', 'Relationship strength measures observed interactions, not common ownership.'],
        tokenTransfers: evidence,
        transactionCount: hashes.length,
        transactionHashes: hashes.slice(0, 8),
        nativeValue: { assetType: 'native', symbol: 'ETH', contractAddress: null, decimals: 18, raw: '0' },
        firstSeen: timestamps[0] ?? report.createdAt,
        lastSeen: timestamps.at(-1) ?? report.createdAt,
      };
      edges.push(edge); edgeByCounterparty.set(counterparty, edge);
    } else {
      edge.tokenTransfers = evidence;
      edge.sampleTxHashes = [...new Set([...edge.sampleTxHashes, ...evidence.map((row) => row.transactionHash)])].slice(0, 8);
      edge.transactionHashes = edge.sampleTxHashes;
    }
  }

  const direct = nodes.filter((node) => node.address !== subject);
  const pageNodes = direct.slice(offset, offset + Math.max(1, limit - 1));
  const included = new Set([subject, ...pageNodes.map((node) => node.address)]);
  const pagedNodes = [nodesByAddress.get(subject)!, ...pageNodes].filter(Boolean);
  const pagedEdges = edges.filter((edge) => included.has(edge.source) && included.has(edge.target));
  const hasMore = offset + pageNodes.length < direct.length;
  const scanSources = report.dataSources.filter((source) => source.strategy === 'rpc-block-scan' || source.strategy === 'rpc-logs');
  const fromBlocks = scanSources.map((source) => source.fromBlock).filter((v): v is number => typeof v === 'number');
  const toBlocks = scanSources.map((source) => source.toBlock).filter((v): v is number => typeof v === 'number');
  const blocksScanned = scanSources.reduce((sum, source) => sum + (source.blocksScanned ?? 0), 0);
  const value: NetworkGraphResult = {
    subject, chainId: 4663, nodes: pagedNodes, edges: pagedEdges,
    coverage: {
      fromBlock: fromBlocks.length ? Math.min(...fromBlocks) : null,
      toBlock: toBlocks.length ? Math.max(...toBlocks) : null,
      complete: false,
      blocksScanned,
      note: scanSources.map((source) => source.limitation).filter(Boolean).join(' '),
    },
    hasMore, nextCursor: hasMore ? String(offset + pageNodes.length) : null, report,
    relationshipDisclaimer: 'Relationship strength measures observed interactions, not common ownership. ' + ANALYSIS_DISCLAIMER,
  };
  cache.set(cacheKey, { expires: Date.now() + 45_000, value });
  return value;
}
