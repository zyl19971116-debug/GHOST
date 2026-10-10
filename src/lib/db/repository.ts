import { getServerConfig } from '../config';
import type { AnalysisReport, ArchiveRecord } from '../types';
import { formatUnits } from '../utils';

/**
 * Persistence layer.
 *
 * Two interchangeable adapters:
 *  - `PrismaArchiveRepository` — used when DATABASE_URL is set.
 *  - `MemoryArchiveRepository` — used otherwise, so the product is fully
 *    operable without PostgreSQL. Data is process-local and volatile; the UI
 *    says so explicitly rather than implying durability.
 *
 * The Prisma client is imported lazily so a deployment without a generated
 * client (or without DATABASE_URL) still boots.
 */

export interface ArchiveListFilter {
  subject?: string;
  chainKey?: string;
  limit?: number;
  attestationStatus?: string;
}

export interface ArchiveRepo {
  readonly driver: 'postgresql' | 'memory';
  list(filter: ArchiveListFilter): Promise<ArchiveRecord[]>;
  get(id: string): Promise<ArchiveRecord | null>;
  create(record: Omit<ArchiveRecord, 'id' | 'createdAt'> & { analysisId?: string | null }): Promise<ArchiveRecord>;
  updateAttestation(
    id: string,
    patch: Partial<ArchiveRecord['attestation']>,
  ): Promise<ArchiveRecord | null>;
  saveAnalysis(report: AnalysisReport): Promise<void>;
  listRecentAnalyses(limit: number): Promise<
    { id: string; subject: string; chainKey: string; chainId: number; reportHash: string; createdAt: string; txCount: number; anomalyCount: number }[]
  >;
  stats(): Promise<{ archives: number; analyses: number; wallets: number; transactions: number }>;
}

// ---------------------------------------------------------------------------
// In-memory adapter
// ---------------------------------------------------------------------------
class MemoryArchiveRepository implements ArchiveRepo {
  readonly driver = 'memory' as const;
  private archives = new Map<string, ArchiveRecord>();
  private analyses = new Map<string, AnalysisReport>();
  private counter = 0;

  async list(filter: ArchiveListFilter): Promise<ArchiveRecord[]> {
    let items = [...this.archives.values()];
    if (filter.subject) {
      const s = filter.subject.toLowerCase();
      items = items.filter((a) => a.subject.toLowerCase().includes(s));
    }
    if (filter.chainKey) items = items.filter((a) => a.chainKey === filter.chainKey);
    if (filter.attestationStatus) items = items.filter((a) => a.attestation.status === filter.attestationStatus);
    items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return items.slice(0, filter.limit ?? 100);
  }

  async get(id: string): Promise<ArchiveRecord | null> {
    return this.archives.get(id) ?? null;
  }

  async create(record: Omit<ArchiveRecord, 'id' | 'createdAt'>): Promise<ArchiveRecord> {
    this.counter++;
    const id = `mem_${Date.now().toString(36)}_${this.counter.toString(36)}`;
    const full: ArchiveRecord = { ...record, id, createdAt: new Date().toISOString() };
    this.archives.set(id, full);
    return full;
  }

  async updateAttestation(id: string, patch: Partial<ArchiveRecord['attestation']>): Promise<ArchiveRecord | null> {
    const existing = this.archives.get(id);
    if (!existing) return null;
    const updated: ArchiveRecord = { ...existing, attestation: { ...existing.attestation, ...patch } };
    this.archives.set(id, updated);
    return updated;
  }

  async saveAnalysis(report: AnalysisReport): Promise<void> {
    this.analyses.set(report.reportHash, report);
  }

  async listRecentAnalyses(limit: number) {
    return [...this.analyses.values()]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit)
      .map((r) => ({
        id: r.id,
        subject: r.subject,
        chainKey: r.chainKey,
        chainId: r.chainId,
        reportHash: r.reportHash,
        createdAt: r.createdAt,
        txCount: r.stats.txCount,
        anomalyCount: r.stats.anomalies.length,
      }));
  }

  async stats() {
    return {
      archives: this.archives.size,
      analyses: this.analyses.size,
      wallets: 0,
      transactions: [...this.analyses.values()].reduce((acc, r) => acc + r.transactions.length, 0),
    };
  }
}

// ---------------------------------------------------------------------------
// Prisma adapter
// ---------------------------------------------------------------------------
interface PrismaLike {
  wallet: any;
  analysis: any;
  archive: any;
  transaction: any;
  $disconnect: () => Promise<void>;
}

class PrismaArchiveRepository implements ArchiveRepo {
  readonly driver = 'postgresql' as const;
  constructor(private readonly prisma: PrismaLike) {}

  private async subjectWalletId(chainId: number, address: string): Promise<string> {
    const addressLc = address.toLowerCase();
    const wallet = await this.prisma.wallet.upsert({
      where: { chainId_addressLc: { chainId, addressLc } },
      update: {},
      create: { chainId, address, addressLc },
      select: { id: true },
    });
    return wallet.id as string;
  }

  private toRecord(row: any): ArchiveRecord {
    return {
      id: row.id,
      createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
      subject: row.subject?.address ?? '',
      chainKey: chainKeyFromId(row.chainId),
      chainId: row.chainId,
      reportHash: row.reportHash,
      reportVersion: row.reportVersion,
      label: row.label,
      metadataCid: row.metadataCid ?? null,
      attestation: {
        status: row.attestationStatus,
        txHash: row.attestationTxHash ?? null,
        explorerUrl: null,
        contractAddress: row.attestationContract ?? null,
        chainId: row.attestationChainId ?? row.chainId,
        submittedAt: row.attestedAt ? new Date(row.attestedAt).toISOString() : null,
        error: row.attestationError ?? undefined,
      },
      summary: {
        txCount: row.analysis?.txCount ?? 0,
        counterparties: row.analysis?.counterpartyCount ?? 0,
        anomalyCount: row.analysis?.anomalyCount ?? 0,
        netFlowWei: row.analysis?.netFlowWei ?? '0',
      },
    };
  }

  async list(filter: ArchiveListFilter): Promise<ArchiveRecord[]> {
    const where: Record<string, unknown> = {};
    if (filter.chainKey) {
      const id = idFromChainKey(filter.chainKey);
      if (id !== null) where.chainId = id;
    }
    if (filter.attestationStatus) where.attestationStatus = filter.attestationStatus;
    const rows = await this.prisma.archive.findMany({
      where,
      include: { subject: { select: { address: true } }, analysis: true },
      orderBy: { createdAt: 'desc' },
      take: filter.limit ?? 100,
    });
    let records = rows.map((r: any) => this.toRecord(r));
    if (filter.subject) {
      const s = filter.subject.toLowerCase();
      records = records.filter((r: ArchiveRecord) => r.subject.toLowerCase().includes(s));
    }
    return records;
  }

  async get(id: string): Promise<ArchiveRecord | null> {
    const row = await this.prisma.archive.findUnique({
      where: { id },
      include: { subject: { select: { address: true } }, analysis: true },
    });
    return row ? this.toRecord(row) : null;
  }

  async create(record: Omit<ArchiveRecord, 'id' | 'createdAt'> & { analysisId?: string | null }): Promise<ArchiveRecord> {
    const chainId = record.chainId;
    const subjectId = await this.subjectWalletId(chainId, record.subject);
    const created = await this.prisma.archive.create({
      data: {
        reportHash: record.reportHash,
        reportVersion: record.reportVersion,
        chainId,
        subjectId,
        analysisId: record.analysisId ?? null,
        label: record.label,
        metadataCid: record.metadataCid,
        attestationStatus: record.attestation.status,
        attestationTxHash: record.attestation.txHash,
        attestationContract: record.attestation.contractAddress,
        attestationChainId: record.attestation.chainId,
        attestationError: record.attestation.error ?? null,
        attestedAt: record.attestation.submittedAt ? new Date(record.attestation.submittedAt) : null,
      },
      include: { subject: { select: { address: true } }, analysis: true },
    });
    return this.toRecord(created);
  }

  async updateAttestation(id: string, patch: Partial<ArchiveRecord['attestation']>): Promise<ArchiveRecord | null> {
    const data: Record<string, unknown> = {};
    if (patch.status !== undefined) data.attestationStatus = patch.status;
    if (patch.txHash !== undefined) data.attestationTxHash = patch.txHash;
    if (patch.contractAddress !== undefined) data.attestationContract = patch.contractAddress;
    if (patch.chainId !== undefined) data.attestationChainId = patch.chainId;
    if (patch.error !== undefined) data.attestationError = patch.error;
    if (patch.submittedAt !== undefined) data.attestedAt = patch.submittedAt ? new Date(patch.submittedAt) : null;
    try {
      const row = await this.prisma.archive.update({
        where: { id },
        data,
        include: { subject: { select: { address: true } }, analysis: true },
      });
      return this.toRecord(row);
    } catch {
      return null;
    }
  }

  async saveAnalysis(report: AnalysisReport): Promise<void> {
    const subjectId = await this.subjectWalletId(report.chainId, report.subject);
    const scan = report.dataSources.find((s) => s.strategy === 'rpc-block-scan');
    const json = (v: unknown) => JSON.parse(JSON.stringify(v));

    await this.prisma.analysis.create({
      data: {
        reportHash: report.reportHash,
        reportVersion: report.reportVersion,
        chainId: report.chainId,
        subjectId,
        fromBlock: scan?.fromBlock ?? null,
        toBlock: scan?.toBlock ?? null,
        blocksScanned: scan?.blocksScanned ?? null,
        txCount: report.stats.txCount,
        counterpartyCount: report.stats.counterparties.length,
        anomalyCount: report.stats.anomalies.length,
        netFlowWei: report.stats.flow.netFlowWei,
        successRate: report.stats.flow.successRate,
        stats: json(report.stats),
        graph: json(report.graph),
        ai: json(report.ai),
        sources: json(report.dataSources),
      },
    });

    // Persist the transaction rows that back this analysis.
    for (const tx of report.transactions.slice(0, 500)) {
      const fromId = await this.subjectWalletId(report.chainId, tx.from);
      let toId: string | null = null;
      if (tx.to) toId = await this.subjectWalletId(report.chainId, tx.to);
      await this.prisma.transaction.upsert({
        where: { chainId_hash: { chainId: report.chainId, hash: tx.hash } },
        update: { status: tx.status, gasUsed: tx.gasUsed, feeWei: tx.feeWei, updatedAt: new Date() },
        create: {
          chainId: report.chainId,
          hash: tx.hash,
          blockNumber: tx.blockNumber,
          blockHash: tx.blockHash,
          blockTime: new Date(tx.timestamp),
          fromId,
          toId,
          valueWei: tx.valueWei,
          gasLimit: tx.gasLimit,
          gasPriceWei: tx.gasPriceWei,
          gasUsed: tx.gasUsed,
          feeWei: tx.feeWei,
          nonce: tx.nonce,
          inputSize: tx.inputSize,
          methodId: tx.methodId,
          methodLabel: tx.methodLabel,
          txType: tx.txType,
          status: tx.status,
          isContractCreation: tx.isContractCreation,
          isContractInteraction: tx.isContractInteraction,
          sourceStrategy: tx.sourceStrategy,
        },
      });
    }
  }

  async listRecentAnalyses(limit: number) {
    const rows = await this.prisma.analysis.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { subject: { select: { address: true } } },
    });
    return rows.map((r: any) => ({
      id: r.id,
      subject: r.subject?.address ?? '',
      chainKey: chainKeyFromId(r.chainId),
      chainId: r.chainId,
      reportHash: r.reportHash,
      createdAt: (r.createdAt instanceof Date ? r.createdAt : new Date(r.createdAt)).toISOString(),
      txCount: r.txCount,
      anomalyCount: r.anomalyCount,
    }));
  }

  async stats() {
    const [archives, analyses, wallets, transactions] = await Promise.all([
      this.prisma.archive.count(),
      this.prisma.analysis.count(),
      this.prisma.wallet.count(),
      this.prisma.transaction.count(),
    ]);
    return { archives, analyses, wallets, transactions };
  }
}

// Kept local to avoid a circular import with lib/chains.
const CHAIN_ID_TO_KEY: Record<number, string> = {
  4663: 'robinhood',
  46630: 'robinhoodTestnet',
  1: 'ethereum',
  8453: 'base',
  42161: 'arbitrum',
  10: 'optimism',
  137: 'polygon',
};

function chainKeyFromId(id: number): string {
  return CHAIN_ID_TO_KEY[id] ?? `chain-${id}`;
}
function idFromChainKey(key: string): number | null {
  const found = Object.entries(CHAIN_ID_TO_KEY).find(([, k]) => k === key);
  return found ? Number(found[0]) : null;
}

// ---------------------------------------------------------------------------
// Selection
// ---------------------------------------------------------------------------
let singleton: ArchiveRepo | null = null;
let initAttempted = false;

export async function getRepository(): Promise<ArchiveRepo> {
  if (singleton) return singleton;
  const config = getServerConfig();

  if (config.database.configured && !initAttempted) {
    initAttempted = true;
    try {
      const mod = (await import('@prisma/client')) as unknown as { PrismaClient: new () => PrismaLike };
      const client = new mod.PrismaClient();
      await client.$disconnect().catch(() => undefined);
      singleton = new PrismaArchiveRepository(client);
      return singleton;
    } catch (err) {
      // Fall through to memory, but never pretend the database worked.
      console.warn(
        '[ghost-protocol] DATABASE_URL is set but the Prisma client could not be initialised. Falling back to volatile in-memory storage. Run `npm run prisma:generate` and `npm run prisma:deploy`.',
        err instanceof Error ? err.message : err,
      );
    }
  }

  singleton = new MemoryArchiveRepository();
  return singleton;
}

export function formatNetFlow(wei: string): string {
  const v = Number(wei) / 1e18;
  const sign = v >= 0 ? '+' : '-';
  return `${sign}${formatUnits(BigInt(Math.abs(Math.trunc(v * 1e18))).toString(), 18, 6)} ETH`;
}
