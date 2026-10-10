/**
 * Address / hash validation and the system-address rules that keep rollup
 * machinery out of the counterparty list.
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import {
  formatUnits,
  isChecksumAddress,
  isSystemAddress,
  isValidAddress,
  isValidTxHash,
  parseHexInt,
  safeBigInt,
  shortenAddress,
} from '../src/lib/utils';

describe('isValidAddress', () => {
  it('accepts a lowercase, uppercase and mixed-case 20-byte hex address', () => {
    assert.equal(isValidAddress('0x1111111111111111111111111111111111111111'), true);
    assert.equal(isValidAddress('0xABCDEF0123456789ABCDEF0123456789ABCDEF01'), true);
    assert.equal(isValidAddress('0xAbCdEf0123456789aBcDeF0123456789AbCdEf01'), true);
  });

  it('trims surrounding whitespace before checking', () => {
    assert.equal(isValidAddress('  0x1111111111111111111111111111111111111111  '), true);
  });

  it('rejects the wrong length', () => {
    assert.equal(isValidAddress('0x11111111111111111111111111111111111111'), false); // 19 bytes
    assert.equal(isValidAddress('0x111111111111111111111111111111111111111111'), false); // 21 bytes
    assert.equal(isValidAddress('0x'), false);
    assert.equal(isValidAddress(''), false);
  });

  it('rejects a missing 0x prefix', () => {
    assert.equal(isValidAddress('1111111111111111111111111111111111111111'), false);
  });

  it('rejects non-hex characters', () => {
    assert.equal(isValidAddress('0x11111111111111111111111111111111111111zz'), false);
    assert.equal(isValidAddress('0xGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG'), false);
  });

  it('rejects anything with a non-hex tail or prefix', () => {
    assert.equal(isValidAddress('1x1111111111111111111111111111111111111111'), false);
  });
});

describe('isValidTxHash', () => {
  it('accepts exactly 32 bytes of hex', () => {
    assert.equal(isValidTxHash(`0x${'a'.repeat(64)}`), true);
    assert.equal(isValidTxHash(`0x${'0'.repeat(64)}`), true);
  });

  it('rejects 31 or 33 bytes', () => {
    assert.equal(isValidTxHash(`0x${'a'.repeat(63)}`), false);
    assert.equal(isValidTxHash(`0x${'a'.repeat(65)}`), false);
  });
});

describe('isChecksumAddress', () => {
  it('is false for all-lower and all-upper forms', () => {
    assert.equal(isChecksumAddress('0x1111111111111111111111111111111111111111'), false);
    assert.equal(isChecksumAddress('0xABCDEF0123456789ABCDEF0123456789ABCDEF01'), false);
  });

  it('is true for a genuinely mixed-case form', () => {
    assert.equal(isChecksumAddress('0xAbCdEf0123456789aBcDeF0123456789AbCdEf01'), true);
  });
});

describe('isSystemAddress', () => {
  it('flags the zero and burn addresses', () => {
    assert.equal(isSystemAddress('0x0000000000000000000000000000000000000000'), true);
    assert.equal(isSystemAddress('0x000000000000000000000000000000000000dEaD'), true);
  });

  it('flags Arbitrum Nitro alias addresses', () => {
    // These are synthesised by the rollup, not controlled by a person.
    assert.equal(isSystemAddress('0x00000000000000000000000000000000000a4b05'), true);
    assert.equal(isSystemAddress('0x0000000000000000000000000000000000000064'), true);
  });

  it('flags every address inside the reserved low-prefix range', () => {
    // Anything with 32+ leading zero nibbles is rollup/precompile machinery —
    // including the 0x1 ecrecover precompile and the 0x64 ArbSys precompile.
    // None of these can be controlled by a person, so none may be shown as a
    // counterparty.
    assert.equal(isSystemAddress('0x0000000000000000000000000000000000000001'), true);
    assert.equal(isSystemAddress('0x0000000000000000000000000000000000000064'), true);
    assert.equal(isSystemAddress('0x000000000000000000000000000000000000000a'), true);
  });

  it('does not flag a normal wallet', () => {
    assert.equal(isSystemAddress('0x1111111111111111111111111111111111111111'), false);
    assert.equal(isSystemAddress('0x742d35Cc6634C0532925a3b844Bc454e4438f44e'), false);
    // A normal address that merely starts with a zero nibble must stay a wallet.
    assert.equal(isSystemAddress('0x0e6c1bd2de2e2ba1d8f6cd8b6c0e5c5d5d5d5d5d'), false);
  });

  it('returns false for null / undefined instead of throwing', () => {
    assert.equal(isSystemAddress(null), false);
    assert.equal(isSystemAddress(undefined), false);
    assert.equal(isSystemAddress(''), false);
  });
});

describe('shortenAddress', () => {
  it('keeps short inputs intact', () => {
    assert.equal(shortenAddress('0x1234'), '0x1234');
    assert.equal(shortenAddress(null), '');
    assert.equal(shortenAddress(undefined), '');
  });

  it('elides long inputs to lead…tail', () => {
    const out = shortenAddress('0x1111111111111111111111111111111111111111', 6, 4);
    assert.equal(out, '0x1111…1111');
  });
});

describe('numeric helpers', () => {
  it('formats wei with 18 decimals and trims trailing zeros', () => {
    assert.equal(formatUnits('1000000000000000000'), '1');
    assert.equal(formatUnits('1500000000000000000'), '1.5');
    assert.equal(formatUnits('0'), '0');
    assert.equal(formatUnits('1'), '0');
  });

  it('never throws on malformed input', () => {
    assert.equal(safeBigInt('not-a-number'), 0n);
    assert.equal(safeBigInt(null), 0n);
    assert.equal(safeBigInt(''), 0n);
  });

  it('parses hex block numbers', () => {
    assert.equal(parseHexInt('0x10'), 16);
    assert.equal(parseHexInt('0x0'), 0);
    assert.equal(parseHexInt(null), 0);
    assert.equal(parseHexInt('0xzz'), 0);
  });
});
