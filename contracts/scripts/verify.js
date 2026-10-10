'use strict';

/**
 * Verify AnalysisRegistry source on the configured block explorer.
 *
 * Usage:
 *   npx hardhat run scripts/verify.js --network robinhoodTestnet
 *   npx hardhat run scripts/verify.js --network robinhood
 *
 * Reads the address from `contracts/.deployment.json` (written by deploy.js) or
 * from the REGISTRY_ADDRESS environment variable.
 *
 * HONEST FAILURE MODES
 * --------------------
 * Measured on 2026-10-09: the Robinhood Chain explorer sits behind an edge
 * bot-challenge that answers HTTP 403 to server-side requests. When that
 * happens this script reports it as a *provider-side* limitation and exits with
 * a clear message — it never claims verification succeeded.
 */

const fs = require('node:fs');
const path = require('node:path');
const hre = require('hardhat');

const DEPLOYMENT_FILE = path.join(__dirname, '..', '.deployment.json');
const MAINNET_HOST = 'robinhoodchain.blockscout.com';

function readAddress() {
  if (process.env.REGISTRY_ADDRESS) return process.env.REGISTRY_ADDRESS.trim();
  if (!fs.existsSync(DEPLOYMENT_FILE)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(DEPLOYMENT_FILE, 'utf8'));
    return typeof parsed.address === 'string' ? parsed.address : null;
  } catch {
    return null;
  }
}

function explorerApiUrl(networkName) {
  const chain = (hre.config.etherscan.customChains || []).find((c) => c.network === networkName);
  return chain ? chain.urls.apiURL : null;
}

async function probeExplorer(apiUrl) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    const res = await fetch(`${apiUrl}?module=block&action=eth_block_number`, {
      signal: controller.signal,
      headers: { accept: 'application/json' },
    });
    clearTimeout(timer);
    const text = await res.text();
    const challenged =
      res.status === 403 ||
      /just a moment|cf-chl|challenge-platform|_cf_chl_opt|attention required/i.test(text.slice(0, 600));
    if (challenged) {
      return { reachable: false, status: res.status, reason: 'EDGE_BOT_CHALLENGE' };
    }
    if (!res.ok) {
      return { reachable: false, status: res.status, reason: `HTTP_${res.status}` };
    }
    return { reachable: true, status: res.status, reason: null };
  } catch (err) {
    return { reachable: false, status: 0, reason: `NETWORK_ERROR: ${err && err.message ? err.message : err}` };
  }
}

async function main() {
  const networkName = hre.network.name;
  const address = readAddress();

  if (!address) {
    throw new Error(
      'No contract address found. Deploy first (scripts/deploy.js) or set REGISTRY_ADDRESS.',
    );
  }

  const code = await hre.ethers.provider.getCode(address);
  if (code === '0x') {
    throw new Error(
      `There is no contract bytecode at ${address} on ${networkName}. ` +
        'Nothing to verify — check the address and the network.',
    );
  }
  console.log(`contract     : ${address}`);
  console.log(`network      : ${networkName}`);
  console.log(`bytecode size: ${(code.length - 2) / 2} bytes`);

  const apiUrl = explorerApiUrl(networkName);
  if (!apiUrl) {
    console.log(
      '\nNo explorer verify API is configured for this network, so source verification cannot be attempted.',
    );
    return;
  }

  const probe = await probeExplorer(apiUrl);
  if (!probe.reachable) {
    console.log('\nVERIFICATION NOT ATTEMPTED — the explorer API is not reachable:');
    console.log(`  api      : ${apiUrl}`);
    console.log(`  reason   : ${probe.reason}${probe.status ? ` (HTTP ${probe.status})` : ''}`);
    if (apiUrl.includes(MAINNET_HOST)) {
      console.log(
        '  note     : the Robinhood Chain explorer applies an edge bot-challenge to\n' +
          '             server-side requests. Source verification has to be run from an\n' +
          '             environment the explorer does not challenge, or triggered manually\n' +
          '             in the explorer UI. This script will not claim success.',
      );
    }
    return;
  }

  console.log(`\nexplorer API reachable (HTTP ${probe.status}) — submitting source …`);
  try {
    await hre.run('verify:verify', {
      address,
      constructorArguments: [],
    });
    console.log('\nVERIFICATION SUBMITTED');
  } catch (err) {
    const message = err && err.message ? err.message : String(err);
    if (/already verified/i.test(message)) {
      console.log('\nALREADY VERIFIED — nothing to do.');
      return;
    }
    console.log('\nVERIFICATION FAILED');
    console.log(message);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('\nVERIFY SCRIPT ERROR');
  console.error(err && err.message ? err.message : err);
  process.exitCode = 1;
});
