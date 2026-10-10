'use strict';

/**
 * Unit tests for AnalysisRegistry.
 *
 * Deliberately dependency-light: no chai-matchers, so the suite runs against
 * plain `hardhat-ethers` + `chai`. Custom-error assertions are decoded straight
 * from the contract ABI instead of relying on string matching.
 */

const { expect } = require('chai');
const hre = require('hardhat');

const { ethers } = hre;

const MAX_VERSION_LENGTH = 32;
const MAX_CID_LENGTH = 128;

const SAMPLE_HASH = ethers.keccak256(ethers.toUtf8Bytes('ghost-protocol:report:v1:{"txCount":42}'));

/** Build a Map<selector, errorName> straight from the compiled ABI. */
function errorSelectors(contract) {
  const map = new Map();
  for (const fragment of contract.interface.fragments) {
    if (fragment.type !== 'error') continue;
    map.set(contract.interface.getSighash(fragment), fragment.name);
  }
  return map;
}

/** Pull raw revert data out of an ethers v6 error, wherever it is hiding. */
function revertDataOf(err) {
  const seen = new Set();
  const stack = [err];
  while (stack.length) {
    const cur = stack.pop();
    if (!cur || typeof cur !== 'object' || seen.has(cur)) continue;
    seen.add(cur);
    if (typeof cur.data === 'string' && cur.data.startsWith('0x')) return cur.data;
    for (const key of ['info', 'error', 'value', 'cause', 'revert', 'originalError']) {
      if (cur[key]) stack.push(cur[key]);
    }
  }
  return null;
}

/**
 * Assert that a call reverts. When `expectedError` is given, also assert the
 * revert decoded to that custom error name.
 */
async function expectRevert(promise, expectedError, contract) {
  let caught = null;
  try {
    const result = await promise;
    // A `staticCall` on a reverting function may resolve to the raw error data
    // rather than throwing.
    caught = new Error('call unexpectedly succeeded');
    caught.data = typeof result === 'string' ? result : null;
    caught.__unexpectedSuccess = true;
  } catch (err) {
    caught = err;
  }

  const data = revertDataOf(caught);
  let decoded = null;
  if (data && contract) {
    try {
      const parsed = contract.interface.parseError(data);
      decoded = parsed ? parsed.name : null;
    } catch {
      decoded = null;
    }
  }

  if (caught.__unexpectedSuccess) {
    throw new Error(`Expected a revert${expectedError ? ` (${expectedError})` : ''} but the call succeeded.`);
  }
  if (!expectedError) return;

  const haystack = `${caught.message || ''} ${caught.shortMessage || ''} ${data || ''} ${decoded || ''}`;
  if (decoded !== expectedError && !haystack.includes(expectedError)) {
    throw new Error(
      `Expected revert "${expectedError}" but the revert could not be matched.\n` +
        `decoded=${decoded}\ndata=${data}\nmessage=${caught.message}`,
    );
  }
}

/**
 * Find and decode a named event in a receipt. Done by hand because the suite
 * intentionally avoids `hardhat-chai-matchers`.
 */
function findEvent(receipt, contract, name) {
  for (const log of receipt.logs) {
    let parsed = null;
    try {
      parsed = contract.interface.parseLog({ topics: [...log.topics], data: log.data });
    } catch {
      continue;
    }
    if (parsed && parsed.name === name) return parsed;
  }
  return null;
}

describe('AnalysisRegistry', function () {
  let registry;
  let registryAddress;
  let publisher;
  let other;
  let subject;
  let subject2;

  beforeEach(async function () {
    [publisher, other, subject, subject2] = await ethers.getSigners();
    const factory = await ethers.getContractFactory('AnalysisRegistry');
    registry = await factory.deploy();
    await registry.waitForDeployment();
    registryAddress = await registry.getAddress();
  });

  describe('deployment', function () {
    it('starts with zero records', async function () {
      expect(await registry.totalRecords()).to.equal(0n);
    });

    it('exposes its size limits', async function () {
      expect(await registry.MAX_VERSION_LENGTH()).to.equal(BigInt(MAX_VERSION_LENGTH));
      expect(await registry.MAX_CID_LENGTH()).to.equal(BigInt(MAX_CID_LENGTH));
    });

    it('holds no balance and accepts no value', async function () {
      // The contract has no payable function: sending ETH must fail. This is the
      // structural guarantee that it can never act as a custody contract.
      expect(await ethers.provider.getBalance(registryAddress)).to.equal(0n);
      await expectRevert(
        publisher.sendTransaction({ to: registryAddress, value: 1n }),
        null,
        registry,
      );
    });
  });

  describe('registerAnalysis', function () {
    it('stores a record, emits an event and increments the counter', async function () {
      const tx = await registry
        .connect(publisher)
        .registerAnalysis(subject.address, SAMPLE_HASH, '1.0.0', 'ipfs://bafyexample', 4663);
      const receipt = await tx.wait();
      const block = await ethers.provider.getBlock(receipt.blockNumber);

      expect(await registry.totalRecords()).to.equal(1n);

      const rec = await registry.getRecord(1n);
      expect(rec.publisher).to.equal(publisher.address);
      expect(rec.subject).to.equal(subject.address);
      expect(rec.analysisChainId).to.equal(4663n);
      expect(rec.reportHash).to.equal(SAMPLE_HASH);
      expect(rec.reportVersion).to.equal('1.0.0');
      expect(rec.metadataCid).to.equal('ipfs://bafyexample');
      expect(rec.registeredAt).to.equal(BigInt(block.timestamp));
      expect(rec.revoked).to.equal(false);

      const ev = findEvent(receipt, registry, 'AnalysisRegistered');
      expect(ev, 'AnalysisRegistered event was not emitted').to.not.equal(null);
      expect(ev.args.recordId).to.equal(1n);
      expect(ev.args.publisher).to.equal(publisher.address);
      expect(ev.args.subject).to.equal(subject.address);
      expect(ev.args.analysisChainId).to.equal(4663n);
      expect(ev.args.reportHash).to.equal(SAMPLE_HASH);
      expect(ev.args.reportVersion).to.equal('1.0.0');
      expect(ev.args.metadataCid).to.equal('ipfs://bafyexample');
      expect(ev.args.registeredAt).to.equal(BigInt(block.timestamp));
    });

    it('assigns increasing, 1-based ids', async function () {
      await registry.connect(publisher).registerAnalysis(subject.address, SAMPLE_HASH, '1.0.0', '', 4663);
      const second = ethers.keccak256(ethers.toUtf8Bytes('second'));
      await registry.connect(publisher).registerAnalysis(subject2.address, second, '1.0.1', '', 4663);
      expect(await registry.totalRecords()).to.equal(2n);
      expect(await registry.recordExists(1n)).to.equal(true);
      expect(await registry.recordExists(2n)).to.equal(true);
      expect(await registry.recordExists(3n)).to.equal(false);
    });

    it('accepts an empty metadata pointer', async function () {
      await registry.connect(publisher).registerAnalysis(subject.address, SAMPLE_HASH, '1.0.0', '', 4663);
      const rec = await registry.getRecord(1n);
      expect(rec.metadataCid).to.equal('');
    });

    it('rejects the zero address as subject', async function () {
      await expectRevert(
        registry.connect(publisher).registerAnalysis.staticCall(
          ethers.ZeroAddress,
          SAMPLE_HASH,
          '1.0.0',
          '',
          4663,
        ),
        'ZeroSubject',
        registry,
      );
    });

    it('rejects a zero report hash', async function () {
      await expectRevert(
        registry
          .connect(publisher)
          .registerAnalysis.staticCall(subject.address, ethers.ZeroHash, '1.0.0', '', 4663),
        'ZeroReportHash',
        registry,
      );
    });

    it('rejects an over-long report version', async function () {
      const tooLong = 'v'.repeat(MAX_VERSION_LENGTH + 1);
      await expectRevert(
        registry.connect(publisher).registerAnalysis.staticCall(subject.address, SAMPLE_HASH, tooLong, '', 4663),
        'VersionTooLong',
        registry,
      );
    });

    it('rejects an over-long metadata pointer', async function () {
      const tooLong = 'c'.repeat(MAX_CID_LENGTH + 1);
      await expectRevert(
        registry.connect(publisher).registerAnalysis.staticCall(subject.address, SAMPLE_HASH, '1.0.0', tooLong, 4663),
        'CidTooLong',
        registry,
      );
    });

    it('accepts a version and cid exactly at the limit', async function () {
      const v = 'v'.repeat(MAX_VERSION_LENGTH);
      const c = 'c'.repeat(MAX_CID_LENGTH);
      await registry.connect(publisher).registerAnalysis(subject.address, SAMPLE_HASH, v, c, 4663);
      const rec = await registry.getRecord(1n);
      expect(rec.reportVersion).to.equal(v);
      expect(rec.metadataCid).to.equal(c);
    });

    it('rejects a duplicate report hash by default', async function () {
      await registry.connect(publisher).registerAnalysis(subject.address, SAMPLE_HASH, '1.0.0', '', 4663);
      await expectRevert(
        registry
          .connect(other)
          .registerAnalysis.staticCall(subject2.address, SAMPLE_HASH, '1.0.0', '', 4663),
        'DuplicateReportHash',
        registry,
      );
      expect(await registry.totalRecords()).to.equal(1n);
    });

    it('allows a duplicate when explicitly requested', async function () {
      await registry.connect(publisher).registerAnalysis(subject.address, SAMPLE_HASH, '1.0.0', '', 4663);
      await registry
        .connect(other)
        .registerAnalysisAllowDuplicate(subject2.address, SAMPLE_HASH, '1.0.0', '', 4663);
      expect(await registry.totalRecords()).to.equal(2n);
      expect(await registry.hashRegistered(SAMPLE_HASH)).to.equal(true);
    });

    it('lets anyone publish — registration is not permissioned', async function () {
      await registry.connect(other).registerAnalysis(subject.address, SAMPLE_HASH, '1.0.0', '', 4663);
      const rec = await registry.getRecord(1n);
      expect(rec.publisher).to.equal(other.address);
    });

    it('records which chain the analysis ran against', async function () {
      await registry.connect(publisher).registerAnalysis(subject.address, SAMPLE_HASH, '1.0.0', '', 46630);
      expect((await registry.getRecord(1n)).analysisChainId).to.equal(46630n);
    });
  });

  describe('indexing', function () {
    beforeEach(async function () {
      await registry.connect(publisher).registerAnalysis(subject.address, SAMPLE_HASH, '1.0.0', '', 4663);
      await registry
        .connect(other)
        .registerAnalysis(subject.address, ethers.keccak256(ethers.toUtf8Bytes('b')), '1.0.0', '', 4663);
      await registry
        .connect(publisher)
        .registerAnalysis(subject2.address, ethers.keccak256(ethers.toUtf8Bytes('c')), '1.0.0', '', 4663);
    });

    it('indexes by subject, newest first', async function () {
      expect(await registry.subjectRecordCount(subject.address)).to.equal(2n);
      const [page, total] = await registry.recordsBySubject(subject.address, 0, 10);
      expect(total).to.equal(2n);
      expect(page.map((x) => Number(x))).to.deep.equal([2, 1]);
    });

    it('indexes by publisher, newest first', async function () {
      expect(await registry.publisherRecordCount(publisher.address)).to.equal(2n);
      const [page, total] = await registry.recordsByPublisher(publisher.address, 0, 10);
      expect(total).to.equal(2n);
      expect(page.map((x) => Number(x))).to.deep.equal([3, 1]);
    });

    it('paginates by offset and limit', async function () {
      const [firstPage] = await registry.recordsBySubject(subject.address, 0, 1);
      const [secondPage] = await registry.recordsBySubject(subject.address, 1, 1);
      expect(firstPage.map((x) => Number(x))).to.deep.equal([2]);
      expect(secondPage.map((x) => Number(x))).to.deep.equal([1]);
    });

    it('returns an empty page past the end', async function () {
      const [page, total] = await registry.recordsBySubject(subject.address, 99, 5);
      expect(page.length).to.equal(0);
      expect(total).to.equal(2n);
    });

    it('returns an empty page for a zero limit', async function () {
      const [page] = await registry.recordsBySubject(subject.address, 0, 0);
      expect(page.length).to.equal(0);
    });

    it('reports zero counts for an address with no records', async function () {
      const stranger = '0x1111111111111111111111111111111111111111';
      expect(await registry.subjectRecordCount(stranger)).to.equal(0n);
      expect(await registry.publisherRecordCount(stranger)).to.equal(0n);
      const [page] = await registry.recordsBySubject(stranger, 0, 5);
      expect(page.length).to.equal(0);
    });
  });

  describe('revocation', function () {
    beforeEach(async function () {
      await registry.connect(publisher).registerAnalysis(subject.address, SAMPLE_HASH, '1.0.0', '', 4663);
    });

    it('lets the publisher revoke and emits an event', async function () {
      const tx = await registry.connect(publisher).revokeAnalysis(1n);
      const receipt = await tx.wait();
      const block = await ethers.provider.getBlock(receipt.blockNumber);

      expect((await registry.getRecord(1n)).revoked).to.equal(true);

      const ev = findEvent(receipt, registry, 'AnalysisRevoked');
      expect(ev, 'AnalysisRevoked event was not emitted').to.not.equal(null);
      expect(ev.args.recordId).to.equal(1n);
      expect(ev.args.publisher).to.equal(publisher.address);
      expect(ev.args.revokedAt).to.equal(BigInt(block.timestamp));
    });

    it('keeps the record and the counter after revocation', async function () {
      // Append-only by design: revocation is a flag, never an erasure.
      await registry.connect(publisher).revokeAnalysis(1n);
      expect(await registry.totalRecords()).to.equal(1n);
      expect(await registry.recordExists(1n)).to.equal(true);
      expect((await registry.getRecord(1n)).reportHash).to.equal(SAMPLE_HASH);
    });

    it('refuses revocation from anyone but the publisher', async function () {
      await expectRevert(registry.connect(other).revokeAnalysis.staticCall(1n), 'NotPublisher', registry);
    });

    it('refuses a second revocation', async function () {
      await registry.connect(publisher).revokeAnalysis(1n);
      await expectRevert(registry.connect(publisher).revokeAnalysis.staticCall(1n), 'AlreadyRevoked', registry);
    });

    it('refuses to revoke a record that does not exist', async function () {
      await expectRevert(registry.connect(publisher).revokeAnalysis.staticCall(99n), 'UnknownRecord', registry);
    });

    it('a revoked hash blocklist entry is not re-openable', async function () {
      // A revoked record still counts as "seen", so the same hash cannot be
      // silently re-published as if it were fresh.
      await registry.connect(publisher).revokeAnalysis(1n);
      await expectRevert(
        registry
          .connect(publisher)
          .registerAnalysis.staticCall(subject.address, SAMPLE_HASH, '1.0.0', '', 4663),
        'DuplicateReportHash',
        registry,
      );
    });
  });

  describe('getRecord', function () {
    it('reverts for an unknown id', async function () {
      await expectRevert(registry.getRecord.staticCall(1n), 'UnknownRecord', registry);
    });

    it('never returns id 0 as a valid record', async function () {
      expect(await registry.recordExists(0n)).to.equal(false);
      await expectRevert(registry.getRecord.staticCall(0n), 'UnknownRecord', registry);
    });
  });

  describe('evidence integrity', function () {
    it('stores exactly the hash of the off-chain payload', async function () {
      const payload = JSON.stringify({ txCount: 42, netFlowWei: '123', version: '1.0.0' });
      const hash = ethers.keccak256(ethers.toUtf8Bytes(payload));
      await registry.connect(publisher).registerAnalysis(subject.address, hash, '1.0.0', '', 4663);
      const rec = await registry.getRecord(1n);
      expect(rec.reportHash).to.equal(hash);
      // Anyone can recompute the digest from the published report and compare.
      expect(ethers.keccak256(ethers.toUtf8Bytes(payload))).to.equal(rec.reportHash);
    });

    it('does not store the report body anywhere in the record', async function () {
      const payload = 'super-secret-report-body';
      const hash = ethers.keccak256(ethers.toUtf8Bytes(payload));
      await registry.connect(publisher).registerAnalysis(subject.address, hash, '1.0.0', '', 4663);
      const rec = await registry.getRecord(1n);
      const serialised = JSON.stringify(rec, (_, v) => (typeof v === 'bigint' ? v.toString() : v));
      expect(serialised).to.not.include(payload);
    });
  });
});
