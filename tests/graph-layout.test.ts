/**
 * Graph layout determinism.
 *
 * The layout must be a pure function of its input: the same graph has to render
 * identically on the server and on the client, or React hydration mismatches.
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { DEPTH_PALETTE, depthColor, layoutGraph } from '../src/lib/graph/layout';
import { buildGraph, computeCounterparties } from '../src/lib/analysis/deterministic';
import { SUBJECT, scenario, tx } from './fixtures';

function graphOf(seedCount = 6) {
  const txs = [
    ...scenario(),
    ...Array.from({ length: seedCount }, (_, i) =>
      tx({
        hash: `0x${String(i).padStart(64, 'x')}`,
        from: SUBJECT,
        to: `0x${String(i + 100).padStart(40, 'a')}`,
        direction: 'out',
        valueWei: String(BigInt(i + 1) * 10n ** 17n),
      }),
    ),
  ];
  return buildGraph(SUBJECT, computeCounterparties(txs, SUBJECT), txs, { maxNodes: 60 });
}

describe('layoutGraph', () => {
  const graph = graphOf();

  it('returns an empty array for an empty graph', () => {
    assert.deepEqual(layoutGraph([], [], { width: 800, height: 560 }), []);
  });

  it('lays out exactly the nodes it was given', () => {
    const laid = layoutGraph(graph.nodes, graph.edges, { width: 800, height: 560 });
    assert.equal(laid.length, graph.nodes.length);
    assert.deepEqual(
      new Set(laid.map((n) => n.address)),
      new Set(graph.nodes.map((n) => n.address)),
    );
  });

  it('is deterministic across repeated calls', () => {
    const a = layoutGraph(graph.nodes, graph.edges, { width: 800, height: 560 });
    const b = layoutGraph(graph.nodes, graph.edges, { width: 800, height: 560 });
    assert.deepEqual(a, b);
  });

  it('is independent of the input node ordering', () => {
    const shuffledNodes = [...graph.nodes].reverse();
    const a = layoutGraph(graph.nodes, graph.edges, { width: 800, height: 560 });
    const b = layoutGraph(shuffledNodes, graph.edges, { width: 800, height: 560 });
    const byAddress = (list: typeof a) => new Map(list.map((n) => [n.address, `${n.x},${n.y},${n.z}`]));
    assert.deepEqual(byAddress(a), byAddress(b));
  });

  it('produces only finite coordinates', () => {
    for (const n of layoutGraph(graph.nodes, graph.edges, { width: 800, height: 560 })) {
      assert.ok(Number.isFinite(n.x), `x is not finite for ${n.address}`);
      assert.ok(Number.isFinite(n.y), `y is not finite for ${n.address}`);
      assert.ok(Number.isFinite(n.z), `z is not finite for ${n.address}`);
    }
  });

  it('keeps every node inside the canvas bounds', () => {
    const width = 900;
    const height = 620;
    for (const n of layoutGraph(graph.nodes, graph.edges, { width, height })) {
      assert.ok(n.x >= 0 && n.x <= width, `x out of bounds (${n.x}) for ${n.address}`);
      assert.ok(n.y >= 0 && n.y <= height, `y out of bounds (${n.y}) for ${n.address}`);
    }
  });

  it('weights nodes in the 0..1 range', () => {
    for (const n of layoutGraph(graph.nodes, graph.edges, { width: 800, height: 560 })) {
      assert.ok(n.weight >= 0 && n.weight <= 1, `weight out of range: ${n.weight}`);
    }
  });

  it('places the subject at the centre of the canvas', () => {
    const laid = layoutGraph(graph.nodes, graph.edges, { width: 800, height: 560 });
    const subject = laid.find((n) => n.kind === 'subject');
    assert.ok(subject);
    assert.ok(Math.abs(subject.x - 400) < 1, `subject x=${subject.x}, expected ~400`);
    assert.ok(Math.abs(subject.y - 280) < 1, `subject y=${subject.y}, expected ~280`);
  });

  it('handles a single-node graph', () => {
    const single = layoutGraph([graph.nodes[0]], [], { width: 800, height: 560 });
    assert.equal(single.length, 1);
    assert.ok(Number.isFinite(single[0].x));
  });

  it('handles a huge node count without producing NaN', () => {
    const many = Array.from({ length: 200 }, (_, i) => ({
      ...graph.nodes[0],
      id: `n${i}`,
      address: `0x${String(i).padStart(40, '0')}`,
      kind: 'counterparty' as const,
      txCount: i + 1,
    }));
    const laid = layoutGraph(many, [], { width: 800, height: 560, iterations: 40 });
    assert.equal(laid.length, 200);
    for (const n of laid) assert.ok(Number.isFinite(n.x) && Number.isFinite(n.y));
  });
});

describe('depthColor', () => {
  it('returns a palette entry for depth 0..2', () => {
    assert.equal(depthColor(0), DEPTH_PALETTE[0]);
    assert.equal(depthColor(1), DEPTH_PALETTE[1]);
    assert.equal(depthColor(2), DEPTH_PALETTE[2]);
  });

  it('clamps deeper depths instead of returning undefined', () => {
    assert.equal(depthColor(9), DEPTH_PALETTE[2]);
    assert.equal(depthColor(-3), DEPTH_PALETTE[0]);
  });

  it('emits valid hex colours', () => {
    for (const c of DEPTH_PALETTE) assert.match(c, /^#[0-9A-Fa-f]{6}$/);
  });
});
