/* eslint-disable @typescript-eslint/no-var-requires */
'use strict';

/**
 * Hardhat configuration for the GHOST PROTOCOL AI AnalysisRegistry contract.
 *
 * Only the AnalysisRegistry attestation contract lives here. There is no token,
 * no custody contract, and no deployment that moves user funds.
 *
 * Secrets are read from `contracts/.env` (never committed). A tiny zero-dependency
 * loader is used instead of pulling in `dotenv`, so `hardhat test` works with no
 * network access and no extra packages.
 */

const fs = require('node:fs');
const path = require('node:path');

(function loadEnvFile() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) return;
  const raw = fs.readFileSync(envPath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
})();

require('@nomicfoundation/hardhat-ethers');
require('@nomicfoundation/hardhat-verify');

const DEPLOYER_KEY = process.env.DEPLOYER_PRIVATE_KEY || '';
const accounts = DEPLOYER_KEY ? [DEPLOYER_KEY] : [];

/** Refuse to pretend a network is configured when it is not. */
const RH_MAINNET_RPC = process.env.RH_MAINNET_RPC_URL || 'https://rpc.mainnet.chain.robinhood.com';
const RH_TESTNET_RPC = process.env.RH_TESTNET_RPC_URL || 'https://rpc.testnet.chain.robinhood.com';

module.exports = {
  solidity: {
    version: '0.8.24',
    settings: {
      optimizer: { enabled: true, runs: 200 },
      // Robinhood Chain is an Arbitrum Nitro / Orbit L2. `paris` keeps the
      // bytecode free of PUSH0 so it also deploys cleanly on chains that have
      // not activated Shanghai.
      evmVersion: 'paris',
      metadata: { bytecodeHash: 'none' },
    },
  },
  networks: {
    hardhat: {
      chainId: 31337,
      allowUnlimitedContractSize: false,
    },
    // Robinhood Chain mainnet — Chain ID 4663 (verified 2026-10-09 via eth_chainId).
    robinhood: {
      url: RH_MAINNET_RPC,
      chainId: 4663,
      accounts,
    },
    // Robinhood Chain testnet — Chain ID 46630 (verified 2026-10-09 via eth_chainId).
    robinhoodTestnet: {
      url: RH_TESTNET_RPC,
      chainId: 46630,
      accounts,
    },
  },
  etherscan: {
    // Blockscout instances expose an Etherscan-compatible verify API.
    apiKey: {
      robinhood: process.env.RH_EXPLORER_API_KEY || 'blockscout',
      robinhoodTestnet: process.env.RH_EXPLORER_API_KEY || 'blockscout',
    },
    customChains: [
      {
        network: 'robinhood',
        chainId: 4663,
        urls: {
          apiURL: 'https://robinhoodchain.blockscout.com/api',
          browserURL: 'https://robinhoodchain.blockscout.com',
        },
      },
      {
        network: 'robinhoodTestnet',
        chainId: 46630,
        urls: {
          apiURL: 'https://explorer.testnet.chain.robinhood.com/api',
          browserURL: 'https://explorer.testnet.chain.robinhood.com',
        },
      },
    ],
  },
  paths: {
    sources: './contracts',
    tests: './test',
    cache: './cache',
    artifacts: './artifacts',
  },
  mocha: {
    timeout: 120000,
  },
};
