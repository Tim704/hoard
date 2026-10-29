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
// `{currentYear}` keeps the year pages on this year without editing the list.
const routes = JSON.parse(readFileSync(new URL('./routes.json', import.meta.url), 'utf8')).map((r) =>
  r.replaceAll('{currentYear}', String(new Date().getFullYear())),
);
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

// Next 14's dev overlay renders inside an open shadow root on <nextjs-portal>,
// so reading the host's text sees nothing. Playwright's CSS engine pierces open
// shadow roots: the error dialog and the collapsed "N errors" toast are found
// by their data attributes (the toast is only ever used for errors).
const OVERLAY = '[data-nextjs-dialog], [data-nextjs-toast]';

async function checkErrorScreen() {
  const overlay = page.locator(OVERLAY);
  if ((await overlay.count()) > 0) {
    const text = await overlay.first().innerText().catch(() => '');
    problems.push(`Next.js error overlay: ${text.replace(/\s+/g, ' ').slice(0, 300) || '(no text)'}`);
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
  } catch (err) {
    problems.push(`threw: ${err instanceof Error ? err.message : String(err)}`);
  }
  // Even after a failed step, let late effects (hydration, server actions fired
  // on mount) settle and look for the error overlay, so its text is reported.
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
  await checkErrorScreen().catch(() => {});
  problems = [...new Set(problems)];
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

// The keyboard surfaces (2.5 / 2.6): `/` opens Search everything and
// Cmd/Ctrl+K the palette, on top of a normal page.
if (failures.length === 0) {
  await step('search everything (/)', async () => {
    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'networkidle' });
    await page.locator('body').click({ position: { x: 5, y: 5 } }).catch(() => {});
    await page.keyboard.press('/');
    await page.getByRole('dialog', { name: 'Search everything' }).waitFor({ timeout: 10_000 });
    await page.keyboard.type('frieren');
    await page.getByRole('region', { name: 'Anime' }).waitFor({ timeout: 20_000 });
    await page.keyboard.press('Escape');
  });
  await step('command palette (Cmd/Ctrl+K)', async () => {
    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'networkidle' });
    await page.keyboard.press('ControlOrMeta+k');
    const box = page.getByRole('combobox', { name: 'Find a title or page' });
    await box.waitFor({ timeout: 10_000 });
    await box.fill('sett');
    await page.keyboard.press('Enter');
    await page.waitForURL((url) => url.pathname === '/settings', { timeout: 15_000 });
  });
  // TV seasons (3.3 / 4.5): the demo show's details list its seasons and
  // link to the season tier page.
  await step('tv seasons → season tiers', async () => {
    await page.goto(`${BASE_URL}/tv?open=demo-activity-tv-expanse`, { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: 'Seasons' }).waitFor({ timeout: 15_000 });
    await page.getByLabel('Watched episodes of Season 3').waitFor({ timeout: 10_000 });
    // Where to watch and sub-scores are gone from the details.
    const details = await page.getByRole('dialog').innerText();
    if (/Where to watch|Sub-scores/i.test(details)) throw new Error('the details still show Where to watch or sub-scores');
    await Promise.all([
      page.waitForURL((url) => url.pathname === '/tv/seasons/demo-activity-tv-expanse', { timeout: 20_000 }),
      page.getByRole('link', { name: 'Season tiers' }).click(),
    ]);
    await page.getByRole('heading', { name: 'Which season is better?' }).waitFor({ timeout: 15_000 });
  });
  // Taste profile (7.2): the Taste tab renders with or without one, and
  // Refresh builds it (the demo has enough finished titles). Recommend
  // across media (7.1) is on the dashboard; it is not clicked (no AI key).
  await step('taste profile refresh + recommend button', async () => {
    await page.goto(`${BASE_URL}/stats?tab=taste`, { waitUntil: 'networkidle' });
    const panel = page.getByRole('region', { name: 'Your taste profile' });
    await panel.waitFor({ timeout: 15_000 });
    const hadNone = (await panel.getByText('No taste profile yet.').count()) > 0;
    await panel.getByRole('button', { name: 'Refresh' }).click();
    await page.getByText('Taste profile updated.').waitFor({ timeout: 20_000 });
    await panel.getByText(/^Built .* from \d+ finished titles/).waitFor({ timeout: 20_000 });
    if (hadNone) console.log('    (started without a profile)');
    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Recommend across media' }).waitFor({ timeout: 10_000 });
  });
  // Settings → Accounts (8.1–8.3): each account renders either its link form
  // or a friendly "not configured" note, with or without provider keys.
  await step('settings accounts', async () => {
    await page.goto(`${BASE_URL}/settings`, { waitUntil: 'networkidle' });
    const card = page.locator('#accounts');
    await card.waitFor({ timeout: 15_000 });
    for (const [name, missing] of [
      ['Steam', /Steam isn.t configured|Linked to|Steam profile/],
      ['Last.fm', /Last\.fm isn.t configured|Linked to|Last\.fm username/],
      ['AniList', /AniList username|Pulling from/],
    ]) {
      const section = card.locator('section', { has: page.getByRole('heading', { name, exact: true }) });
      const text = await section.innerText({ timeout: 10_000 });
      const inputs = await section.locator('input').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') ?? ''));
      if (!missing.test([text, ...inputs].join('\n'))) throw new Error(`${name} section shows neither a form nor a note`);
    }
  });
  // Exports (8.4): the Markdown zip and the full JSON download with the session.
  await step('markdown + json export downloads', async () => {
    const zip = await page.request.get(`${BASE_URL}/api/export/markdown.zip`);
    if (zip.status() !== 200) throw new Error(`markdown.zip: HTTP ${zip.status()}`);
    if (!/application\/zip/.test(zip.headers()['content-type'] ?? '')) throw new Error(`markdown.zip: ${zip.headers()['content-type']}`);
    const bytes = await zip.body();
    if (bytes.length < 22 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new Error('markdown.zip is not a zip');
    const all = await page.request.get(`${BASE_URL}/api/export/all.json`);
    if (all.status() !== 200) throw new Error(`all.json: HTTP ${all.status()}`);
    const data = await all.json();
    for (const key of ['diaryEntries', 'customLists', 'savedViews', 'apiTokens', 'shareLinks']) {
      if (!Array.isArray(data[key])) throw new Error(`all.json lacks ${key}`);
    }
  });
  // Linked notes (8.5): the demo Aliens notes link to Alien (opens it, which
  // lists Aliens under "Mentioned in"); "Alien 3" isn't in the library.
  await step('linked notes + mentioned in', async () => {
    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'networkidle' });
    await page.keyboard.press('ControlOrMeta+k');
    const box = page.getByRole('combobox', { name: 'Find a title or page' });
    await box.waitFor({ timeout: 10_000 });
    await box.fill('Aliens');
    await page.getByRole('option', { name: /^Aliens/ }).first().waitFor({ timeout: 10_000 });
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('heading', { name: 'Aliens', exact: true }).waitFor({ timeout: 15_000 });
    const unresolved = dialog.locator('span[title="Not in your library"]', { hasText: 'Alien 3' });
    await unresolved.waitFor({ timeout: 10_000 });
    await dialog.getByRole('button', { name: 'Alien', exact: true }).click();
    await dialog.getByRole('heading', { name: 'Alien', exact: true }).waitFor({ timeout: 15_000 });
    await dialog.getByRole('heading', { name: 'Mentioned in' }).waitFor({ timeout: 10_000 });
    await dialog.getByRole('button', { name: /^Aliens/ }).waitFor({ timeout: 10_000 });
    // Autocomplete after [[ in the notes.
    const notes = dialog.getByLabel('Notes');
    await notes.click();
    await notes.press('End');
    await notes.pressSequentially(' [[Cowb');
    await page.getByRole('listbox', { name: 'Link to a title' }).getByRole('option', { name: /Cowboy Bebop/ }).waitFor({ timeout: 10_000 });
    await page.keyboard.press('Enter');
    const value = await notes.inputValue();
    if (!value.endsWith('[[Cowboy Bebop]]')) throw new Error(`autocomplete gave: ${value}`);
    await page.keyboard.press('Escape');
  });
  // Saved views (8.6): the demo view opens from the navigation with results.
  await step('saved view from the navigation', async () => {
    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'networkidle' });
    await Promise.all([
      page.waitForURL((url) => url.pathname === '/views' && url.searchParams.get('view') === 'demo-view-scifi', { timeout: 15_000 }),
      page.locator('aside').getByRole('link', { name: 'Sci-fi favourites' }).click(),
    ]);
    await page.getByRole('heading', { name: 'Sci-fi favourites' }).waitFor({ timeout: 15_000 });
    await page.getByText(/^\d+ titles?$/).waitFor({ timeout: 10_000 });
  });
  // API tokens (8.7): create one, call the API with it (no cookies), revoke
  // it, and see the API refuse it.
  await step('api token create → call → revoke', async () => {
    await page.goto(`${BASE_URL}/settings`, { waitUntil: 'networkidle' });
    const card = page.locator('#api-tokens');
    await card.getByText('API tokens', { exact: true }).waitFor({ timeout: 15_000 });
    await card.getByLabel('Token name').fill('smoke test');
    await card.getByRole('button', { name: 'Create token' }).click();
    const field = card.getByLabel('New API token');
    await field.waitFor({ timeout: 15_000 });
    const token = await field.inputValue();
    if (!/^hoard_[A-Za-z0-9_-]{43}$/.test(token)) throw new Error(`odd token: ${token}`);
    const call = () => fetch(`${BASE_URL}/api/v1/library?limit=1`, { headers: { Authorization: `Bearer ${token}` } });
    const ok = await call();
    if (ok.status !== 200) throw new Error(`API with a fresh token: HTTP ${ok.status}`);
    const body = await ok.json();
    if (!Array.isArray(body.items)) throw new Error('API library has no items array');
    await card.getByRole('button', { name: 'Done' }).click();
    const row = card.locator('li', { hasText: 'smoke test' });
    await row.getByRole('button', { name: 'Revoke' }).click();
    await row.getByRole('button', { name: 'Revoke “smoke test”' }).click();
    await page.getByText('Revoked “smoke test”.').waitFor({ timeout: 15_000 });
    const gone = await call();
    if (gone.status !== 401) throw new Error(`API with a revoked token: HTTP ${gone.status}`);
  });
  // Compare and the feed (9.1 / 9.2) against the seeded, opted-in demo2:
  // turn both opt-ins on, see the comparison, the feed and the Friends links;
  // then, as demo2, see demo vanish from Compare the moment demo opts out
  // (the same answer as for an unknown user), and come back after.
  const setOptIn = async (card, on, toast) => {
    await page.goto(`${BASE_URL}/settings`, { waitUntil: 'networkidle' });
    const box = page.locator(`${card} input[type="checkbox"]`);
    await box.waitFor({ timeout: 15_000 });
    if ((await box.isChecked()) !== on) {
      await box.click();
      await page.getByText(toast).first().waitFor({ timeout: 15_000 });
    }
  };
  await step('compare + feed with demo2', async () => {
    await setOptIn('#compare', true, 'Others can now compare with you.');
    await setOptIn('#feed', true, 'Your activity now shows in the feed.');
    await page.goto(`${BASE_URL}/compare`, { waitUntil: 'networkidle' });
    await page.getByRole('link', { name: 'demo2' }).click();
    await page.waitForURL((url) => url.pathname === '/compare/demo2', { timeout: 15_000 });
    await page.getByRole('heading', { name: 'You and demo2' }).waitFor({ timeout: 15_000 });
    const main = await page.locator('main').innerText();
    if (!/\d+%/.test(main)) throw new Error('no compatibility score on /compare/demo2');
    if (!/Mob Psycho 100/.test(main)) throw new Error('their S tier misses Mob Psycho 100');
    if (!/Titles you both have \(\d+\)/.test(main)) throw new Error('no shared titles count');
    await page.goto(`${BASE_URL}/feed`, { waitUntil: 'networkidle' });
    await page.getByText('demo2', { exact: true }).first().waitFor({ timeout: 15_000 });
    for (const name of ['Feed', 'Compare', 'Watch together']) {
      await page.locator('aside').getByRole('link', { name, exact: true }).waitFor({ timeout: 10_000 });
    }

    const friend = await browser.newContext();
    try {
      const p = await friend.newPage();
      await p.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
      await p.fill('#username', 'demo2');
      await p.fill('#password', PASSWORD);
      await Promise.all([p.waitForURL((url) => url.pathname === '/dashboard', { timeout: 20_000 }), p.click('button[type="submit"]')]);
      await p.goto(`${BASE_URL}/compare/demo`, { waitUntil: 'networkidle' });
      await p.getByRole('heading', { name: 'You and demo' }).waitFor({ timeout: 15_000 });

      await setOptIn('#compare', false, 'Comparing turned off.');
      await p.goto(`${BASE_URL}/compare/demo`, { waitUntil: 'networkidle' });
      const off = await p.locator('main').innerText();
      await p.goto(`${BASE_URL}/compare/no-such-user`, { waitUntil: 'networkidle' });
      const unknown = await p.locator('main').innerText();
      if (/demo/.test(off.replace(/demo2/g, '')) || off !== unknown) throw new Error('an opted-out user is answered differently from an unknown one');
      await p.goto(`${BASE_URL}/compare`, { waitUntil: 'networkidle' });
      if ((await p.getByRole('link', { name: 'demo', exact: true }).count()) > 0) throw new Error('an opted-out user is still listed');
    } finally {
      await friend.close();
      await setOptIn('#compare', true, 'Others can now compare with you.');
    }
  });
  // Signed out, a shared link survives the login (next=…).
  await step('login keeps the shared /add link', async () => {
    const fresh = await browser.newContext();
    try {
      const p = await fresh.newPage();
      await p.goto(`${BASE_URL}/add?url=https%3A%2F%2Fanilist.co%2Fanime%2F1`, { waitUntil: 'networkidle' });
      const at = new URL(p.url());
      if (at.pathname !== '/login' || at.searchParams.get('next') !== '/add?url=https%3A%2F%2Fanilist.co%2Fanime%2F1') {
        throw new Error(`expected /login?next=…, got ${p.url()}`);
      }
      await p.fill('#username', USER);
      await p.fill('#password', PASSWORD);
      await Promise.all([
        p.waitForURL((url) => url.pathname === '/add' && url.searchParams.get('url') === 'https://anilist.co/anime/1', { timeout: 20_000 }),
        p.click('button[type="submit"]'),
      ]);
    } finally {
      await fresh.close();
    }
  });
}

await browser.close();

if (failures.length) {
  console.log(`\nSmoke FAILED: ${failures.length} of ${routes.length + 1} steps had problems.`);
  process.exit(1);
}
console.log(`\nSmoke passed: login + ${routes.length} routes + the search surfaces clean.`);
