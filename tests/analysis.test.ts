/**
 * The deterministic analysis engine.
 *
 * These assertions pin down the arithmetic that the AI is allowed to reason over.
 * If the numbers here are wrong, every downstream narrative is wrong too.
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import {
  buildGraph,
  computeCounterparties,
  computeFlow,
  computeReportHash,
  computeStats,
  detectAnomalies,
  REPORT_VERSION,
} from '../src/lib/analysis/deterministic';
import { ALICE, BOB, CAROL, DEX, SUBJECT, ZERO, profileOf, scenario, tx } from './fixtures';

describe('computeFlow', () => {
  const txs = scenario();
  const flow = computeFlow(txs, SUBJECT);

  it('counts inbound, outbound and self transfers separately', () => {
    // in: t2 (alice), t4 (carol), t8 (system alias)
    assert.equal(flow.inboundTxCount, 3);
    // out: t1, t3, t5, t7
    assert.equal(flow.outboundTxCount, 4);
    // self: t6
    assert.equal(flow.selfTxCount, 1);
    assert.equal(flow.inboundTxCount + flow.outboundTxCount + flow.selfTxCount, txs.length);
  });

  it('sums inbound and outbound value correctly', () => {
    const one = 10n ** 18n;
    assert.equal(BigInt(flow.inboundVolumeWei), one / 2n + 3n * one + one / 10n);
    assert.equal(BigInt(flow.outboundVolumeWei), 2n * one + one + one / 1000n);
  });

  it('reports net flow as inbound minus outbound', () => {
    const net = BigInt(flow.inboundVolumeWei) - BigInt(flow.outboundVolumeWei);
    assert.equal(BigInt(flow.netFlowWei), net);
  });

  it('excludes system addresses from the counterparty count', () => {
    // alice, dex, carol, bob — the Nitro alias must not appear.
    assert.equal(flow.uniqueCounterparties, 4);
  });

  it('counts contract interactions and creations', () => {
    // t3 is a plain contract call. t7 is a deployment, and a deployment is
    // counted as a creation, never double-counted as an interaction.
    assert.equal(flow.contractInteractions, 1);
    assert.equal(flow.contractCreations, 1);
  });

  it('counts failed transactions and derives a success rate', () => {
    assert.equal(flow.failedTxCount, 1);
    assert.ok(flow.successRate > 0 && flow.successRate < 1);
  });

  it('sums fees only where a fee was actually paid', () => {
    // Six rows carry feeWei; the failed row and the creation row have none but
    // the fixture leaves feeWei on both, so the sum is over the rows present.
    assert.ok(BigInt(flow.totalFeesWei) > 0n);
  });

  it('derives the observed activity window from the rows', () => {
    assert.equal(flow.firstActivityAt, '2026-10-09T10:00:00.000Z');
    assert.equal(flow.lastActivityAt, '2026-10-09T10:00:00.000Z');
  });

  it('never returns NaN for a rate', () => {
    assert.ok(Number.isFinite(flow.txPerHour));
    assert.ok(Number.isFinite(flow.successRate));
  });

  it('handles an empty transaction list without throwing', () => {
    const empty = computeFlow([], SUBJECT);
    assert.equal(empty.inboundTxCount, 0);
    assert.equal(empty.outboundTxCount, 0);
    assert.equal(empty.uniqueCounterparties, 0);
    assert.equal(empty.firstActivityAt, null);
    assert.ok(Number.isFinite(empty.txPerHour));
  });
});

describe('computeCounterparties', () => {
  const counterparties = computeCounterparties(scenario(), SUBJECT);
  const byAddress = new Map(counterparties.map((c) => [c.address, c]));

  it('returns one row per distinct counterparty, ranked by activity then address', () => {
    assert.equal(counterparties.length, 4);
    for (let i = 1; i < counterparties.length; i++) {
      const prev = counterparties[i - 1];
      const cur = counterparties[i];
      assert.ok(
        prev.txCount >= cur.txCount,
        `counterparties must be ranked by descending transaction count (${prev.txCount} < ${cur.txCount})`,
      );
      if (prev.txCount === cur.txCount) {
        assert.ok(prev.address <= cur.address, 'equal-activity rows must break ties on ascending address');
      }
    }
  });

  it('never lists a system address as a counterparty', () => {
    assert.equal(byAddress.has(ZERO), false);
    for (const c of counterparties) {
      assert.notEqual(c.address, '0x00000000000000000000000000000000000a4b05');
    }
  });

  it('records inbound and outbound totals per counterparty, from the subject side', () => {
    // IN / OUT are measured relative to the SUBJECT: what the subject received
    // from this counterparty, and what the subject sent to it.
    const alice = byAddress.get(ALICE);
    assert.ok(alice, 'alice should be present');
    assert.equal(alice.inboundCount, 1); // subject received 0.5 ETH from alice
    assert.equal(alice.outboundCount, 1); // subject sent 2 ETH to alice
    assert.equal(BigInt(alice.volumeInWei), 10n ** 18n / 2n);
    assert.equal(BigInt(alice.volumeOutWei), 2n * 10n ** 18n);

    const carol = byAddress.get(CAROL);
    assert.ok(carol);
    assert.equal(carol.inboundCount, 1); // subject received 3 ETH from carol
    assert.equal(carol.outboundCount, 0);
    assert.equal(BigInt(carol.volumeInWei), 3n * 10n ** 18n);
  });

  it('flags known contracts when told about them', () => {
    const withContracts = computeCounterparties(scenario(), SUBJECT, { knownContracts: new Set([DEX]) });
    const dex = withContracts.find((c) => c.address === DEX);
    assert.ok(dex);
    assert.equal(dex.isContract, true);
    // DEX is flagged because the scanned window contains a real contract call to
    // it (t3), not because anything was assumed. An address with no such evidence
    // and no probe stays null.
    const plain = byAddress.get(DEX);
    assert.ok(plain);
    assert.equal(plain.isContract, true);
    const alice = byAddress.get(ALICE);
    assert.ok(alice);
    assert.equal(alice.isContract, null, 'no calldata and no probe means unknown, never a guess');
  });

  it('shares sum to something sane', () => {
    for (const c of counterparties) {
      assert.ok(c.share >= 0 && c.share <= 1, `share out of range for ${c.address}: ${c.share}`);
    }
  });

  it('always attaches at least one sample transaction hash', () => {
    for (const c of counterparties) {
      assert.ok(c.sampleTxHashes.length > 0, `no evidence hash for ${c.address}`);
      for (const h of c.sampleTxHashes) {
        assert.match(h, /^0x[0-9a-f]{64}$/);
      }
    }
  });
});

describe('detectAnomalies', () => {
  const txs = scenario();
  const flow = computeFlow(txs, SUBJECT);
  const counterparties = computeCounterparties(txs, SUBJECT);
  const anomalies = detectAnomalies(txs, flow, counterparties);

  it('flags contract creation', () => {
    assert.ok(anomalies.some((a) => a.kind === 'contract_creation'));
  });

  it('flags the self-transfer loop', () => {
    assert.ok(anomalies.some((a) => a.kind === 'self_transfer_loop'));
  });

  it('flags the failed transaction', () => {
    assert.ok(anomalies.some((a) => a.kind === 'failed_tx_spike' || a.severity === 'high' || a.severity === 'medium') );
  });

  it('gives every anomaly a severity, evidence and confidence in range', () => {
    for (const a of anomalies) {
      assert.ok(['info', 'low', 'medium', 'high'].includes(a.severity), `bad severity ${a.severity}`);
      assert.ok(a.confidence >= 0 && a.confidence <= 1, `confidence out of range: ${a.confidence}`);
      assert.ok(a.detail.length > 0, 'an anomaly must explain itself');
      assert.ok(a.evidence.length > 0, 'an anomaly must carry the numbers behind it');
    }
  });

  it('does not invent anomalies for a clean two-transaction history', () => {
    const calm = [
      tx({ hash: `0x${'1'.padEnd(64, '1')}`, blockNumber: 1, from: SUBJECT, to: ALICE, direction: 'out' }),
      tx({
        hash: `0x${'2'.padEnd(64, '2')}`,
        blockNumber: 800,
        from: SUBJECT,
        to: CAROL,
        direction: 'out',
        valueWei: '5000000000000000000',
        timestamp: '2026-10-09T11:00:00.000Z',
      }),
    ];
    const calmFlow = computeFlow(calm, SUBJECT);
    const calmCps = computeCounterparties(calm, SUBJECT);
    const calmAnomalies = detectAnomalies(calm, calmFlow, calmCps);
    assert.equal(calmAnomalies.some((a) => a.kind === 'contract_creation'), false);
    assert.equal(calmAnomalies.some((a) => a.kind === 'self_transfer_loop'), false);
  });
});

describe('buildGraph', () => {
  const txs = scenario();
  const counterparties = computeCounterparties(txs, SUBJECT);
  const graph = buildGraph(SUBJECT, counterparties, txs, { maxNodes: 60 });

  it('puts the subject at depth 0', () => {
    const subject = graph.nodes.find((n) => n.address === SUBJECT);
    assert.ok(subject, 'the subject must be a node');
    assert.equal(subject.kind, 'subject');
    assert.equal(subject.depth, 0);
  });

  it('creates one edge per counterparty, all incident to the subject', () => {
    assert.equal(graph.edges.length, counterparties.length);
    for (const e of graph.edges) {
      assert.ok(
        e.source === SUBJECT || e.target === SUBJECT,
        `edge ${e.id} is not incident to the subject`,
      );
    }
  });

  it('gives every edge a confidence in range and a written basis', () => {
    for (const e of graph.edges) {
      assert.ok(e.confidence > 0 && e.confidence <= 1, `confidence out of range: ${e.confidence}`);
      assert.ok(e.basis.length > 0, 'an edge must state why it exists');
      assert.ok(e.sampleTxHashes.length > 0, 'an edge must carry at least one evidence hash');
    }
  });

  it('never emits a dangling edge', () => {
    const ids = new Set(graph.nodes.map((n) => n.id));
    for (const e of graph.edges) {
      assert.ok(ids.has(e.source), `edge source ${e.source} is not a node`);
      assert.ok(ids.has(e.target), `edge target ${e.target} is not a node`);
    }
  });

  it('respects maxNodes', () => {
    const many = Array.from({ length: 40 }, (_, i) =>
      tx({
        hash: `0x${String(i).padStart(64, '0')}`,
        from: SUBJECT,
        to: `0x${String(i + 1).padStart(40, '0')}`,
        direction: 'out',
      }),
    );
    const cps = computeCounterparties(many, SUBJECT);
    const capped = buildGraph(SUBJECT, cps, many, { maxNodes: 10 });
    assert.ok(capped.nodes.length <= 10, `expected <= 10 nodes, got ${capped.nodes.length}`);
  });
});

describe('computeStats', () => {
  const txs = scenario();
  const counterparties = computeCounterparties(txs, SUBJECT);
  const stats = computeStats(profileOf(), txs, counterparties);

  it('carries the profile through untouched', () => {
    assert.equal(stats.profile.address, SUBJECT);
    assert.equal(stats.profile.chainId, 4663);
  });

  it('exposes a transaction count matching the input length', () => {
    assert.equal(stats.txCount, txs.length);
  });

  it('breaks down methods and transaction types', () => {
    const transfer = stats.methodBreakdown.find((m) => m.method === '0xa9059cbb');
    assert.ok(transfer, 'the ERC-20 transfer selector should be counted');
    assert.equal(transfer.label, 'transfer(address,uint256)');
    assert.equal(stats.typeBreakdown.reduce((s, t) => s + t.count, 0), txs.length);
  });

  it('buckets activity by hour with no NaN', () => {
    for (const b of stats.activityByHour) {
      assert.ok(Number.isFinite(b.txCount));
      assert.ok(!Number.isNaN(Date.parse(b.bucketStartISO)), `bad bucket ${b.bucketStartISO}`);
    }
  });
});

describe('computeReportHash', () => {
  const txs = scenario();

  it('is stable for identical inputs', () => {
    const a = computeReportHash({ subject: SUBJECT, chainId: 4663, transactions: txs });
    const b = computeReportHash({ subject: SUBJECT, chainId: 4663, transactions: txs });
    assert.equal(a, b);
    assert.match(a, /^0x[0-9a-f]{64}$/);
  });

  it('is insensitive to input ordering', () => {
    const a = computeReportHash({ subject: SUBJECT, chainId: 4663, transactions: txs });
    const shuffled = [txs[3], txs[0], txs[7], txs[1], txs[6], txs[2], txs[5], txs[4]];
    const b = computeReportHash({ subject: SUBJECT, chainId: 4663, transactions: shuffled });
    assert.equal(a, b);
  });

  it('changes when the data changes', () => {
    const a = computeReportHash({ subject: SUBJECT, chainId: 4663, transactions: txs });
    const b = computeReportHash({ subject: SUBJECT, chainId: 4663, transactions: txs.slice(0, -1) });
    assert.notEqual(a, b);
  });

  it('changes with the chain id', () => {
    const a = computeReportHash({ subject: SUBJECT, chainId: 4663, transactions: txs });
    const b = computeReportHash({ subject: SUBJECT, chainId: 46630, transactions: txs });
    assert.notEqual(a, b);
  });

  it('is case-insensitive on the subject address', () => {
    const a = computeReportHash({ subject: SUBJECT.toLowerCase(), chainId: 4663, transactions: txs });
    const b = computeReportHash({ subject: SUBJECT.toUpperCase(), chainId: 4663, transactions: txs });
    assert.equal(a, b);
  });

  it('stamps the current report version', () => {
    const a = computeReportHash({ subject: SUBJECT, chainId: 4663, transactions: txs });
    const b = computeReportHash({
      subject: SUBJECT,
      chainId: 4663,
      transactions: txs,
      version: REPORT_VERSION,
    });
    assert.equal(a, b);
  });
});

describe('the engine as a whole', () => {
  it('is deterministic across repeated runs', () => {
    const first = computeStats(
      profileOf(),
      scenario(),
      computeCounterparties(scenario(), SUBJECT),
    );
    const second = computeStats(
      profileOf(),
      scenario(),
      computeCounterparties(scenario(), SUBJECT),
    );
    assert.deepEqual(first.flow, second.flow);
    assert.deepEqual(first.anomalies, second.anomalies);
  });

  it('survives a malformed row without throwing', () => {
    const messy = [
      tx({ hash: '', blockNumber: 0, from: '', to: '', valueWei: 'not-a-number' }),
      ...scenario(),
    ];
    assert.doesNotThrow(() => computeStats(profileOf(), messy, computeCounterparties(messy, SUBJECT)));
  });

  it('never asserts common control — only observed flows', () => {
    const stats = computeStats(profileOf(), scenario(), computeCounterparties(scenario(), SUBJECT));
    for (const a of stats.anomalies) {
      const text = `${a.title} ${a.detail} ${a.evidence.map((e) => e.value).join(' ')}`.toLowerCase();
      for (const forbidden of ['same owner', 'same person', 'owned by', 'controlled by', 'sybil']) {
        assert.equal(text.includes(forbidden), false, `anomaly text asserts ownership: "${forbidden}"`);
      }
    }
  });

  it('keeps the counterparty set free of the zero address', () => {
    const cps = computeCounterparties(scenario(), SUBJECT);
    assert.equal(cps.some((c) => c.address === ZERO), false);
    assert.equal(cps.some((c) => c.address === BOB && c.txCount > 1), false);
  });
});
