import { runAnalysis } from '@/lib/analysis/pipeline';
import { getRepository } from '@/lib/db/repository';
import { guard, jsonError, jsonOk, parseBody, analyzeInputSchema } from '@/lib/http';
import { getChainMeta } from '@/lib/chains';
import { getServerConfig } from '@/lib/config';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
// A bounded block scan plus an optional AI call can take a while on a cold cache.
export const maxDuration = 120;

/**
 * The analysis endpoint.
 *
 * Flow: real chain reads -> deterministic statistics -> relationship graph ->
 * (optional) AI narration over those statistics.
 *
 * If the chain read yields nothing, this returns 503 with the upstream reason.
 * It never returns placeholder or synthesised data.
 */
export async function POST(req: Request) {
  const gate = guard(req, 'analyze');
  if ('response' in gate) return gate.response;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return jsonError('INVALID_JSON', 'Request body must be valid JSON.', { status: 400 });
  }

  const parsed = parseBody(analyzeInputSchema, raw);
  if (!parsed.ok) return parsed.response;
  const { chain, address, maxBlocks, maxTransactions, includeAi, hops, expandTopK } = parsed.value;

  const meta = getChainMeta(chain);
  if (!meta) {
    return jsonError('UNSUPPORTED_CHAIN', `"${chain}" is not a supported chain key for this deployment.`, { status: 400 });
  }

  const limits = getServerConfig().limits;
  const { report, sources, error } = await runAnalysis(chain, address, {
    maxBlocks: maxBlocks ?? limits.scanMaxBlocks,
    maxTransactions: maxTransactions ?? 400,
    includeAi,
    hops: hops ?? 1,
    expandTopK,
  });

  if (!report) {
    return jsonError(error?.code ?? 'ANALYSIS_FAILED', error?.message ?? 'The analysis could not be produced.', {
      status: 503,
      detail: error?.detail,
      headers: gate.headers,
    });
  }

  // Persist when a database is configured; a storage failure must not lose the report.
  let persisted = false;
  try {
    const repo = await getRepository();
    await repo.saveAnalysis(report);
    persisted = true;
  } catch {
    persisted = false;
  }

  return jsonOk(report, {
    headers: { ...gate.headers, 'Cache-Control': 'no-store' },
    meta: {
      persisted,
      storageDriver: getServerConfig().database.configured ? 'postgresql' : 'memory',
      transactionsReturned: report.transactions.length,
      sourcesConsulted: sources.length,
    },
  });
}
