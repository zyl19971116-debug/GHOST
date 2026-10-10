/**
 * AI layer degradation and boundary enforcement.
 *
 * Two things must hold no matter what:
 *   1. With no API key the deterministic analysis is untouched and the AI section
 *      reports `not_configured` — it never fabricates a narrative.
 *   2. Whatever the model returns, statements asserting common ownership are
 *      stripped before anything reaches the UI.
 */

import { strict as assert } from 'node:assert';
import { afterEach, beforeEach, describe, it } from 'node:test';

import { AI_POLICY, generateAiReport } from '../src/lib/ai/llm';
import { computeCounterparties, computeStats } from '../src/lib/analysis/deterministic';
import type { DataSourceInfo } from '../src/lib/types';
import { SUBJECT, profileOf, scenario } from './fixtures';

const originalFetch = globalThis.fetch;
const savedKey = process.env.AI_API_KEY;

const txs = scenario();
const stats = computeStats(profileOf(), txs, computeCounterparties(txs, SUBJECT));
const sources: DataSourceInfo[] = [
  {
    label: 'Robinhood Chain RPC',
    host: 'rpc.mainnet.chain.robinhood.com',
    strategy: 'rpc-block-scan',
    chainKey: 'robinhood',
    chainId: 4663,
    fullHistoryIndex: false,
    fromBlock: 84058000,
    toBlock: 84058804,
    blocksScanned: 805,
    latestSyncedBlock: 84058804,
    fetchedAt: '2026-10-09T09:20:00.000Z',
    latestBlockTimestamp: '2026-10-09T09:19:58.000Z',
    cache: 'miss',
    completeness: 'complete',
    limitation: 'Bounded recent-window scan only.',
  },
];

function validAiPayload(overrides: Record<string, unknown> = {}) {
  return {
    summary: 'THE WALLET SHOWS 8 OBSERVED TRANSACTIONS ACROSS 4 COUNTERPARTIES.',
    findings: [
      {
        title: 'CONCENTRATED OUTBOUND FLOW',
        detail: 'MOST OUTBOUND VALUE MOVED TO A SINGLE COUNTERPARTY.',
        confidence: 0.7,
        basis: ['outbound volume dominated by one address'],
        limitations: ['bounded scan window'],
        sampleTxHashes: [`0x${'a'.repeat(64)}`],
      },
    ],
    riskNotes: ['CONTRACT CREATION OBSERVED IN WINDOW.'],
    timeline: [{ label: 'BLOCK 1000', detail: 'FIRST OBSERVED TRANSFER.', txHashes: [`0x${'a'.repeat(64)}`] }],
    limitations: ['BOUNDED WINDOW — NOT A COMPLETE HISTORY.'],
    ...overrides,
  };
}

function stubCompletion(payload: unknown, status = 200) {
  const bodies: unknown[] = [];
  globalThis.fetch = (async (_input: string | URL, init?: RequestInit) => {
    bodies.push(init?.body ? JSON.parse(String(init.body)) : null);
    return new Response(
      JSON.stringify({ choices: [{ message: { content: JSON.stringify(payload) } }] }),
      { status, headers: { 'content-type': 'application/json' } },
    );
  }) as unknown as typeof fetch;
  return bodies;
}

beforeEach(() => {
  delete process.env.AI_API_KEY;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (savedKey === undefined) delete process.env.AI_API_KEY;
  else process.env.AI_API_KEY = savedKey;
});

describe('AI not configured', () => {
  it('reports not_configured instead of inventing a narrative', async () => {
    const report = await generateAiReport({ stats, sources, transactions: txs });
    assert.equal(report.status, 'not_configured');
    assert.equal(report.summary, null);
    assert.equal(report.model, null);
    assert.deepEqual(report.findings, []);
    assert.deepEqual(report.riskNotes, []);
  });

  it('explains exactly which variable is missing', async () => {
    const report = await generateAiReport({ stats, sources, transactions: txs });
    const text = report.limitations.join(' ');
    assert.match(text, /AI_API_KEY/);
  });

  it('states that the deterministic analysis is unaffected', async () => {
    const report = await generateAiReport({ stats, sources, transactions: txs });
    assert.match(report.limitations.join(' '), /deterministic/i);
  });

  it('never touches the network when unconfigured', async () => {
    let called = 0;
    globalThis.fetch = (async () => {
      called++;
      throw new Error('network must not be used');
    }) as typeof fetch;
    await generateAiReport({ stats, sources, transactions: txs });
    assert.equal(called, 0);
  });

  it('always carries the policy text', async () => {
    const report = await generateAiReport({ stats, sources, transactions: txs });
    assert.equal(report.policy, AI_POLICY);
    assert.match(AI_POLICY, /common ownership|common control|same person/i);
  });
});

describe('AI configured', () => {
  beforeEach(() => {
    process.env.AI_API_KEY = 'test-key-not-a-real-secret';
    process.env.AI_BASE_URL = 'https://ai.example.invalid/v1';
    process.env.AI_MODEL = 'test-model';
  });

  it('returns a generated report on a well-formed response', async () => {
    stubCompletion(validAiPayload());
    const report = await generateAiReport({ stats, sources, transactions: txs });
    assert.equal(report.status, 'generated');
    assert.equal(report.model, 'test-model');
    assert.equal(report.findings.length, 1);
    assert.ok(report.summary && report.summary.length > 0);
  });

  it('sends only derived statistics, never raw RPC payloads', async () => {
    const bodies = stubCompletion(validAiPayload());
    await generateAiReport({ stats, sources, transactions: txs });
    assert.equal(bodies.length, 1);
    const sent = JSON.stringify(bodies[0]);
    // The system prompt must be present…
    assert.match(sent, /NEVER state or imply that two addresses are controlled/);
    // …and no API key may leak into the request body.
    assert.equal(sent.includes('test-key-not-a-real-secret'), false);
  });

  it('strips statements that assert common ownership', async () => {
    stubCompletion(
      validAiPayload({
        summary: 'THESE TWO ADDRESSES ARE CONTROLLED BY THE SAME PERSON.',
        riskNotes: ['BOTH WALLETS ARE OWNED BY THE SAME OWNER.'],
      }),
    );
    const report = await generateAiReport({ stats, sources, transactions: txs });
    assert.equal(report.status, 'generated');
    const everything = [
      report.summary ?? '',
      ...report.riskNotes,
      ...report.findings.map((f) => `${f.title} ${f.detail} ${f.basis.join(' ')}`),
      ...report.limitations,
    ]
      .join(' ')
      .toLowerCase();
    for (const forbidden of ['controlled by the same person', 'owned by the same owner']) {
      assert.equal(everything.includes(forbidden), false, `unsanitised phrase survived: "${forbidden}"`);
    }
  });

  it('records that redaction happened in the limitations', async () => {
    stubCompletion(validAiPayload({ summary: 'THEY ARE CONTROLLED BY THE SAME ENTITY.' }));
    const report = await generateAiReport({ stats, sources, transactions: txs });
    assert.match(report.limitations.join(' '), /removed automatically|common ownership|common control/i);
  });

  it('drops fake transaction hashes the model invented', async () => {
    stubCompletion(
      validAiPayload({
        findings: [
          {
            title: 'HASH SANITISATION CHECK',
            detail: 'THE MODEL RETURNED ONE MALFORMED HASH AND ONE WELL-FORMED HASH.',
            confidence: 0.5,
            basis: ['b'],
            limitations: ['l'],
            sampleTxHashes: ['0xdeadbeef', `0x${'c'.repeat(64)}`],
          },
        ],
      }),
    );
    const report = await generateAiReport({ stats, sources, transactions: txs });
    assert.deepEqual(report.findings[0].sampleTxHashes, [`0x${'c'.repeat(64)}`]);
  });

  it('reports a provider HTTP error without pretending it worked', async () => {
    stubCompletion({}, 503);
    const report = await generateAiReport({ stats, sources, transactions: txs });
    assert.equal(report.status, 'failed');
    assert.equal(report.error?.code, 'AI_HTTP_503');
    assert.match(report.error?.message ?? '', /deterministic analysis is unaffected/i);
  });

  it('discards output that is not valid JSON', async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ choices: [{ message: { content: 'sorry, I cannot do that' } }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })) as unknown as typeof fetch;
    const report = await generateAiReport({ stats, sources, transactions: txs });
    assert.equal(report.status, 'failed');
    assert.equal(report.error?.code, 'AI_INVALID_JSON');
    assert.equal(report.summary, null, 'nothing from an unparseable response may be displayed');
  });

  it('discards output that does not match the schema', async () => {
    stubCompletion({ summary: 42, findings: 'nope' });
    const report = await generateAiReport({ stats, sources, transactions: txs });
    assert.equal(report.status, 'failed');
    assert.equal(report.error?.code, 'AI_SCHEMA_MISMATCH');
    assert.equal(report.summary, null);
  });

  it('reports a transport failure as failed, not as data', async () => {
    globalThis.fetch = (async () => {
      throw new TypeError('connection reset');
    }) as typeof fetch;
    const report = await generateAiReport({ stats, sources, transactions: txs });
    assert.equal(report.status, 'failed');
    assert.equal(report.error?.code, 'AI_REQUEST_FAILED');
  });

  it('always attaches at least one limitation to a finding', async () => {
    stubCompletion(
      validAiPayload({
        findings: [
          {
            title: 'FINDING WITHOUT LIMITATIONS',
            detail: 'THE MODEL OMITTED ITS OWN LIMITATIONS FOR THIS FINDING.',
            confidence: 0.5,
            basis: ['b'],
            limitations: [],
            sampleTxHashes: [],
          },
        ],
      }),
    );
    const report = await generateAiReport({ stats, sources, transactions: txs });
    assert.ok(report.findings[0].limitations.length > 0);
  });
});
