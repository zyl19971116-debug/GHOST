/**
 * Shared test fixtures.
 *
 * IMPORTANT: every transaction below is SYNTHETIC. It exists only to exercise the
 * deterministic engine's arithmetic. These fixtures are never served by the
 * application and never presented as chain data — the runtime path always reads
 * from a real RPC endpoint and carries a `DataSourceInfo` provenance block.
 */

import type { TransactionRecord, WalletProfile } from '../src/lib/types';

export const SUBJECT = '0x1111111111111111111111111111111111111111';
export const ALICE = '0x2222222222222222222222222222222222222222';
export const BOB = '0x3333333333333333333333333333333333333333';
export const CAROL = '0x4444444444444444444444444444444444444444';
export const DEX = '0x5555555555555555555555555555555555555555';
export const ZERO = '0x0000000000000000000000000000000000000000';
export const SYSTEM_ALIAS = '0x00000000000000000000000000000000000a4b05';

const ONE_ETH = 1_000_000_000_000_000_000n;

export function tx(overrides: Partial<TransactionRecord> = {}): TransactionRecord {
  return {
    hash: `0x${'a'.repeat(64)}`,
    blockNumber: 1000,
    blockHash: `0x${'b'.repeat(64)}`,
    timestamp: '2026-10-09T10:00:00.000Z',
    from: SUBJECT,
    to: ALICE,
    valueWei: ONE_ETH.toString(),
    valueEth: '1',
    gasLimit: '21000',
    gasPriceWei: '1000000000',
    gasUsed: '21000',
    effectiveGasPriceWei: '1000000000',
    feeWei: '21000000000000',
    nonce: 1,
    inputSize: 0,
    methodId: null,
    methodLabel: null,
    txType: '2',
    status: 'success',
    isContractCreation: false,
    isContractInteraction: false,
    direction: 'out',
    explorerUrl: null,
    sourceStrategy: 'rpc-block-scan',
    ...overrides,
  };
}

export function hashOf(seed: string): string {
  // Deterministic 32-byte hex derived from a short seed — readable in failures.
  const base = Buffer.from(seed).toString('hex').padEnd(64, '0').slice(0, 64);
  return `0x${base}`;
}

/**
 * A small, fully-specified scenario:
 *   subject -> alice   2 ETH  (out, native)
 *   alice   -> subject 0.5 ETH (in, native)
 *   subject -> dex     1 ETH  (out, contract call, ERC-20 transfer selector)
 *   carol   -> subject 3 ETH  (in, native)
 *   subject -> bob     0.001 ETH (out, FAILED)
 *   subject -> subject 0 ETH  (self transfer loop)
 *   subject -> NEW     0 ETH  (contract creation)
 *   system alias -> subject 0.1 ETH (must be excluded from counterparties)
 */
export function scenario(): TransactionRecord[] {
  return [
    tx({ hash: hashOf('t1'), blockNumber: 1000, from: SUBJECT, to: ALICE, valueWei: (2n * ONE_ETH).toString(), direction: 'out' }),
    tx({ hash: hashOf('t2'), blockNumber: 1001, from: ALICE, to: SUBJECT, valueWei: (ONE_ETH / 2n).toString(), direction: 'in' }),
    tx({
      hash: hashOf('t3'),
      blockNumber: 1002,
      from: SUBJECT,
      to: DEX,
      valueWei: ONE_ETH.toString(),
      direction: 'out',
      methodId: '0xa9059cbb',
      methodLabel: 'transfer(address,uint256)',
      inputSize: 68,
      isContractInteraction: true,
    }),
    tx({ hash: hashOf('t4'), blockNumber: 1003, from: CAROL, to: SUBJECT, valueWei: (3n * ONE_ETH).toString(), direction: 'in' }),
    tx({
      hash: hashOf('t5'),
      blockNumber: 1004,
      from: SUBJECT,
      to: BOB,
      valueWei: '1000000000000000',
      direction: 'out',
      status: 'failed',
      gasUsed: null,
    }),
    tx({ hash: hashOf('t6'), blockNumber: 1005, from: SUBJECT, to: SUBJECT, valueWei: '0', direction: 'self' }),
    tx({
      hash: hashOf('t7'),
      blockNumber: 1006,
      from: SUBJECT,
      to: null,
      valueWei: '0',
      direction: 'out',
      isContractCreation: true,
      isContractInteraction: true,
    }),
    tx({
      hash: hashOf('t8'),
      blockNumber: 1007,
      from: SYSTEM_ALIAS,
      to: SUBJECT,
      valueWei: '100000000000000000',
      direction: 'in',
    }),
  ];
}

export function profileOf(address = SUBJECT): WalletProfile {
  return {
    address,
    chainKey: 'robinhood',
    chainId: 4663,
    balanceWei: ONE_ETH.toString(),
    balanceEth: '1',
    nonce: 12,
    isContract: false,
    codeSize: 0,
    stateReadAtBlock: 84058804,
  };
}
