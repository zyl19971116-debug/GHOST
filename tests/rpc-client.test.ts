/**
 * RPC client behaviour.
 *
 * The interesting cases are the ones measured live against the Robinhood Chain
 * public endpoint on 2026-10-09: transient HTTP 403 bot-challenges that a single
 * retry gets past, sustained 403s that must trip a real cooldown, and 429s from
 * batching too aggressively. All of them are reproduced here with a stubbed
 * `fetch` so the suite needs no network.
 */

import { strict as assert } from 'node:assert';
import { afterEach, describe, it } from 'node:test';

import {
  RpcClient,
  RpcError,
  describeRpcError,
  getRpcClient,
  type RpcClientOptions,
} from '../src/lib/data/rpc';

const originalFetch = globalThis.fetch;

interface StubCall {
  url: string;
  body: unknown;
  headers: Record<string, string>;
}

function stubFetch(handler: (call: StubCall, index: number) => Response | Promise<Response>) {
  const calls: StubCall[] = [];
  globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
    const call: StubCall = {
      url: String(input),
      body: init?.body ? JSON.parse(String(init.body)) : null,
      headers: (init?.headers as Record<string, string>) ?? {},
    };
    calls.push(call);
    return handler(call, calls.length - 1);
  }) as unknown as typeof fetch;
  return calls;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function challenge() {
  return new Response(
    '<!DOCTYPE html><html><head><title>Just a moment...</title></head><body>cf-chl challenge-platform</body></html>',
    { status: 403, headers: { 'content-type': 'text/html' } },
  );
}

function makeOptions(overrides: Partial<RpcClientOptions> = {}): RpcClientOptions {
  return {
    url: 'https://rpc.example.invalid',
    label: 'test @ rpc.example.invalid',
    timeoutMs: 5_000,
    maxRetries: 2,
    maxConcurrency: 4,
    cacheTtlMs: 1_000,
    edgeCooldownMs: 25_000,
    edgeRetryDelayMs: 5, // keeps the suite fast
    edgeChallengeTolerance: 3,
    rateLimitCooldownMs: 10_000,
    ...overrides,
  };
}

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('describeRpcError', () => {
  it('maps an edge challenge to UPSTREAM_EDGE_BLOCKED', () => {
    const d = describeRpcError(new RpcError('edge_blocked', 'x'));
    assert.equal(d.code, 'UPSTREAM_EDGE_BLOCKED');
    assert.match(d.message, /provider-side protection/i);
  });

  it('maps a timeout', () => {
    assert.equal(describeRpcError(new RpcError('timeout', 'x')).code, 'UPSTREAM_TIMEOUT');
  });

  it('maps a 429 and tells the operator what to do', () => {
    const d = describeRpcError(new RpcError('rate_limited', 'x'));
    assert.equal(d.code, 'UPSTREAM_RATE_LIMITED');
    assert.match(d.message, /RPC/);
  });

  it('maps an arbitrary throwable to UNKNOWN_ERROR', () => {
    assert.equal(describeRpcError(new Error('boom')).code, 'UNKNOWN_ERROR');
    assert.equal(describeRpcError('boom').code, 'UNKNOWN_ERROR');
  });
});

describe('RpcClient.call', () => {
  it('returns the parsed result of a successful call', async () => {
    stubFetch(() => json({ jsonrpc: '2.0', id: 1, result: '0x10' }));
    const client = new RpcClient(makeOptions());
    assert.equal(await client.call<string>('eth_blockNumber', []), '0x10');
  });

  it('surfaces a JSON-RPC level error as rpc_error', async () => {
    stubFetch(() => json({ jsonrpc: '2.0', id: 1, error: { code: -32601, message: 'method not found' } }));
    const client = new RpcClient(makeOptions({ maxRetries: 0 }));
    await assert.rejects(
      () => client.call('eth_foo', []),
      (err: unknown) => {
        assert.ok(err instanceof RpcError);
        assert.equal(err.kind, 'rpc_error');
        return true;
      },
    );
  });

  it('never sends a browser-like user-agent', async () => {
    // Sending one flips the Robinhood Chain edge into serving a JS challenge.
    const calls = stubFetch(() => json({ jsonrpc: '2.0', id: 1, result: '0x1' }));
    const client = new RpcClient(makeOptions());
    await client.call('eth_blockNumber', []);
    const headers = Object.fromEntries(
      Object.entries(calls[0].headers).map(([k, v]) => [k.toLowerCase(), v]),
    );
    assert.equal(headers['user-agent'], undefined);
  });

  it('rejects a non-JSON body as invalid_response', async () => {
    stubFetch(() => new Response('<html>nope</html>', { status: 200 }));
    const client = new RpcClient(makeOptions({ maxRetries: 0 }));
    await assert.rejects(
      () => client.call('eth_blockNumber', []),
      (err: unknown) => {
        assert.ok(err instanceof RpcError);
        assert.equal(err.kind, 'invalid_response');
        return true;
      },
    );
  });

  it('retries a transient 500 and then succeeds', async () => {
    const calls = stubFetch((_c, i) =>
      i === 0 ? new Response('upstream exploded', { status: 500 }) : json({ jsonrpc: '2.0', id: 1, result: '0x2' }),
    );
    const client = new RpcClient(makeOptions({ maxRetries: 2 }));
    assert.equal(await client.call<string>('eth_blockNumber', []), '0x2');
    assert.equal(calls.length, 2);
  });

  it('does not retry a hard 400', async () => {
    const calls = stubFetch(() => new Response('bad request', { status: 400 }));
    const client = new RpcClient(makeOptions({ maxRetries: 3 }));
    await assert.rejects(() => client.call('eth_blockNumber', []));
    assert.equal(calls.length, 1, 'a non-retryable status must not be retried');
  });
});

describe('RpcClient edge-challenge handling', () => {
  it('recovers from a single transient 403 with one retry', async () => {
    const calls = stubFetch((_c, i) =>
      i === 0 ? challenge() : json({ jsonrpc: '2.0', id: 1, result: '0xabc' }),
    );
    const client = new RpcClient(makeOptions({ maxRetries: 2 }));
    assert.equal(await client.call<string>('eth_blockNumber', []), '0xabc');
    assert.equal(calls.length, 2, 'the retry is expected and documented');
    assert.equal(client.coolingDown, false, 'a recovered challenge must not leave a hard cooldown');
  });

  it('trips a hard cooldown after sustained challenges', async () => {
    stubFetch(() => challenge());
    const client = new RpcClient(makeOptions({ maxRetries: 4, edgeChallengeTolerance: 3 }));
    await assert.rejects(() => client.call('eth_blockNumber', []));
    assert.equal(client.coolingDown, true, 'sustained blocking must trip the breaker');
    assert.ok(client.cooldownRemainingMs > 0);
  });

  it('fails fast while cooling down instead of hammering the endpoint', async () => {
    let served = 0;
    stubFetch(() => {
      served++;
      return challenge();
    });
    const client = new RpcClient(makeOptions({ maxRetries: 4, edgeChallengeTolerance: 2 }));
    await assert.rejects(() => client.call('eth_blockNumber', []));
    const afterFirst = served;
    assert.ok(afterFirst > 0);

    // A second call while the breaker is open must not touch the network.
    await assert.rejects(() => client.call('eth_blockNumber', []));
    assert.equal(served, afterFirst, 'no request may be sent during cooldown');
  });

  it('reports a cooling-down endpoint as an edge_blocked error, not as missing data', async () => {
    stubFetch(() => challenge());
    const client = new RpcClient(makeOptions({ maxRetries: 4, edgeChallengeTolerance: 1 }));
    await assert.rejects(() => client.call('eth_blockNumber', []));
    await assert.rejects(
      () => client.call('eth_blockNumber', []),
      (err: unknown) => {
        assert.ok(err instanceof RpcError);
        assert.equal(describeRpcError(err).code, 'UPSTREAM_EDGE_BLOCKED');
        return true;
      },
    );
  });

  it('trips the rate-limit breaker on a 429', async () => {
    stubFetch(() => new Response('slow down', { status: 429 }));
    const client = new RpcClient(makeOptions({ maxRetries: 4 }));
    await assert.rejects(() => client.call('eth_blockNumber', []));
    assert.equal(client.coolingDown, true);
  });
});

describe('RpcClient caching', () => {
  it('serves a repeated call from cache', async () => {
    const calls = stubFetch(() => json({ jsonrpc: '2.0', id: 1, result: '0x1' }));
    const client = new RpcClient(makeOptions({ cacheTtlMs: 10_000 }));
    await client.callCached('eth_blockNumber', []);
    await client.callCached('eth_blockNumber', []);
    assert.equal(calls.length, 1);
    assert.equal(client.getStats().cacheHits, 1);
  });

  it('keys the cache on params, not just the method', async () => {
    const calls = stubFetch(() => json({ jsonrpc: '2.0', id: 1, result: '0x1' }));
    const client = new RpcClient(makeOptions({ cacheTtlMs: 10_000 }));
    await client.callCached('eth_getBlockByNumber', ['0x1']);
    await client.callCached('eth_getBlockByNumber', ['0x2']);
    assert.equal(calls.length, 2);
  });

  it('de-duplicates concurrent identical reads', async () => {
    let inFlight = 0;
    let peak = 0;
    stubFetch(async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 10));
      inFlight--;
      return json({ jsonrpc: '2.0', id: 1, result: '0x1' });
    });
    const client = new RpcClient(makeOptions({ cacheTtlMs: 10_000 }));
    await Promise.all([
      client.callCached('eth_blockNumber', []),
      client.callCached('eth_blockNumber', []),
      client.callCached('eth_blockNumber', []),
    ]);
    assert.equal(peak, 1, 'three concurrent identical reads must collapse into one request');
  });

  it('bypasses the cache for an uncached call', async () => {
    const calls = stubFetch(() => json({ jsonrpc: '2.0', id: 1, result: '0x1' }));
    const client = new RpcClient(makeOptions());
    await client.call('eth_blockNumber', []);
    await client.call('eth_blockNumber', []);
    assert.equal(calls.length, 2);
  });
});

describe('RpcClient.batch', () => {
  it('chunks the batch to the requested size', async () => {
    const calls = stubFetch((c) => {
      const items = Array.isArray(c.body) ? c.body : [c.body];
      return json(items.map((item: { id: number }) => ({ jsonrpc: '2.0', id: item.id, result: `0x${item.id}` })));
    });
    const client = new RpcClient(makeOptions());
    const requests = Array.from({ length: 25 }, () => ({ method: 'eth_blockNumber', params: [] }));
    const out = await client.batch<string>(requests, 10);
    assert.equal(calls.length, 3, '25 requests at 10 per batch = 3 HTTP calls');
    assert.equal(out.length, 25);
    assert.equal(out[0], '0x0');
  });

  it('returns null for an individual item that errored instead of failing the batch', async () => {
    stubFetch(() =>
      json([
        { jsonrpc: '2.0', id: 0, result: '0x1' },
        { jsonrpc: '2.0', id: 1, error: { code: -32000, message: 'nope' } },
        { jsonrpc: '2.0', id: 2, result: '0x3' },
      ]),
    );
    const client = new RpcClient(makeOptions());
    const out = await client.batch<string>(
      [
        { method: 'a', params: [] },
        { method: 'b', params: [] },
        { method: 'c', params: [] },
      ],
      10,
    );
    assert.deepEqual(out, ['0x1', null, '0x3']);
  });

  it('fills nulls when the upstream returns something that is not an array', async () => {
    stubFetch(() => json({ jsonrpc: '2.0', id: 1, result: 'unexpected' }));
    const client = new RpcClient(makeOptions());
    const out = await client.batch<string>(
      [
        { method: 'a', params: [] },
        { method: 'b', params: [] },
      ],
      10,
    );
    assert.deepEqual(out, [null, null]);
  });
});

describe('RpcClient concurrency gate', () => {
  it('never exceeds maxConcurrency in-flight requests', async () => {
    let inFlight = 0;
    let peak = 0;
    stubFetch(async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return json({ jsonrpc: '2.0', id: 1, result: '0x1' });
    });
    const client = new RpcClient(makeOptions({ maxConcurrency: 2, cacheTtlMs: 0 }));
    await Promise.all(
      Array.from({ length: 10 }, (_, i) => client.call('eth_getBlockByNumber', [`0x${i}`])),
    );
    assert.ok(peak <= 2, `peak concurrency was ${peak}, expected <= 2`);
  });
});

describe('getRpcClient registry', () => {
  it('returns the same instance for the same URL', () => {
    const limits = { rpcTimeoutMs: 1000, rpcMaxRetries: 1, rpcMaxConcurrency: 2, cacheTtlSeconds: 30 };
    const a = getRpcClient('https://rpc.dedupe.invalid', limits, 'Dedupe');
    const b = getRpcClient('https://rpc.dedupe.invalid', limits, 'Dedupe');
    assert.equal(a, b);
  });

  it('returns distinct instances for distinct URLs', () => {
    const limits = { rpcTimeoutMs: 1000, rpcMaxRetries: 1, rpcMaxConcurrency: 2, cacheTtlSeconds: 30 };
    const a = getRpcClient('https://rpc.one.invalid', limits, 'One');
    const b = getRpcClient('https://rpc.two.invalid', limits, 'Two');
    assert.notEqual(a, b);
  });
});
