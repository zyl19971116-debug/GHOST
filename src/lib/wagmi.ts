'use client';

import { createConfig, createStorage, cookieStorage, http, type Config } from 'wagmi';
import { coinbaseWallet, injected, walletConnect } from 'wagmi/connectors';
import type { Chain } from 'viem';
import { getBrowserRpcUrl, getPublicConfig } from './config';
import { VIEM_CHAINS, type ChainKey } from './chains';

/**
 * Wallet configuration.
 *
 * Deliberately built with wagmi's own `createConfig` rather than RainbowKit's
 * `getDefaultConfig`, because that helper hard-requires a WalletConnect project
 * id. With no project id configured we still want MetaMask, Rabby and any other
 * injected wallet to work — so we assemble the connector list to match what is
 * actually available, and the UI labels WalletConnect as unavailable rather
 * than showing a button that cannot work.
 *
 * Signing is only ever used to prove control of an address. The app never
 * requests a private key or seed phrase, and never initiates a transaction on
 * connect.
 */
let cached: Config | null = null;

export function getWalletConfig(): Config {
  if (cached) return cached;

  const pub = getPublicConfig();
  const chains = pub.chains.map((k: ChainKey) => VIEM_CHAINS[k]) as unknown as readonly [Chain, ...Chain[]];

  const transports = Object.fromEntries(
    pub.chains.map((k: ChainKey) => [VIEM_CHAINS[k].id, http(getBrowserRpcUrl(k), { batch: true, retryCount: 2 })]),
  );

  const connectors = [
    injected({ shimDisconnect: true }),
    coinbaseWallet({
      appName: 'GHOST PROTOCOL AI',
      appLogoUrl: undefined,
      preference: 'all',
    }),
  ];

  if (pub.walletConnectProjectId) {
    connectors.push(
      walletConnect({
        projectId: pub.walletConnectProjectId,
        showQrModal: true,
        metadata: {
          name: 'GHOST PROTOCOL AI',
          description: 'On-chain wallet relationship analysis. The invisible intelligence layer.',
          url: pub.siteUrl,
          icons: [],
        },
      }) as never,
    );
  }

  cached = createConfig({
    chains: chains as never,
    connectors: connectors as never,
    transports: transports as never,
    ssr: true,
    storage: createStorage({ storage: cookieStorage }),
  });

  return cached;
}

export function walletConnectEnabled(): boolean {
  return getPublicConfig().features.walletConnect;
}
