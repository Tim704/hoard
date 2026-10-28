// ───────────────────────────────────────────────────────────────────────────
//  Smoke test: drives the locally installed Google Chrome (playwright-core,
//  no bundled browser) against an ALREADY RUNNING server. It logs in as the
//  demo user through the real login form, then visits every route in
//  e2e/routes.json and fails on:
//    - console errors (third-party image/CDN load failures excepted),
//    - uncaught page errors,
//    - same-origin requests that fail or answer ≥ 500,
//    - a page that does not load (≥ 400) or bounces to /login,
//    - the Next.js error overlay / "Application error" screen.
//
//  Usage: BASE_URL=http://localhost:3000 npm run smoke
//  Env:   SMOKE_USER / SMOKE_PASSWORD (default demo / demo1234),
//         CHROME_PATH to use a specific Chrome binary.
// ───────────────────────────────────────────────────────────────────────────

import { readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

const BASE_URL = (process.env.BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const USER = process.env.SMOKE_USER ?? 'demo';
const PASSWORD = process.env.SMOKE_PASSWORD ?? 'demo1234';
const routes = JSON.parse(readFileSync(new URL('./routes.json', import.meta.url), 'utf8'));
const origin = new URL(BASE_URL).origin;

const sameOrigin = (url) => {
  try {
    return new URL(url).origin === origin;
  } catch {
    return false;
  }
};

const browser = await chromium.launch(
  process.env.CHROME_PATH
    ? { executablePath: process.env.CHROME_PATH, headless: true }
    : { channel: 'chrome', headless: true },
);
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();

/** Problems seen while the current step runs. */
let problems = [];
const failures = [];

page.on('console', (msg) => {
  if (msg.type() !== 'error') return;
  const loc = msg.location()?.url ?? '';
  // A poster that fails to load from a provider CDN is not an app error.
  if (/Failed to load resource/.test(msg.text()) && loc && !sameOrigin(loc)) return;
  problems.push(`console error: ${msg.text()}${loc ? ` (${loc})` : ''}`);
});
page.on('pageerror', (err) => problems.push(`page error: ${err.message}`));
page.on('response', (res) => {
  if (res.status() >= 500 && sameOrigin(res.url())) {
    problems.push(`HTTP ${res.status()} ${res.request().method()} ${res.url()}`);
  }
});
page.on('requestfailed', (req) => {
  const reason = req.failure()?.errorText ?? '';
  // Navigations cancel in-flight prefetches; that is not a failure.
  if (!sameOrigin(req.url()) || /ERR_ABORTED|NS_BINDING_ABORTED/.test(reason)) return;
  problems.push(`request failed: ${req.method()} ${req.url()} ${reason}`);
});

async function checkErrorScreen() {
  const overlay = await page.locator('nextjs-portal').count();
  if (overlay > 0) {
    const text = await page.locator('nextjs-portal').first().innerText().catch(() => '');
    // The dev overlay's portal exists but stays empty when there is no error.
    if (text.trim()) problems.push(`Next.js error overlay: ${text.slice(0, 300)}`);
  }
  const body = await page.locator('body').innerText().catch(() => '');
  if (/Application error: a (client|server)-side exception|Unhandled Runtime Error|Internal Server Error/.test(body)) {
    problems.push(`error screen: ${body.slice(0, 300)}`);
  }
}

async function step(name, fn) {
  problems = [];
  const started = Date.now();
  try {
    await fn();
    // Let late effects (hydration, server actions fired on mount) settle.
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
    await checkErrorScreen();
  } catch (err) {
    problems.push(`threw: ${err instanceof Error ? err.message : String(err)}`);
  }
  const ms = Date.now() - started;
  if (problems.length) {
    failures.push({ name, problems });
    console.log(`✗ ${name} (${ms} ms)`);
    for (const p of problems) console.log(`    ${p}`);
  } else {
    console.log(`✓ ${name} (${ms} ms)`);
  }
}

console.log(`Smoke test against ${BASE_URL}`);

await step('login', async () => {
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
  await page.fill('#username', USER);
  await page.fill('#password', PASSWORD);
  await Promise.all([
    page.waitForURL((url) => url.pathname === '/dashboard', { timeout: 20_000 }),
    page.click('button[type="submit"]'),
  ]);
});

if (failures.length === 0) {
  for (const route of routes) {
    await step(route, async () => {
      const res = await page.goto(`${BASE_URL}${route}`, { waitUntil: 'networkidle', timeout: 45_000 });
      if (!res) throw new Error('no response');
      if (res.status() >= 400) throw new Error(`HTTP ${res.status()}`);
      if (new URL(page.url()).pathname === '/login') throw new Error('redirected to /login');
    });
  }
}

await browser.close();

if (failures.length) {
  console.log(`\nSmoke FAILED: ${failures.length} of ${routes.length + 1} steps had problems.`);
  process.exit(1);
}
console.log(`\nSmoke passed: login + ${routes.length} routes clean.`);
