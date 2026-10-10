import { z } from 'zod';
import { getServerConfig } from '../config';
import { formatUnits } from '../utils';
import type { AiFinding, AiReport, DeterministicStats, DataSourceInfo, TransactionRecord } from '../types';

/**
 * AI layer.
 *
 * DESIGN RULES (enforced here, not merely requested in the prompt):
 *  1. The model never sees raw chain data. It sees deterministic statistics that
 *     the server already computed, each with an explicit source.
 *  2. The model may not assert that two addresses share a real-world controller.
 *     That string is checked for and stripped.
 *  3. Every finding must carry confidence, basis and limitations. Missing fields
 *     are filled with conservative defaults rather than left empty.
 *  4. With no API key the report is `not_configured` — the deterministic engine
 *     still produces the full analysis and the UI says so plainly.
 */

export const AI_POLICY =
  'AI output is derived from deterministic on-chain statistics. A funds-flow relationship is NOT evidence of common ownership or control. Every statement is an inference with a stated confidence and stated limits, and must be re-checked against the transaction hashes cited.';

const AI_FINDING_SCHEMA = z.object({
  title: z.string().min(2).max(160),
  detail: z.string().min(10).max(2200),
  confidence: z.number().min(0).max(1),
  basis: z.array(z.string().max(400)).max(8).default([]),
  limitations: z.array(z.string().max(400)).max(8).default([]),
  sampleTxHashes: z.array(z.string()).max(8).default([]),
});

const AI_RESPONSE_SCHEMA = z.object({
  summary: z.string().min(20).max(3000),
  findings: z.array(AI_FINDING_SCHEMA).max(10).default([]),
  riskNotes: z.array(z.string().max(500)).max(10).default([]),
  timeline: z
    .array(z.object({ label: z.string().max(200), detail: z.string().max(900), txHashes: z.array(z.string()).max(8).default([]) }))
    .max(14)
    .default([]),
  limitations: z.array(z.string().max(500)).max(10).default([]),
});

/** Phrases that assert common control. Stripped defensively. */
const FORBIDDEN_ASSERTIONS: { pattern: RegExp; reason: string }[] = [
  { pattern: /\b(same|shared|identical|common)\s+(owner|ownership|controller|control|person|entity|wallet owner)\b/gi, reason: 'common-control assertion' },
  { pattern: /\b(is|are)\s+the\s+same\s+(person|entity|wallet|actor)\b/gi, reason: 'identity assertion' },
  { pattern: /\bbelongs?\s+to\s+the\s+same\b/gi, reason: 'ownership assertion' },
  { pattern: /\b(proves?|confirms?|demonstrates?)\s+(that\s+)?(they|these\s+addresses)\s+(are|share)\b/gi, reason: 'proof claim' },
  { pattern: /\b(all|both)\s+(addresses\s+)?(are\s+)?(controlled|operated)\s+by\b/gi, reason: 'control attribution' },
];

function sanitize(text: string): { text: string; redactions: string[] } {
  let out = text;
  const redactions: string[] = [];
  for (const { pattern, reason } of FORBIDDEN_ASSERTIONS) {
    if (pattern.test(out)) {
      redactions.push(reason);
      out = out.replace(pattern, '[REDACTED: unsupported attribution claim]');
    }
    pattern.lastIndex = 0;
  }
  return { text: out, redactions };
}

function sanitizeList(items: string[]): { items: string[]; redactions: string[] } {
  const redactions: string[] = [];
  const cleaned = items.map((i) => {
    const r = sanitize(i);
    redactions.push(...r.redactions);
    return r.text;
  });
  return { items: cleaned, redactions };
}

// ---------------------------------------------------------------------------
// Prompt construction
// ---------------------------------------------------------------------------
function buildFacts(stats: DeterministicStats, sources: DataSourceInfo[], transactions: TransactionRecord[]) {
  const f = stats.flow;
  const topCounterparties = stats.counterparties.slice(0, 15).map((c) => ({
    address: c.address,
    transactions: c.txCount,
    inbound: c.inboundCount,
    outbound: c.outboundCount,
    volume_in_eth: formatUnits(c.volumeInWei, 18, 6),
    volume_out_eth: formatUnits(c.volumeOutWei, 18, 6),
    share_of_window: `${Math.round(c.share * 100)}%`,
    looked_like_contract: c.isContract,
    first_seen_at: c.firstSeenAt,
    last_seen_at: c.lastSeenAt,
    sample_tx: c.sampleTxHashes,
  }));

  return {
    subject_address: stats.profile.address,
    chain_key: stats.profile.chainKey,
    chain_id: stats.profile.chainId,
    is_contract: stats.profile.isContract,
    balance_eth_at_latest_block: stats.profile.balanceEth,
    nonce_at_latest_block: stats.profile.nonce,
    observed_window: {
      from: f.firstActivityAt,
      to: f.lastActivityAt,
      transactions: stats.txCount,
      active_blocks: f.activeBlocks,
      transactions_per_hour: f.txPerHour,
    },
    flows: {
      inbound_transactions: f.inboundTxCount,
      outbound_transactions: f.outboundTxCount,
      self_transactions: f.selfTxCount,
      inbound_volume_eth: formatUnits(f.inboundVolumeWei, 18, 6),
      outbound_volume_eth: formatUnits(f.outboundVolumeWei, 18, 6),
      net_flow_eth: formatUnits(f.netFlowWei, 18, 6),
      total_fees_eth: formatUnits(f.totalFeesWei, 18, 6),
      unique_counterparties: f.uniqueCounterparties,
      contract_interactions: f.contractInteractions,
      contract_deployments: f.contractCreations,
      failed_transactions: f.failedTxCount,
      observed_success_rate: f.successRate,
    },
    method_breakdown: stats.methodBreakdown.slice(0, 12),
    transaction_type_breakdown: stats.typeBreakdown,
    top_counterparties: topCounterparties,
    deterministic_anomaly_flags: stats.anomalies.map((a) => ({
      kind: a.kind,
      severity: a.severity,
      title: a.title,
      evidence: a.evidence,
      engine_confidence: a.confidence,
      sample_tx: a.sampleTxHashes,
    })),
    data_provenance: sources.map((s) => ({
      strategy: s.strategy,
      source: s.label,
      completeness: s.completeness,
      blocks_scanned: s.blocksScanned ?? null,
      block_range: s.fromBlock !== undefined && s.toBlock !== undefined ? [s.fromBlock, s.toBlock] : null,
      full_history_index: s.fullHistoryIndex,
      limitation: s.limitation ?? null,
      error: s.error ?? null,
    })),
    total_transactions_supplied: transactions.length,
  };
}

const SYSTEM_PROMPT = `You are the analysis narrator for GHOST PROTOCOL AI, an on-chain wallet relationship analysis platform.

You will receive a JSON object of DETERMINISTIC statistics already computed by the platform's engine from real blockchain transactions. Your job is to explain those statistics in plain language.

ABSOLUTE RULES — violating any of these makes your output unusable:
1. Use ONLY the numbers and addresses in the supplied JSON. Never invent a transaction, a hash, a counterparty, a token, an amount, a date or a statistic. If a value is not present, say it is not available.
2. NEVER state or imply that two addresses are controlled by the same person, entity, team, or wallet owner. A funds-flow relationship is NOT proof of common control. You may describe the observed transfer pattern and must label it as an inference.
3. NEVER state or imply a profit, a return, a yield, a valuation, or a financial outlook. You are not giving financial advice.
4. NEVER name a specific real-world person, company or exchange unless that name was given to you in the input.
5. Every finding must include: a confidence between 0 and 1 that reflects how much data supports it, the concrete basis drawn from the supplied statistics, and explicit limitations. Low-sample findings must have low confidence.
6. If a data source is partial or unavailable, say so in the limitations and lower your confidence accordingly. Do not paper over missing coverage.
7. Write in uppercase-friendly, terse, technical English suitable for a HUD readout. No marketing language. No emoji.

Output STRICT JSON matching exactly this shape:
{
  "summary": "string — 3 to 6 sentences describing what the data shows",
  "findings": [ { "title": "string", "detail": "string", "confidence": 0.0, "basis": ["string"], "limitations": ["string"], "sampleTxHashes": ["0x..."] } ],
  "riskNotes": ["string"],
  "timeline": [ { "label": "string", "detail": "string", "txHashes": ["0x..."] } ],
  "limitations": ["string"]
}
Return JSON only. No prose before or after, no markdown fences.`;

// ---------------------------------------------------------------------------
// Call
// ---------------------------------------------------------------------------
export async function generateAiReport(input: {
  stats: DeterministicStats;
  sources: DataSourceInfo[];
  transactions: TransactionRecord[];
  now?: Date;
}): Promise<AiReport> {
  const now = input.now ?? new Date();
  const config = getServerConfig();

  const base: AiReport = {
    status: 'not_configured',
    model: null,
    generatedAt: now.toISOString(),
    summary: null,
    findings: [],
    riskNotes: [],
    timeline: [],
    limitations: [],
    policy: AI_POLICY,
  };

  if (!config.ai.configured || !config.ai.apiKey) {
    return {
      ...base,
      limitations: [
        'No AI provider is configured for this deployment (AI_API_KEY is unset). The deterministic statistics above are complete and unaffected — only the narrative layer is unavailable.',
        'Set AI_API_KEY (and optionally AI_BASE_URL / AI_MODEL) in the server environment to enable this section.',
      ],
    };
  }

  const facts = buildFacts(input.stats, input.sources, input.transactions);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.ai.timeoutMs);

  try {
    const res = await fetch(`${config.ai.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${config.ai.apiKey}`,
      },
      body: JSON.stringify({
        model: config.ai.model,
        temperature: 0.15,
        max_tokens: config.ai.maxOutputTokens,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: `Deterministic statistics computed from real on-chain data:\n\n${JSON.stringify(facts, null, 2)}\n\nExplain these statistics following every rule in the system prompt. Return JSON only.`,
          },
        ],
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return {
        ...base,
        status: 'failed',
        model: config.ai.model,
        error: {
          code: `AI_HTTP_${res.status}`,
          message: `The AI provider returned HTTP ${res.status}. The deterministic analysis is unaffected.`,
          detail: body.slice(0, 300),
        },
      };
    }

    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = json.choices?.[0]?.message?.content;
    if (!content) {
      return {
        ...base,
        status: 'failed',
        model: config.ai.model,
        error: { code: 'AI_EMPTY_RESPONSE', message: 'The AI provider returned an empty completion.' },
      };
    }

    const cleaned = content.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    let parsedRaw: unknown;
    try {
      parsedRaw = JSON.parse(cleaned);
    } catch {
      return {
        ...base,
        status: 'failed',
        model: config.ai.model,
        error: {
          code: 'AI_INVALID_JSON',
          message: 'The AI provider returned output that is not valid JSON. Nothing from it has been shown.',
          detail: cleaned.slice(0, 300),
        },
      };
    }

    const parsed = AI_RESPONSE_SCHEMA.safeParse(parsedRaw);
    if (!parsed.success) {
      return {
        ...base,
        status: 'failed',
        model: config.ai.model,
        error: {
          code: 'AI_SCHEMA_MISMATCH',
          message: 'The AI response did not match the required output schema, so it was discarded rather than displayed.',
          detail: parsed.error.issues.slice(0, 4).map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
        },
      };
    }

    // Defensively strip unsupported attribution claims.
    const redactions: string[] = [];
    const summary = sanitize(parsed.data.summary);
    redactions.push(...summary.redactions);

    const findings: AiFinding[] = parsed.data.findings.map((f) => {
      const detail = sanitize(f.detail);
      const basis = sanitizeList(f.basis);
      const limitations = sanitizeList(f.limitations);
      redactions.push(...detail.redactions, ...basis.redactions, ...limitations.redactions);
      return {
        title: f.title,
        detail: detail.text,
        confidence: f.confidence,
        basis: basis.items,
        limitations:
          limitations.items.length > 0
            ? limitations.items
            : ['Stated confidence reflects only the deterministic statistics supplied; no independent verification was performed.'],
        sampleTxHashes: f.sampleTxHashes.filter((h) => /^0x[0-9a-fA-F]{64}$/.test(h)),
      };
    });

    const riskNotes = sanitizeList(parsed.data.riskNotes);
    const limitations = sanitizeList(parsed.data.limitations);
    redactions.push(...riskNotes.redactions, ...limitations.redactions);

    if (redactions.length > 0) {
      limitations.items.push(
        `The model produced ${redactions.length} statement(s) asserting common ownership or control. Those phrases were removed automatically because funds-flow correlation cannot establish common control.`,
      );
    }

    return {
      status: 'generated',
      model: config.ai.model,
      generatedAt: new Date().toISOString(),
      summary: summary.text,
      findings,
      riskNotes: riskNotes.items,
      timeline: parsed.data.timeline.map((t) => ({
        label: t.label,
        detail: sanitize(t.detail).text,
        txHashes: t.txHashes.filter((h) => /^0x[0-9a-fA-F]{64}$/.test(h)),
      })),
      limitations: limitations.items,
      policy: AI_POLICY,
    };
  } catch (err) {
    const aborted = err instanceof Error && err.name === 'AbortError';
    return {
      ...base,
      status: 'failed',
      model: config.ai.model,
      error: {
        code: aborted ? 'AI_TIMEOUT' : 'AI_REQUEST_FAILED',
        message: aborted
          ? `The AI provider did not respond within ${config.ai.timeoutMs}ms. The deterministic analysis is unaffected.`
          : 'The AI request failed. The deterministic analysis is unaffected.',
        detail: err instanceof Error ? err.message : String(err),
      },
    };
  } finally {
    clearTimeout(timer);
  }
}
