/**
 * Chain registry integrity.
 *
 * The single most important property of this file: nothing in the registry may
 * be invented. Every entry must declare where its parameters came from, ids must
 * not collide, and the one network we probed live must still match the values
 * that probe returned.
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import {
  CHAIN_KEYS,
  CHAIN_META,
  explorerAddressUrl,
  explorerBlockUrl,
  explorerTxUrl,
  getChainMeta,
  getChainMetaById,
  isChainKey,
} from '../src/lib/chains';

describe('chain registry', () => {
  it('registers every declared key exactly once', () => {
    assert.equal(new Set(CHAIN_KEYS).size, CHAIN_KEYS.length);
    for (const key of CHAIN_KEYS) {
      assert.ok(CHAIN_META[key], `CHAIN_META is missing key ${key}`);
      assert.equal(CHAIN_META[key].key, key);
    }
  });

  it('has no duplicate chain ids', () => {
    const ids = CHAIN_KEYS.map((k) => CHAIN_META[k].id);
    assert.equal(new Set(ids).size, ids.length, `duplicate chain id in ${ids.join(', ')}`);
  });

  it('declares provenance for every chain — nothing is invented', () => {
    for (const key of CHAIN_KEYS) {
      const meta = CHAIN_META[key];
      assert.ok(meta.provenance, `${key} has no provenance block`);
      assert.ok(meta.provenance.sources.length > 0, `${key} cites no source`);
      assert.ok(
        ['probed', 'canonical', 'unverified'].includes(meta.provenance.verification),
        `${key} has an unknown verification level`,
      );
    }
  });

  it('marks every chain that was not probed as canonical rather than probed', () => {
    for (const key of CHAIN_KEYS) {
      const meta = CHAIN_META[key];
      if (meta.provenance.verification === 'probed') {
        assert.ok(meta.provenance.verifiedAt, `${key} claims to be probed without a timestamp`);
      }
    }
  });

  it('gives every chain a well-formed RPC URL and explorer URL', () => {
    for (const key of CHAIN_KEYS) {
      const meta = CHAIN_META[key];
      assert.doesNotThrow(() => new URL(meta.rpcUrl), `${key} has an invalid rpcUrl`);
      assert.equal(new URL(meta.rpcUrl).protocol, 'https:', `${key} rpcUrl must be https`);
      assert.ok(meta.explorerUrl.length > 0, `${key} has no explorer URL`);
      assert.doesNotThrow(() => new URL(meta.explorerUrl), `${key} has an invalid explorerUrl`);
    }
  });

  it('gives every chain a native currency with 18 decimals', () => {
    for (const key of CHAIN_KEYS) {
      const { nativeCurrency } = CHAIN_META[key];
      assert.ok(nativeCurrency.symbol.length > 0, `${key} has no native symbol`);
      assert.equal(nativeCurrency.decimals, 18, `${key} native decimals must be 18`);
    }
  });

  it('records a capability envelope for every chain', () => {
    for (const key of CHAIN_KEYS) {
      const caps = CHAIN_META[key].capabilities;
      assert.ok(['none', 'rpc-scan-only', 'explorer'].includes(caps.historyIndex), `${key} bad historyIndex`);
      assert.equal(typeof caps.archiveBlocks, 'boolean');
      assert.equal(typeof caps.explorerReachableFromServer, 'boolean');
      assert.ok(caps.logsRangeLimit === null || caps.logsRangeLimit > 0);
    }
  });

  it('never claims a full historical index from an RPC-only path', () => {
    for (const key of CHAIN_KEYS) {
      const meta = CHAIN_META[key];
      if (meta.capabilities.historyIndex === 'rpc-scan-only') {
        // A block-scan is bounded by definition. Marking this as a complete
        // history would be the exact dishonesty the product forbids.
        assert.notEqual(meta.capabilities.historyIndex, 'explorer');
      }
    }
  });
});

describe('Robinhood Chain — probed values', () => {
  const rh = CHAIN_META.robinhood;

  it('is chain id 4663 on mainnet', () => {
    assert.equal(rh.id, 4663);
  });

  it('is chain id 46630 on testnet', () => {
    assert.equal(CHAIN_META.robinhoodTestnet.id, 46630);
    assert.equal(CHAIN_META.robinhoodTestnet.testnet, true);
    assert.equal(rh.testnet, false);
  });

  it('uses ETH as the native gas token — there is no separate RH token', () => {
    assert.equal(rh.nativeCurrency.symbol, 'ETH');
    assert.equal(rh.nativeCurrency.decimals, 18);
  });

  it('points at the official RPC host', () => {
    assert.equal(new URL(rh.rpcUrl).host, 'rpc.mainnet.chain.robinhood.com');
    assert.equal(new URL(CHAIN_META.robinhoodTestnet.rpcUrl).host, 'rpc.testnet.chain.robinhood.com');
  });

  it('records that the explorer is unreachable from the server', () => {
    // Verified 2026-10-09: Blockscout answered HTTP 403 with a Cloudflare
    // challenge. The registry must keep saying so until it is re-measured.
    assert.equal(rh.capabilities.explorerReachableFromServer, false);
  });

  it('records the measured logs range ceiling', () => {
    assert.equal(rh.capabilities.logsRangeLimit, 30000);
    assert.equal(rh.capabilities.logsResultLimit, 10000);
  });

  it('cites at least two independent sources', () => {
    assert.ok(rh.provenance.sources.length >= 2);
    assert.ok(rh.provenance.sources.some((s) => s.includes('robinhood.com')));
    assert.ok(rh.provenance.sources.some((s) => s.includes('probe')));
  });
});

describe('lookups', () => {
  it('isChainKey narrows correctly', () => {
    assert.equal(isChainKey('robinhood'), true);
    assert.equal(isChainKey('not-a-chain'), false);
    assert.equal(isChainKey(''), false);
  });

  it('getChainMeta returns null for an unknown key instead of guessing', () => {
    assert.equal(getChainMeta('robinhood'), CHAIN_META.robinhood);
    assert.equal(getChainMeta('nope'), null);
  });

  it('getChainMetaById round-trips every registered chain', () => {
    for (const key of CHAIN_KEYS) {
      const found = getChainMetaById(CHAIN_META[key].id);
      assert.ok(found, `no chain found for id ${CHAIN_META[key].id}`);
      assert.equal(found.key, key);
    }
  });

  it('getChainMetaById returns null for an unknown id', () => {
    assert.equal(getChainMetaById(999999), null);
  });
});

describe('explorer URL builders', () => {
  const hash = `0x${'a'.repeat(64)}`;

  it('builds a transaction URL', () => {
    const url = explorerTxUrl('robinhood', hash);
    assert.ok(url);
    assert.equal(url, `https://robinhoodchain.blockscout.com/tx/${hash}`);
  });

  it('builds an address URL', () => {
    const url = explorerAddressUrl('robinhood', '0x1111111111111111111111111111111111111111');
    assert.ok(url);
    assert.match(url, /\/address\/0x1111/);
  });

  it('builds a block URL', () => {
    const url = explorerBlockUrl('robinhood', 84058804);
    assert.equal(url, 'https://robinhoodchain.blockscout.com/block/84058804');
  });

  it('accepts a bigint block number', () => {
    assert.equal(explorerBlockUrl('robinhood', 10n), 'https://robinhoodchain.blockscout.com/block/10');
  });

  it('never double-slashes the base URL', () => {
    for (const key of CHAIN_KEYS) {
      const url = explorerTxUrl(key, hash);
      if (url) assert.equal(url.includes('com//tx'), false, `${key} produced a double slash`);
    }
  });

  it('returns null for an unknown chain', () => {
    assert.equal(explorerTxUrl('nope', hash), null);
    assert.equal(explorerAddressUrl('nope', hash), null);
    assert.equal(explorerBlockUrl('nope', 1), null);
  });
});
