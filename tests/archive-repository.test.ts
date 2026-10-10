/**
 * Archive repository.
 *
 * With no DATABASE_URL the product must still work — the in-memory adapter is
 * the fallback, and the UI is told it is volatile rather than durable. These
 * tests pin that contract down.
 */

import { strict as assert } from 'node:assert';
import { before, describe, it } from 'node:test';

import { formatNetFlow, getRepository, type ArchiveRepo } from '../src/lib/db/repository';

const SUBJECT = '0x1111111111111111111111111111111111111111';
const OTHER = '0x2222222222222222222222222222222222222222';
const HASH_A = `0x${'a'.repeat(64)}`;
const HASH_B = `0x${'b'.repeat(64)}`;

let repo: ArchiveRepo;

function baseRecord(over: Partial<Parameters<ArchiveRepo['create']>[0]> = {}) {
  return {
    subject: SUBJECT,
    chainKey: 'robinhood',
    chainId: 4663,
    reportHash: HASH_A,
    reportVersion: 'gp-1.0.0',
    label: 'First look',
    metadataCid: null,
    attestation: {
      status: 'not_deployed' as const,
      txHash: null,
      explorerUrl: null,
      contractAddress: null,
      chainId: 4663,
      submittedAt: null,
    },
    summary: { txCount: 8, counterparties: 4, anomalyCount: 2, netFlowWei: '1000' },
    ...over,
  };
}

before(async () => {
  const saved = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  repo = await getRepository();
  if (saved !== undefined) process.env.DATABASE_URL = saved;
});

describe('repository selection', () => {
  it('falls back to the in-memory driver when no database is configured', () => {
    assert.equal(repo.driver, 'memory');
  });
});

describe('create', () => {
  it('assigns an id and a creation timestamp', async () => {
    const rec = await repo.create(baseRecord({ label: 'create-test' }));
    assert.ok(rec.id.length > 0, 'a record must get an id');
    assert.ok(!Number.isNaN(Date.parse(rec.createdAt)), 'createdAt must be a valid date');
  });

  it('preserves the report hash so it can be checked against the chain', async () => {
    const rec = await repo.create(baseRecord({ reportHash: HASH_B, label: 'hash-test' }));
    const fetched = await repo.get(rec.id);
    assert.ok(fetched);
    assert.equal(fetched.reportHash, HASH_B);
    assert.equal(fetched.reportVersion, 'gp-1.0.0');
  });

  it('starts an attestation in not_deployed rather than pretending it is live', async () => {
    const rec = await repo.create(baseRecord({ label: 'attest-test' }));
    assert.equal(rec.attestation.status, 'not_deployed');
    assert.equal(rec.attestation.txHash, null);
  });

  it('gives every record a distinct id', async () => {
    const a = await repo.create(baseRecord({ label: 'id-a' }));
    const b = await repo.create(baseRecord({ label: 'id-b' }));
    assert.notEqual(a.id, b.id);
  });
});

describe('get', () => {
  it('returns null for an unknown id instead of throwing', async () => {
    assert.equal(await repo.get('does-not-exist'), null);
  });

  it('round-trips the record it just stored', async () => {
    const created = await repo.create(baseRecord({ label: 'roundtrip', subject: OTHER }));
    const found = await repo.get(created.id);
    assert.ok(found);
    assert.equal(found.subject, OTHER);
    assert.equal(found.label, 'roundtrip');
  });
});

describe('list', () => {
  it('filters by subject substring, case-insensitively', async () => {
    const items = await repo.list({ subject: SUBJECT.slice(2, 10).toUpperCase() });
    assert.ok(items.length > 0);
    for (const i of items) assert.equal(i.subject.toLowerCase().includes(SUBJECT.slice(2, 10).toLowerCase()), true);
  });

  it('filters by chain key', async () => {
    const items = await repo.list({ chainKey: 'robinhood' });
    for (const i of items) assert.equal(i.chainKey, 'robinhood');
  });

  it('filters by attestation status', async () => {
    const items = await repo.list({ attestationStatus: 'not_deployed' });
    for (const i of items) assert.equal(i.attestation.status, 'not_deployed');
  });

  it('honours the limit', async () => {
    const items = await repo.list({ limit: 1 });
    assert.ok(items.length <= 1);
  });

  it('sorts newest first', async () => {
    const items = await repo.list({ limit: 50 });
    for (let i = 1; i < items.length; i++) {
      assert.ok(items[i - 1].createdAt >= items[i].createdAt, 'list must be newest-first');
    }
  });
});

describe('updateAttestation', () => {
  it('records a submitted transaction hash', async () => {
    const created = await repo.create(baseRecord({ label: 'att-update' }));
    const updated = await repo.updateAttestation(created.id, {
      status: 'pending',
      txHash: `0x${'c'.repeat(64)}`,
      submittedAt: '2026-10-09T09:30:00.000Z',
    });
    assert.ok(updated);
    assert.equal(updated.attestation.status, 'pending');
    assert.equal(updated.attestation.txHash, `0x${'c'.repeat(64)}`);

    const reread = await repo.get(created.id);
    assert.equal(reread?.attestation.txHash, `0x${'c'.repeat(64)}`);
  });

  it('returns null for an unknown id', async () => {
    assert.equal(await repo.updateAttestation('nope', { status: 'failed' }), null);
  });
});

describe('stats', () => {
  it('reports counts without inventing numbers', async () => {
    const stats = await repo.stats();
    assert.ok(Number.isInteger(stats.archives));
    assert.ok(Number.isInteger(stats.analyses));
    assert.ok(Number.isInteger(stats.wallets));
    assert.ok(Number.isInteger(stats.transactions));
    assert.ok(stats.archives >= 0);
  });
});

describe('formatNetFlow', () => {
  it('prefixes an outflow with a minus sign', () => {
    assert.equal(formatNetFlow((-1n * 10n ** 18n).toString()), '-1 ETH');
  });

  it('prefixes an inflow with a plus sign', () => {
    assert.equal(formatNetFlow((2n * 10n ** 18n).toString()), '+2 ETH');
  });

  it('handles zero without a sign flip', () => {
    assert.equal(formatNetFlow('0'), '+0 ETH');
  });
});
