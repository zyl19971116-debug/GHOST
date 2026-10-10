import { getCapabilityReport } from '@/lib/config';
import { getAllRpcStats } from '@/lib/data/rpc';
import { getRepository } from '@/lib/db/repository';
import { jsonOk } from '@/lib/http';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  const now = new Date();
  const repo = await getRepository();
  let dbStats = { archives: 0, analyses: 0, wallets: 0, transactions: 0 };
  try {
    dbStats = await repo.stats();
  } catch {
    // Statistics are informational; a failure here must not fail the health check.
  }

  const capabilities = getCapabilityReport(now);

  return jsonOk(
    {
      service: 'ghost-protocol-ai',
      status: 'ok',
      time: now.toISOString(),
      storage: { driver: repo.driver, ...dbStats },
      ai: capabilities.ai,
      chains: capabilities.chains.map((c) => ({
        key: c.key,
        id: c.id,
        name: c.name,
        rpcUrlLabel: c.rpcUrlLabel,
        explorerConfigured: c.explorerConfigured,
      })),
      rpc: getAllRpcStats(),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
