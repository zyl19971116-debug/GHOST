/**
 * Well-known 4-byte function selectors and transaction type labels.
 *
 * Only selectors that are unambiguously standard are listed. Anything not in
 * this table is rendered as its raw selector with no invented name — the UI
 * shows `0x1a2b3c4d` and an "UNKNOWN" marker rather than a fabricated label.
 */

export const METHOD_LABELS: Record<string, string> = {
  // --- ERC-20 ---
  '0xa9059cbb': 'transfer(address,uint256)',
  '0x23b872dd': 'transferFrom(address,address,uint256)',
  '0x095ea7b3': 'approve(address,uint256)',
  '0x70a08231': 'balanceOf(address)',
  '0x18160ddd': 'totalSupply()',
  '0x313ce567': 'decimals()',
  '0x06fdde03': 'name()',
  '0x95d89b41': 'symbol()',
  '0x39509351': 'increaseAllowance(address,uint256)',
  '0xa457c2d7': 'decreaseAllowance(address,uint256)',
  '0x40c10f19': 'mint(address,uint256)',
  '0x9dc29fac': 'burn(address,uint256)',
  '0x42966c68': 'burn(uint256)',
  '0x1249c58b': 'mint()',
  '0x4e71d92d': 'claim()',
  '0x2eb2c2d6': 'safeBatchTransferFrom(address,address,uint256[],uint256[],bytes)',

  // --- ERC-721 / ERC-1155 ---
  '0x42842e0e': 'safeTransferFrom(address,address,uint256)',
  '0xb88d4fde': 'safeTransferFrom(address,address,uint256,bytes)',
  '0xf242432a': 'safeTransferFrom(address,address,uint256,uint256,bytes)',
  '0x6352211e': 'ownerOf(uint256)',
  '0xe985e9c5': 'isApprovedForAll(address,address)',
  '0xa22cb465': 'setApprovalForAll(address,bool)',

  // --- Ownership / proxy / upgradeability ---
  '0x8da5cb5b': 'owner()',
  '0xf2fde38b': 'transferOwnership(address)',
  '0x715018a6': 'renounceOwnership()',
  '0x3659cfe6': 'upgradeTo(address)',
  '0x4f1ef286': 'upgradeToAndCall(address,bytes)',
  '0x5c60da1b': 'implementation()',
  '0x1cff79cd': 'execute(address,bytes)',
  '0xc4d66de8': 'initialize(address)',
  '0x8129fc1c': 'initialize()',
  '0x8456cb59': 'pause()',
  '0x3f4ba83a': 'unpause()',
  '0x5c975abb': 'paused()',

  // --- Wrapped native / lending ---
  '0xd0e30db0': 'deposit()',
  '0x2e1a7d4d': 'withdraw(uint256)',
  '0xa0712d68': 'mint(uint256)',
  '0xe8eda9df': 'deposit(address,uint256,address,uint16)',
  '0x69328dec': 'withdraw(address,uint256,address)',
  '0x573ade81': 'repay(address,uint256,uint256,address)',
  '0x617ba037': 'supply(address,uint256,address,uint16)',

  // --- DEX routers ---
  '0x38ed1739': 'swapExactTokensForTokens(uint256,uint256,address[],address,uint256)',
  '0x7ff36ab5': 'swapExactETHForTokens(uint256,address[],address,uint256)',
  '0x18cbafe5': 'swapExactTokensForETH(uint256,uint256,address[],address,uint256)',
  '0xfb3bdb41': 'swapETHForExactTokens(uint256,address[],address,uint256)',
  '0x8803dbee': 'swapTokensForExactTokens(uint256,uint256,address[],address,uint256)',
  '0xac9650d8': 'multicall(bytes[])',
  '0x5ae401dc': 'multicall(uint256,bytes[])',
  '0x04e45aaf': 'exactInputSingle((address,address,uint24,address,uint256,uint256,uint160))',
  '0xb858183f': 'exactInput((bytes,address,uint256,uint256))',

  // --- ERC-4337 account abstraction ---
  '0x1fad948c': 'handleOps((address,uint256,bytes,bytes,uint256,uint256,uint256,uint256,uint256,bytes,bytes)[],address)',
  '0xb61d27f6': 'execute(address,uint256,bytes)',
  '0x51945447': 'execute(address,uint256,bytes,uint8)',

  // --- Misc frequently-seen ---
  '0x150b7a02': 'onERC721Received(address,address,uint256,bytes)',
  '0xf23a6e61': 'onERC1155Received(address,address,uint256,uint256,bytes)',
};

export function labelForSelector(input: string | undefined | null): string | null {
  if (!input || input.length < 10) return null;
  const selector = input.slice(0, 10).toLowerCase();
  return METHOD_LABELS[selector] ?? null;
}

export function selectorFor(input: string | undefined | null): string | null {
  if (!input || input.length < 10) return null;
  return input.slice(0, 10).toLowerCase();
}

/** Transaction envelope types (Ethereum standard + Arbitrum Nitro extensions). */
export function labelTxType(rawType: string | undefined): string {
  const t = (rawType ?? '0x0').toLowerCase();
  switch (t) {
    case '0x0':
      return 'Legacy';
    case '0x1':
      return 'EIP-2930 Access List';
    case '0x2':
      return 'EIP-1559';
    case '0x3':
      return 'EIP-4844 Blob';
    case '0x7e':
      return 'Deposit (L1→L2)';
  }
  const n = Number.parseInt(t, 16);
  if (Number.isFinite(n) && n >= 0x64 && n <= 0x7a) {
    // Arbitrum Nitro reserves 100..122 for internally-synthesised transactions.
    return `Arbitrum system type ${t}`;
  }
  return `Unknown type ${t}`;
}

/**
 * Arbitrum-style system addresses. Re-exported from `lib/utils` so that every
 * consumer (server data layer, analysis engine, UI) shares one definition.
 */
export { isSystemAddress } from '../utils';

export function isNativeTransfer(input: string | undefined | null): boolean {
  return !input || input === '0x' || input.length < 10;
}
