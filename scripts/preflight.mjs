#!/usr/bin/env node
/**
 * Preflight check.
 *
 * Prints exactly what this deployment can and cannot do, straight from the same
 * configuration code the app uses. Run it before `npm run dev` when something
 * looks wrong, or in CI to prove a deployment is honest about its limits.
 *
 * Exit code is always 0 unless a *fatal* misconfiguration is found — a missing
 * optional key is a documented degradation, not a failure.
 */

import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');

async function loadEnvLocal() {
  const fs = await import('node:fs');
  const candidates = ['.env.local', '.env'];
  for (const name of candidates) {
    const file = path.join(root, name);
    if (!fs.existsSync(file)) continue;
    const raw = fs.readFileSync(file, 'utf8');
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
    console.log(`env file     : ${name} loaded`);
  }
}

const OK = 'OK  ';
const MISS = 'MISS';
const WARN = 'WARN';

function line(status, label, detail) {
  console.log(`  [${status}] ${label.padEnd(26)} ${detail}`);
}

async function main() {
  console.log('GHOST PROTOCOL AI — preflight\n');
  await loadEnvLocal();

  console.log('runtime');
  console.log(`  node ${process.version}  ${process.platform}/${process.arch}\n`);

  // Load the real config modules through the compiled test build when present,
  // otherwise fall back to reading the same environment variables directly.
  // NOTE: a bare `C:\...` string is not a valid ESM specifier on Windows — the
  // path must be converted to a file:// URL or the import silently fails.
  const compiledConfig = pathToFileURL(path.join(root, '.test-build', 'src', 'lib', 'config.js')).href;
  const { getCapabilityReport, getPublicConfig, getServerConfig } = (await import(compiledConfig).catch(
    () => null,
  )) ?? {};

  if (!getCapabilityReport) {
    console.log(
      'The config module has not been compiled yet. Run `npm run preflight`,\n' +
        '`npm run test` or `npx tsc -p tsconfig.test.json` first. Falling back to a raw\n' +
        'environment summary:\n',
    );
    for (const key of [
      'NEXT_PUBLIC_CHAINS',
      'RPC_URL_ROBINHOOD',
      'AI_API_KEY',
      'DATABASE_URL',
      'NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID',
      'NEXT_PUBLIC_REGISTRY_ADDRESS',
    ]) {
      const v = process.env[key];
      line(v ? OK : MISS, key, v ? (key.includes('KEY') ? '(set, not printed)' : v) : 'not set');
    }
    return;
  }

  const server = getServerConfig();
  const pub = getPublicConfig();
  const cap = getCapabilityReport();

  console.log('chain access');
  for (const c of cap.chains) {
    console.log(`  ${c.name} (chainId ${c.id})`);
    line(c.rpcConfigured ? OK : WARN, 'rpc endpoint', c.rpcUrlLabel);
    line(c.explorerConfigured ? OK : WARN, 'indexer api', c.explorerConfigured ? 'configured' : 'not configured');
    console.log(`         coverage                 ${c.historyCoverage}`);
    for (const l of c.limitations) console.log(`         limitation               ${l}`);
  }

  console.log('\nintelligence layer');
  line(server.ai.configured ? OK : MISS, 'AI_API_KEY', server.ai.configured ? `${server.ai.model} @ ${server.ai.baseUrl}` : 'not set — AI section shows NOT CONFIGURED');
  line(server.database.configured ? OK : WARN, 'DATABASE_URL', server.database.configured ? 'postgresql via prisma' : 'not set — using volatile in-memory storage');
  line(cap.registry.configured ? OK : WARN, 'REGISTRY_ADDRESS', cap.registry.address ?? 'not set — archive attestation shows NOT DEPLOYED');
  line(
    pub.walletConnectProjectId ? OK : WARN,
    'WALLETCONNECT_PROJECT_ID',
    pub.walletConnectProjectId ? 'set' : 'not set — injected wallets still work, WalletConnect is disabled',
  );

  console.log('\ndata-layer limits');
  for (const [k, v] of Object.entries(server.limits)) {
    console.log(`  ${k.padEnd(24)} ${v}`);
  }

  console.log('\nSummary');
  const missing = [
    !server.ai.configured && 'AI_API_KEY (AI narrative section will be disabled)',
    !server.database.configured && 'DATABASE_URL (archives are volatile)',
    !cap.registry.configured && 'NEXT_PUBLIC_REGISTRY_ADDRESS (on-chain attestation disabled)',
    !pub.walletConnectProjectId && 'NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID (WalletConnect disabled)',
  ].filter(Boolean);

  if (missing.length === 0) {
    console.log('  Everything optional is configured. Nothing is being degraded.');
  } else {
    console.log('  The app runs fully with the following features degraded, by design:');
    for (const m of missing) console.log(`   - ${m}`);
    console.log('\n  None of these are faked. Each one is shown as NOT CONFIGURED / NOT DEPLOYED in the UI.');
  }
}

main().catch((err) => {
  console.error('\npreflight failed:', err && err.message ? err.message : err);
  process.exitCode = 1;
});
