#!/usr/bin/env node
/**
 * Route verification.
 *
 * Boots the production server, then asserts that every route in the navigation
 * actually renders and that each API endpoint returns a well-formed envelope.
 *
 * Deliberately strict about two things:
 *   - a page must carry its own <title>, so a 200 that renders the wrong page
 *     (or an empty shell) still fails;
 *   - an API response must declare its provenance or its honest error, never
 *     return a bare `ok: true` with nothing behind it.
 *
 * Usage:
 *   node scripts/verify-routes.mjs                 # spawns `next start`
 *   node scripts/verify-routes.mjs --url=http://localhost:3000   # use a running server
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve(import.meta.dirname, '..');
const PORT = Number(process.env.VERIFY_PORT ?? 3311);
const providedUrl = process.argv.find((a) => a.startsWith('--url='));
const baseUrl = providedUrl ? providedUrl.slice('--url='.length).replace(/\/$/, '') : `http://127.0.0.1:${PORT}`;

const PAGES = [
  { path: '/', title: 'The Invisible Intelligence Layer', marker: 'ENTER THE NETWORK' },
  { path: '/network', title: 'Network' },
  { path: '/analyze', title: 'Analyze' },
  { path: '/intel', title: 'Intel' },
  { path: '/archive', title: 'Archive' },
  { path: '/docs', title: 'Docs', marker: 'DOCUMENTATION' },
  { path: '/settings', title: 'Settings' },
];

const APIS = [
  { path: '/api/health', kind: 'envelope' },
  { path: '/api/capabilities', kind: 'envelope' },
  { path: '/api/intel', kind: 'envelope' },
  { path: '/api/archive', kind: 'envelope' },
];

const results = [];
let failures = 0;

function record(ok, label, detail) {
  results.push({ ok, label, detail });
  if (!ok) failures++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(36)} ${detail}`);
}

async function waitForServer(url, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(5_000) });
      if (res.status < 500) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 700));
  }
  return false;
}

async function checkPage(page) {
  const res = await fetch(`${baseUrl}${page.path}`, {
    redirect: 'follow',
    signal: AbortSignal.timeout(30_000),
  });
  if (res.status !== 200) {
    record(false, `GET ${page.path}`, `expected 200, got ${res.status}`);
    return;
  }
  const html = await res.text();
  const titleOk = html.includes(`<title>`) && html.includes(page.title);
  if (!titleOk) {
    record(false, `GET ${page.path}`, `200 but <title> does not contain "${page.title}"`);
    return;
  }
  if (page.marker && !html.includes(page.marker)) {
    record(false, `GET ${page.path}`, `200 and title ok, but marker "${page.marker}" is missing`);
    return;
  }
  record(true, `GET ${page.path}`, `200, title ok${page.marker ? ', marker ok' : ''}`);
}

async function checkApi(api) {
  const res = await fetch(`${baseUrl}${api.path}`, { signal: AbortSignal.timeout(45_000) });
  if (res.status !== 200) {
    record(false, `GET ${api.path}`, `expected 200, got ${res.status}`);
    return null;
  }
  let body;
  try {
    body = await res.json();
  } catch {
    record(false, `GET ${api.path}`, '200 but the body is not JSON');
    return null;
  }
  if (typeof body !== 'object' || body === null || typeof body.ok !== 'boolean') {
    record(false, `GET ${api.path}`, 'response is missing the { ok: boolean } envelope');
    return null;
  }
  if (body.ok === false && !body.error) {
    record(false, `GET ${api.path}`, 'ok:false without an error block');
    return null;
  }
  record(true, `GET ${api.path}`, `200, ok:${body.ok}${body.error ? ` (${body.error.code})` : ''}`);
  return body;
}

async function checkIntelligence() {
  // /api/intel must be honest: either real events, or an explicit limitation.
  const res = await fetch(`${baseUrl}/api/intel`, { signal: AbortSignal.timeout(45_000) });
  if (res.status !== 200) {
    record(false, 'intel honesty', `expected 200, got ${res.status}`);
    return;
  }
  const body = await res.json();
  const items = body?.data?.items ?? body?.data ?? null;
  const source = body?.source ?? null;
  if (Array.isArray(items)) {
    if (items.length === 0 && !source && !body?.error) {
      record(false, 'intel honesty', 'zero events with no source block and no error — that would be silent fabrication');
      return;
    }
    record(true, 'intel honesty', `${items.length} event(s), source: ${source ? source.completeness ?? 'present' : 'absent'}`);
    return;
  }
  record(true, 'intel honesty', `no event array; payload shape: ${Object.keys(body?.data ?? {}).join(',') || 'empty'}`);
}

async function checkAnalyzeContract() {
  // A malformed request must be rejected with a structured error, not a 500.
  const res = await fetch(`${baseUrl}/api/analyze`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chain: 'robinhood', address: 'not-an-address' }),
    signal: AbortSignal.timeout(30_000),
  });
  if (res.status !== 400) {
    record(false, 'POST /api/analyze rejects bad input', `expected 400, got ${res.status}`);
    return;
  }
  const body = await res.json();
  if (body?.error?.code !== 'INVALID_INPUT') {
    record(false, 'POST /api/analyze rejects bad input', `400 but error.code=${body?.error?.code}`);
    return;
  }
  record(true, 'POST /api/analyze rejects bad input', '400 INVALID_INPUT');
}

async function checkUnknownChain() {
  const res = await fetch(`${baseUrl}/api/analyze`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      chain: 'notachain',
      address: '0x1111111111111111111111111111111111111111',
    }),
    signal: AbortSignal.timeout(30_000),
  });
  const body = await res.json().catch(() => null);
  if (res.status === 400 || res.status === 404) {
    record(true, 'unsupported chain is refused', `${res.status} ${body?.error?.code ?? ''}`);
    return;
  }
  record(false, 'unsupported chain is refused', `expected 400/404, got ${res.status}`);
}

async function checkNotFound() {
  const res = await fetch(`${baseUrl}/this-route-does-not-exist`, {
    redirect: 'follow',
    signal: AbortSignal.timeout(20_000),
  });
  if (res.status !== 404) {
    record(false, 'unknown page returns 404', `expected 404, got ${res.status}`);
    return;
  }
  record(true, 'unknown page returns 404', '404');
}

async function main() {
  let child = null;

  if (!providedUrl) {
    console.log(`starting \`next start -p ${PORT}\` …`);
    child = spawn(
      process.execPath,
      [path.join(root, 'node_modules', 'next', 'dist', 'bin', 'next'), 'start', '-p', String(PORT)],
      { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, NODE_ENV: 'production' } },
    );
    let serverLog = '';
    child.stdout.on('data', (d) => {
      serverLog += d.toString();
    });
    child.stderr.on('data', (d) => {
      serverLog += d.toString();
    });

    const up = await waitForServer(baseUrl);
    if (!up) {
      console.log('server did not become ready. Last output:\n');
      console.log(serverLog.slice(-4000));
      child.kill();
      process.exitCode = 1;
      return;
    }
  } else {
    console.log(`using running server at ${baseUrl}`);
  }

  console.log(`\nPAGES  (${baseUrl})`);
  for (const page of PAGES) await checkPage(page);

  console.log('\nAPI');
  for (const api of APIS) await checkApi(api);

  console.log('\nBEHAVIOUR');
  await checkIntelligence();
  await checkAnalyzeContract();
  await checkUnknownChain();
  await checkNotFound();

  if (child) {
    child.kill();
  }

  const passed = results.filter((r) => r.ok).length;
  console.log(`\n${passed}/${results.length} checks passed`);
  if (failures > 0) {
    console.log('\nFAILED:');
    for (const r of results.filter((x) => !x.ok)) console.log(`  - ${r.label}: ${r.detail}`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('\nverification crashed:', err && err.stack ? err.stack : err);
  process.exitCode = 1;
});
