/**
 * API boundary: rate limiting, request schemas and the honest error envelope.
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { checkRateLimit, clientKey } from '../src/lib/rate-limit';
import {
  ADDRESS_RE,
  CHAIN_KEY_RE,
  analyzeInputSchema,
  archiveCreateSchema,
  attestationSchema,
  parseBody,
  networkGraphInputSchema,
  walletLookupSchema,
} from '../src/lib/http';
import { getCapabilityReport, getPublicConfig, getServerConfig } from '../src/lib/config';

const GOOD = '0x1111111111111111111111111111111111111111';

describe('rate limiter', () => {
  it('allows up to the configured maximum then refuses', () => {
    const max = getServerConfig().limits.apiRateLimitMax;
    const key = `test:allow:${Date.now()}`;
    for (let i = 0; i < max; i++) {
      assert.equal(checkRateLimit(key).allowed, true, `request ${i + 1} should be allowed`);
    }
    assert.equal(checkRateLimit(key).allowed, false, 'the request past the limit must be refused');
  });

  it('reports remaining quota that never goes negative', () => {
    const max = getServerConfig().limits.apiRateLimitMax;
    const key = `test:remaining:${Date.now()}`;
    for (let i = 0; i < max + 5; i++) checkRateLimit(key);
    const { info } = checkRateLimit(key);
    assert.equal(info.remaining, 0);
    assert.equal(info.limit, max);
  });

  it('gives a reset timestamp in the future', () => {
    const key = `test:reset:${Date.now()}`;
    const now = Date.now();
    const { info } = checkRateLimit(key, now);
    assert.ok(Date.parse(info.resetAt) > now, 'resetAt must be after now');
  });

  it('slides the window — old hits expire', () => {
    const max = getServerConfig().limits.apiRateLimitMax;
    const windowMs = getServerConfig().limits.apiRateLimitWindowMs;
    const key = `test:slide:${Date.now()}`;
    const t0 = 1_000_000;
    for (let i = 0; i < max; i++) checkRateLimit(key, t0);
    assert.equal(checkRateLimit(key, t0).allowed, false);
    // One full window later the earlier hits have aged out.
    assert.equal(checkRateLimit(key, t0 + windowMs + 1).allowed, true);
  });

  it('keeps separate buckets per key', () => {
    const a = `test:iso-a:${Date.now()}`;
    const b = `test:iso-b:${Date.now()}`;
    const max = getServerConfig().limits.apiRateLimitMax;
    for (let i = 0; i < max; i++) checkRateLimit(a);
    assert.equal(checkRateLimit(a).allowed, false);
    assert.equal(checkRateLimit(b).allowed, true, 'one client must not exhaust another client budget');
  });
});

describe('clientKey', () => {
  function req(headers: Record<string, string>) {
    return new Request('http://localhost/api/test', { headers });
  }

  it('uses the first entry of x-forwarded-for', () => {
    assert.equal(clientKey(req({ 'x-forwarded-for': '203.0.113.9, 10.0.0.1' }), 'analyze'), 'analyze:203.0.113.9');
  });

  it('falls back to x-real-ip', () => {
    assert.equal(clientKey(req({ 'x-real-ip': '198.51.100.4' }), 'intel'), 'intel:198.51.100.4');
  });

  it('falls back to a local bucket when no header is present', () => {
    assert.equal(clientKey(req({}), 'archive'), 'archive:local');
  });

  it('scopes the key per route', () => {
    const headers = { 'x-real-ip': '198.51.100.4' };
    assert.notEqual(clientKey(req(headers), 'a'), clientKey(req(headers), 'b'));
  });
});

describe('request schemas', () => {
  it('accepts a valid analyze payload', () => {
    const parsed = analyzeInputSchema.safeParse({ chain: 'robinhood', address: GOOD });
    assert.equal(parsed.success, true);
  });

  it('rejects an address that is not 20 bytes of hex', () => {
    for (const bad of ['0x123', '', '0xzz', `${GOOD}00`, 'not-an-address']) {
      const parsed = analyzeInputSchema.safeParse({ chain: 'robinhood', address: bad });
      assert.equal(parsed.success, false, `"${bad}" should have been rejected`);
    }
  });

  it('rejects a chain key with characters that are not letters', () => {
    for (const bad of ['robin hood', 'robinhood;drop', '../../etc/passwd', 'a']) {
      const parsed = analyzeInputSchema.safeParse({ chain: bad, address: GOOD });
      assert.equal(parsed.success, false, `"${bad}" should have been rejected`);
    }
  });

  it('caps maxBlocks so a caller cannot request an unbounded scan', () => {
    assert.equal(analyzeInputSchema.safeParse({ chain: 'robinhood', address: GOOD, maxBlocks: 20_000 }).success, true);
    assert.equal(analyzeInputSchema.safeParse({ chain: 'robinhood', address: GOOD, maxBlocks: 20_001 }).success, false);
    assert.equal(analyzeInputSchema.safeParse({ chain: 'robinhood', address: GOOD, maxBlocks: 0 }).success, false);
  });

  it('caps maxTransactions', () => {
    assert.equal(analyzeInputSchema.safeParse({ chain: 'robinhood', address: GOOD, maxTransactions: 1_000 }).success, true);
    assert.equal(analyzeInputSchema.safeParse({ chain: 'robinhood', address: GOOD, maxTransactions: 5_000 }).success, false);
  });

  it('accepts an optional includeAi flag', () => {
    assert.equal(analyzeInputSchema.safeParse({ chain: 'robinhood', address: GOOD, includeAi: false }).success, true);
  });

  it('validates the wallet lookup payload', () => {
    assert.equal(walletLookupSchema.safeParse({ chain: 'robinhood', address: GOOD }).success, true);
    assert.equal(walletLookupSchema.safeParse({ chain: 'robinhood', address: '0x0' }).success, false);
  });

  it('accepts only bounded Robinhood mainnet graph requests', () => {
    assert.equal(networkGraphInputSchema.safeParse({ address: GOOD, chainId: 4663, depth: 1, limit: 100 }).success, true);
    assert.equal(networkGraphInputSchema.safeParse({ address: GOOD, chainId: 46630, depth: 1, limit: 100 }).success, false);
    assert.equal(networkGraphInputSchema.safeParse({ address: GOOD, chainId: 4663, depth: 3, limit: 100 }).success, false);
    assert.equal(networkGraphInputSchema.safeParse({ address: GOOD, chainId: 4663, depth: 2, limit: 101 }).success, false);
    assert.equal(networkGraphInputSchema.safeParse({ address: '0x0', chainId: 4663, depth: 1, limit: 10 }).success, false);
  });

  it('validates the archive creation payload', () => {
    const base = {
      subject: GOOD,
      chain: 'robinhood',
      reportHash: `0x${'a'.repeat(64)}`,
      reportVersion: 'gp-1.0.0',
      label: 'Watchlist entry',
    };
    assert.equal(archiveCreateSchema.safeParse(base).success, true);

    assert.equal(archiveCreateSchema.safeParse({ ...base, reportHash: '0xabc' }).success, false);
    assert.equal(archiveCreateSchema.safeParse({ ...base, label: '' }).success, false);
    assert.equal(archiveCreateSchema.safeParse({ ...base, subject: '0x1234' }).success, false);
    assert.equal(archiveCreateSchema.safeParse({ ...base, reportVersion: 'v'.repeat(33) }).success, false);

    const withSummary = archiveCreateSchema.safeParse({
      ...base,
      summary: { txCount: 8, counterparties: 4, anomalyCount: 2, netFlowWei: '-1000' },
    });
    assert.equal(withSummary.success, true);
  });

  it('validates the attestation payload', () => {
    const ok = attestationSchema.safeParse({
      status: 'confirmed',
      txHash: `0x${'b'.repeat(64)}`,
      chainId: 4663,
    });
    assert.equal(ok.success, true);

    assert.equal(attestationSchema.safeParse({ status: 'nonsense' }).success, false);
    assert.equal(
      attestationSchema.safeParse({ status: 'pending', txHash: '0x00' }).success,
      false,
    );
  });
});

describe('parseBody error envelope', () => {
  it('returns a structured 400 with an issue list', async () => {
    const out = parseBody(analyzeInputSchema, { chain: 'robinhood', address: 'nope' });
    assert.equal(out.ok, false);
    if (out.ok) return;
    assert.equal(out.response.status, 400);
    const body = (await out.response.json()) as { ok: boolean; error?: { code: string; message: string } };
    assert.equal(body.ok, false);
    assert.equal(body.error?.code, 'INVALID_INPUT');
    assert.ok((body.error?.message ?? '').length > 0);
  });

  it('passes a valid body through unchanged', () => {
    const out = parseBody(analyzeInputSchema, { chain: 'robinhood', address: GOOD });
    assert.equal(out.ok, true);
    if (!out.ok) return;
    assert.equal(out.value.address, GOOD);
  });
});

describe('regex guards', () => {
  it('ADDRESS_RE is anchored at both ends', () => {
    assert.match(GOOD, ADDRESS_RE);
    assert.doesNotMatch(`${GOOD}zz`, ADDRESS_RE);
    assert.doesNotMatch(`zz${GOOD}`, ADDRESS_RE);
  });

  it('CHAIN_KEY_RE rejects anything outside [a-zA-Z]', () => {
    assert.match('robinhood', CHAIN_KEY_RE);
    assert.doesNotMatch('robinhood1', CHAIN_KEY_RE);
    assert.doesNotMatch('a', CHAIN_KEY_RE);
  });
});

describe('configuration defaults', () => {
  it('boots with a usable public config and no environment variables', () => {
    const pub = getPublicConfig();
    assert.ok(pub.chains.length > 0);
    assert.ok(pub.chains.includes(pub.defaultChain));
  });

  it('reports the AI layer as unconfigured when no key is present', () => {
    const saved = process.env.AI_API_KEY;
    delete process.env.AI_API_KEY;
    try {
      assert.equal(getServerConfig().ai.configured, false);
      assert.equal(getCapabilityReport().ai.configured, false);
      assert.equal(getCapabilityReport().ai.model, null);
    } finally {
      if (saved !== undefined) process.env.AI_API_KEY = saved;
    }
  });

  it('falls back to the in-memory repository when no database is configured', () => {
    const saved = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    try {
      const report = getCapabilityReport();
      assert.equal(report.database.configured, false);
      assert.match(report.database.driver, /in-memory/i);
    } finally {
      if (saved !== undefined) process.env.DATABASE_URL = saved;
    }
  });

  it('never claims the registry is deployed when no address is set', () => {
    const saved = process.env.NEXT_PUBLIC_REGISTRY_ADDRESS;
    delete process.env.NEXT_PUBLIC_REGISTRY_ADDRESS;
    try {
      const report = getCapabilityReport();
      assert.equal(report.registry.configured, false);
      assert.equal(report.registry.address, null);
    } finally {
      if (saved !== undefined) process.env.NEXT_PUBLIC_REGISTRY_ADDRESS = saved;
    }
  });

  it('states the coverage limits of every enabled chain', () => {
    for (const chain of getCapabilityReport().chains) {
      assert.ok(chain.historyCoverage.length > 0, `${chain.key} has no coverage statement`);
      assert.ok(Array.isArray(chain.limitations));
    }
  });

  it('produces an ISO timestamp', () => {
    const report = getCapabilityReport();
    assert.ok(!Number.isNaN(Date.parse(report.generatedAt)));
  });
});
