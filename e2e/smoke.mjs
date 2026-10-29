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

const docState = () =>
  page.evaluate(() => ({
    layout: document.documentElement.dataset.layout,
    dark: document.documentElement.classList.contains('dark'),
  }));

/**
 * Settings → Themes: click a layout's thumbnail and wait for it to apply at
 * once and save ("Layout: X" toast). A no-op when it is already chosen.
 */
async function pickLayout(label) {
  if (new URL(page.url()).searchParams.get('tab') !== 'themes') {
    await page.goto(`${BASE_URL}/settings?tab=themes`, { waitUntil: 'networkidle' });
  }
  const radio = page.getByRole('radio', { name: label, exact: true });
  await radio.waitFor({ state: 'attached', timeout: 15_000 });
  if (await radio.isChecked()) return;
  await page.locator('label', { has: radio }).click();
  const id = label.toLowerCase();
  const now = await docState();
  if (now.layout !== id) throw new Error(`clicking ${label} left data-layout at ${now.layout}`);
  await page.getByText(`Layout: ${label}`).first().waitFor({ timeout: 15_000 });
  if (!(await radio.isChecked())) throw new Error(`${label} is not shown as chosen`);
}

/**
 * Opens the user menu through whichever trigger the layout shows (Classic's
 * "Signed in as" block, a sidebar row or a top bar's avatar).
 */
async function openUserMenu(p = page) {
  await p.locator('[data-user-menu]').filter({ visible: true }).first().click();
  const menu = p.getByRole('menu');
  await menu.waitFor({ timeout: 10_000 });
  return menu;
}

/**
 * The demo's only game (Outer Wilds): its id, read off its popup's Notes
 * field on the Video Games page (popup mode).
 */
let demoGameId = null;
async function gameId() {
  if (demoGameId) return demoGameId;
  await page.goto(`${BASE_URL}/games`, { waitUntil: 'networkidle' });
  await page.locator('main [data-card]').first().click();
  const field = page.getByRole('dialog').locator('textarea[id^="notes-"]');
  await field.waitFor({ timeout: 15_000 });
  demoGameId = (await field.getAttribute('id')).slice('notes-'.length);
  await page.keyboard.press('Escape');
  return demoGameId;
}

/**
 * The dashboard at the current width: nothing scrolls sideways, the header
 * is one row (the greeting beside Recommend and Customize, both named in
 * every layout), and every section tile's status line is one row that
 * doesn't spill.
 */
async function checkDashboard(where) {
  await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'networkidle' });
  for (const name of ['Recommend across media', 'Customize dashboard']) {
    if (!(await page.getByRole('button', { name, exact: true }).isVisible())) throw new Error(`${where}: no ${name} button`);
  }
  const m = await page.evaluate(() => {
    const [greeting, buttons] = [...document.querySelector('[data-dashboard-header]').children].map((el) => el.getBoundingClientRect());
    const lines = [...document.querySelectorAll('[data-dashboard-tiles] div')].filter(
      (el) => getComputedStyle(el).display === 'flex' && /^\s*\d[\d,.]*\s*ongoing/.test(el.textContent ?? ''),
    );
    const tops = (el) => new Set([...el.children].map((c) => Math.round(c.getBoundingClientRect().top))).size;
    const right = (el) => Math.max(...[...el.children].map((c) => c.getBoundingClientRect().right));
    return {
      overflow: document.documentElement.scrollWidth - window.innerWidth,
      oneRow: buttons.top < greeting.bottom && buttons.left >= greeting.right - 1,
      lines: lines.length,
      wrapped: lines.filter((el) => tops(el) > 1).length,
      spilled: lines.filter((el) => right(el) > el.getBoundingClientRect().right + 1).length,
    };
  });
  if (m.overflow > 0) throw new Error(`${where}: the dashboard scrolls sideways by ${m.overflow}px`);
  if (!m.oneRow) throw new Error(`${where}: the dashboard header wraps`);
  if (m.lines === 0) throw new Error(`${where}: no section tile status lines found`);
  if (m.wrapped || m.spilled) throw new Error(`${where}: ${m.wrapped} status lines wrap, ${m.spilled} spill`);
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

// While the route list loads, provider posters and covers are a 1×1 GIF: a
// slow image host (archive.org behind Open Library's covers can hang for
// 30 s) must not hold a page's network idle. The list doesn't read their
// pixels, and their load failures were never app errors (see the console
// filter). Later steps get the real images, as before.
const PIXEL = Buffer.from('R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==', 'base64');
const crossOrigin = (url) => !sameOrigin(url.href);
const stubImage = (route) =>
  route.request().resourceType() === 'image'
    ? route.fulfill({ status: 200, contentType: 'image/gif', body: PIXEL })
    : route.continue();

if (failures.length === 0) {
  await context.route(crossOrigin, stubImage);
  try {
    for (const route of routes) {
      await step(route, async () => {
        const res = await page.goto(`${BASE_URL}${route}`, { waitUntil: 'networkidle', timeout: 45_000 });
        if (!res) throw new Error('no response');
        if (res.status() >= 400) throw new Error(`HTTP ${res.status()}`);
        if (new URL(page.url()).pathname === '/login') throw new Error('redirected to /login');
      });
    }
  } finally {
    await context.unroute(crossOrigin, stubImage);
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
  // A shared link that isn't a known site falls back to searching the shared
  // title. The link is a .localhost one, which the page fetcher refuses
  // before any DNS lookup (safe-fetch.ts), so this never waits on the
  // internet; so is the matching entry in routes.json.
  await step('shared unknown link → search for its title', async () => {
    await page.goto(`${BASE_URL}/add?title=Dune&url=${encodeURIComponent('https://dune.localhost/book')}`, { waitUntil: 'domcontentloaded' });
    await page.getByText(/Couldn.t recognise that link/).waitFor({ timeout: 10_000 });
    const box = page.getByPlaceholder('Search every section…');
    await box.waitFor({ timeout: 10_000 });
    if ((await box.inputValue()) !== 'Dune') throw new Error(`the fallback searches for "${await box.inputValue()}", not the shared title`);
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
  // Layouts: <html data-layout> is server-rendered (Classic by default and
  // when signed out), React leaves <html>'s class to the theme script, and
  // Classic keeps the light/dark toggle.
  await step('classic layout on <html>', async () => {
    const ssr = await (await page.request.get(`${BASE_URL}/dashboard`)).text();
    const tag = ssr.match(/<html[^>]*>/)?.[0] ?? '';
    if (!/data-layout="classic"/.test(tag) || /class=/.test(tag)) throw new Error(`server-rendered ${tag}`);
    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'networkidle' });
    const html = await page.evaluate(() => ({ layout: document.documentElement.dataset.layout, cls: document.documentElement.className }));
    if (html.layout !== 'classic') throw new Error(`data-layout is ${html.layout}`);
    if (html.cls !== '' && html.cls !== 'dark') throw new Error(`unexpected <html> class: ${html.cls}`);
    await page.locator('aside').getByRole('button', { name: 'Toggle theme' }).waitFor({ timeout: 10_000 });
    const signedOut = await browser.newContext();
    try {
      const p = await signedOut.newPage();
      await p.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
      const layout = await p.evaluate(() => document.documentElement.dataset.layout);
      if (layout !== 'classic') throw new Error(`signed out, data-layout is ${layout}`);
    } finally {
      await signedOut.close();
    }
  });
  // Settings → Themes (layouts): each thumbnail switches <html data-layout>
  // at once (Fresh forces dark) and saves; Classic is restored and survives
  // a reload.
  await step('layout picker', async () => {
    await page.goto(`${BASE_URL}/settings?tab=themes`, { waitUntil: 'networkidle' });
    try {
      for (const label of ['Minimal', 'Organised', 'Fresh', 'Classic']) {
        await pickLayout(label);
        // Only Fresh forces dark (the smoke browser is light and stores no theme).
        const s = await docState();
        if (s.dark !== (label === 'Fresh')) throw new Error(`${label}: ${JSON.stringify(s)}`);
      }
      // Arrowing through the thumbnails switches at once each time but saves
      // once, after the last (one server action, one toast). The radio keeps
      // focus although the chrome changes around the page each time.
      const saves = [];
      const onRequest = (req) => {
        if (req.method() === 'POST' && req.headers()['next-action']) saves.push(req.url());
      };
      page.on('request', onRequest);
      try {
        await page.getByRole('radio', { name: 'Classic', exact: true }).focus();
        for (const want of ['minimal', 'organised', 'fresh']) {
          await page.keyboard.press('ArrowRight');
          const s = await docState();
          if (s.layout !== want) throw new Error(`arrow → ${want}: data-layout is ${s.layout}`);
          const focused = await page.evaluate(() => {
            const el = document.activeElement;
            return el instanceof HTMLInputElement && el.name === 'layout' ? el.value : el?.outerHTML.slice(0, 80) ?? null;
          });
          if (focused !== want) throw new Error(`arrow → ${want}: focus is on ${focused}`);
        }
        await page.getByText('Layout: Fresh').first().waitFor({ timeout: 15_000 });
        await page.waitForLoadState('networkidle');
        if (saves.length !== 1) throw new Error(`an arrow burst sent ${saves.length} saves, not 1`);
        // Undo goes back to before the burst.
        await page.getByRole('button', { name: 'Undo' }).click();
        await page.getByText('Undone.').first().waitFor({ timeout: 15_000 });
        const s = await docState();
        if (s.layout !== 'classic') throw new Error(`Undo after the burst left ${s.layout}`);
      } finally {
        page.off('request', onRequest);
      }
      // The title view uses the same picker.
      await page.locator('label', { has: page.getByRole('radio', { name: 'Full page', exact: true }) }).click();
      await page.getByText('Title view: Full page').first().waitFor({ timeout: 15_000 });
      await page.locator('label', { has: page.getByRole('radio', { name: 'Popup', exact: true }) }).click();
      await page.getByText('Title view: Popup').first().waitFor({ timeout: 15_000 });
    } finally {
      await pickLayout('Classic');
    }
    await page.reload({ waitUntil: 'networkidle' });
    const s = await docState();
    if (s.layout !== 'classic') throw new Error(`after a reload: ${JSON.stringify(s)}`);
    if (!(await page.getByRole('radio', { name: 'Classic', exact: true }).isChecked())) throw new Error('Classic not chosen after a reload');
  });
  // A Fresh user's forced dark survives the client-side navigations of
  // logging out (back to Classic and light) and in (dark again, with no page
  // load to rerun the head script). The layout is set with the picker.
  await step('fresh layout across logout + login', async () => {
    const login = async () => {
      await page.fill('#username', USER);
      await page.fill('#password', PASSWORD);
      await Promise.all([
        page.waitForURL((url) => url.pathname === '/dashboard', { timeout: 20_000 }),
        page.click('button[type="submit"]'),
      ]);
      await page.waitForLoadState('networkidle');
    };
    try {
      await pickLayout('Fresh');
      await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'networkidle' });
      let s = await docState();
      if (s.layout !== 'fresh' || !s.dark) throw new Error(`Fresh after a reload: ${JSON.stringify(s)}`);
      // Fresh has no sidebar: the user menu logs out.
      const menu = await openUserMenu();
      await Promise.all([
        page.waitForURL((url) => url.pathname === '/login', { timeout: 20_000 }),
        menu.getByRole('menuitem', { name: 'Log out', exact: true }).click(),
      ]);
      await page.waitForLoadState('networkidle');
      s = await docState();
      if (s.layout !== 'classic' || s.dark) throw new Error(`after logging out of Fresh: ${JSON.stringify(s)}`);
      await login();
      s = await docState();
      if (s.layout !== 'fresh' || !s.dark) throw new Error(`after logging in to Fresh: ${JSON.stringify(s)}`);
    } finally {
      if (new URL(page.url()).pathname === '/login') await login().catch(() => {});
      await pickLayout('Classic');
      await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'networkidle' });
      const s = await docState();
      if (s.layout !== 'classic' || s.dark) throw new Error(`Classic not restored: ${JSON.stringify(s)}`);
    }
  });
  // Old single-page Settings links (/settings#card, stored in notifications)
  // land on the card's tab, scrolled to the card.
  await step('settings #anchor links → tabs', async () => {
    for (const [anchor, tab, title] of [
      ['api-tokens', 'data', 'API tokens'],
      ['compare', 'sharing', 'Compare with other users'],
      ['system', 'system', 'System'],
    ]) {
      await page.goto(`${BASE_URL}/settings#${anchor}`, { waitUntil: 'networkidle' });
      await page.waitForURL((url) => url.searchParams.get('tab') === tab && url.hash === `#${anchor}`, { timeout: 15_000 });
      const card = page.locator(`#${anchor}`);
      await card.getByText(title, { exact: true }).first().waitFor({ timeout: 15_000 });
      const current = await page.locator('nav[aria-label="Settings"] [aria-current="page"]').innerText();
      if (current.trim() !== { data: 'Data', sharing: 'Sharing & privacy', system: 'System' }[tab]) throw new Error(`#${anchor}: ${current} is open`);
      await page.waitForFunction((id) => {
        const r = document.getElementById(id)?.getBoundingClientRect();
        return !!r && r.top >= 0 && r.top < window.innerHeight;
      }, anchor, { timeout: 10_000 });
    }
    // The AniList OAuth callback's result is toasted as the page mounts
    // (the Toaster must already listen), then the URL is tidied.
    await page.goto(`${BASE_URL}/settings?tab=accounts&anilist=expired`, { waitUntil: 'networkidle' });
    await page.getByText('That AniList connection link expired or belongs to another session. Try again.').waitFor({ timeout: 10_000 });
    await page.waitForURL((url) => url.search === '?tab=accounts', { timeout: 10_000 });
    // System is the owner's: anyone else's old #system link ends on a clean General.
    const member = await browser.newContext();
    try {
      const p = await member.newPage();
      await p.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
      await p.fill('#username', 'demo2');
      await p.fill('#password', PASSWORD);
      await Promise.all([p.waitForURL((url) => url.pathname === '/dashboard', { timeout: 20_000 }), p.click('button[type="submit"]')]);
      await p.goto(`${BASE_URL}/settings#system`, { waitUntil: 'networkidle' });
      await p.waitForURL((url) => url.search === '?tab=general' && url.hash === '', { timeout: 15_000 });
      const nav = await p.locator('nav[aria-label="Settings"]').innerText();
      if (/System/.test(nav)) throw new Error('a non-owner sees the System tab');
      if ((await p.locator('#system').count()) > 0) throw new Error('a non-owner sees the System card');
    } finally {
      await member.close();
    }
  });
  // A clicked tab shows as open at once, while its cards load (the request
  // is held here), and the old cards are marked busy.
  await step('settings tab switch shows at once', async () => {
    await page.goto(`${BASE_URL}/settings?tab=themes`, { waitUntil: 'networkidle' });
    const held = [];
    const dataTab = (url) => url.pathname === '/settings' && url.searchParams.get('tab') === 'data';
    await page.route(dataTab, (route) => {
      const h = route.request().headers();
      if (h.rsc && !h['next-router-prefetch']) held.push(route);
      else route.continue();
    });
    try {
      await page.locator('nav[aria-label="Settings"]').getByRole('link', { name: 'Data' }).click();
      await page.waitForFunction(() => {
        const current = document.querySelector('nav[aria-label="Settings"] [aria-current="page"]');
        return current?.textContent?.trim() === 'Data' && !!document.querySelector('[aria-busy="true"]');
      }, null, { timeout: 10_000 });
      if (new URL(page.url()).searchParams.get('tab') !== 'themes') throw new Error('navigated before the cards loaded');
      if (held.length === 0) throw new Error('the Data tab request was not seen');
    } finally {
      await page.unroute(dataTab);
      for (const r of held) await r.continue().catch(() => {});
    }
    await page.waitForURL((url) => url.searchParams.get('tab') === 'data', { timeout: 15_000 });
    await page.locator('#api-tokens').waitFor({ timeout: 15_000 });
    if ((await page.locator('[aria-busy="true"]').count()) > 0) throw new Error('still busy after loading');
  });
  // Phones: the tabs are one strip that scrolls sideways (the open one in
  // view), the layout picker is two by two, and nothing scrolls the page
  // sideways.
  await step('settings at 375 px', async () => {
    await page.setViewportSize({ width: 375, height: 812 });
    try {
      for (const tab of ['themes', 'general', 'accounts', 'notifications', 'sharing', 'data', 'system']) {
        await page.goto(`${BASE_URL}/settings?tab=${tab}`, { waitUntil: 'networkidle' });
        const m = await page.evaluate(() => {
          const strip = document.querySelector('nav[aria-label="Settings"] ul');
          const tops = [...strip.querySelectorAll('li')].map((li) => Math.round(li.getBoundingClientRect().top));
          const s = strip.getBoundingClientRect();
          const a = strip.querySelector('[aria-current="page"]').getBoundingClientRect();
          const radios = [...document.querySelectorAll('input[name="layout"]')].map((r) => r.closest('label').getBoundingClientRect());
          return {
            overflow: document.documentElement.scrollWidth - window.innerWidth,
            rows: new Set(tops).size,
            activeInView: a.left >= s.left - 1 && a.right <= s.right + 1,
            pickerRows: new Set(radios.map((r) => Math.round(r.top))).size,
            pickerCols: new Set(radios.map((r) => Math.round(r.left))).size,
          };
        });
        if (m.overflow > 0) throw new Error(`${tab}: the page scrolls sideways by ${m.overflow}px`);
        if (m.rows !== 1) throw new Error(`${tab}: the tab strip wraps onto ${m.rows} rows`);
        if (!m.activeInView) throw new Error(`${tab}: the open tab is scrolled out of the strip`);
        if (tab === 'themes' && (m.pickerRows !== 2 || m.pickerCols !== 2)) throw new Error(`picker is ${m.pickerCols}×${m.pickerRows}`);
      }
    } finally {
      await page.setViewportSize({ width: 1280, height: 900 });
    }
  });
  // Fresh's tab strip on a full page load (a fresh tab): the open tab is in
  // view from the first painted frame on (no jump at hydration), and the
  // strip fades out where it is clipped (the end at 768 px).
  const checkFreshStrip = async () => {
    const p = await context.newPage();
    p.on('pageerror', (err) => problems.push(`page error: ${err.message}`));
    try {
      await p.addInitScript(() => {
        const frames = [];
        let n = 0;
        window.__stripFrames = frames;
        const tick = () => {
          const ul = document.querySelector('[data-shell] nav[aria-label="Main"] ul');
          if (ul) frames.push(ul.scrollLeft);
          if (++n < 60) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
      const strip = () =>
        p.evaluate(() => {
          const ul = document.querySelector('[data-shell] nav[aria-label="Main"] ul');
          const u = ul.getBoundingClientRect();
          const a = ul.querySelector('[aria-current="page"]').getBoundingClientRect();
          return { frames: window.__stripFrames, fade: ul.dataset.fade ?? '', inView: a.left >= u.left - 1 && a.right <= u.right + 1 };
        });
      await p.setViewportSize({ width: 375, height: 812 });
      await p.goto(`${BASE_URL}/music`, { waitUntil: 'networkidle' });
      const phone = await strip();
      if (!phone.inView) throw new Error('Fresh at 375: Albums is scrolled out of the strip');
      if (!phone.frames.length || phone.frames[0] <= 0 || new Set(phone.frames).size !== 1) {
        throw new Error(`Fresh at 375: the strip moved after the first paint (${phone.frames.join(',')})`);
      }
      if (phone.fade !== 'start') throw new Error(`Fresh at 375 on Albums: data-fade is "${phone.fade}"`);
      await p.setViewportSize({ width: 768, height: 900 });
      await p.goto(`${BASE_URL}/dashboard`, { waitUntil: 'networkidle' });
      const tablet = await strip();
      if (tablet.fade !== 'end') throw new Error(`Fresh at 768 on Home: data-fade is "${tablet.fade}"`);
    } finally {
      await p.close();
    }
  };
  // The shell in every layout, at desktop and phone width: no search button
  // and no bell in the chrome, the layout's navigation marks the open
  // section, the user menu has Settings and Log out and opens
  // Notifications, nothing scrolls sideways; with a sticky top bar, Settings'
  // side list sticks below it. Classic is restored afterwards.
  await step('navigation in every layout', async () => {
    try {
      for (const label of ['Classic', 'Minimal', 'Organised', 'Fresh']) {
        await pickLayout(label);
        for (const width of [1280, 375]) {
          const where = `${label} at ${width}`;
          await page.setViewportSize({ width, height: width === 375 ? 812 : 900 });
          await page.goto(`${BASE_URL}/books`, { waitUntil: 'networkidle' });
          const chrome = await page.evaluate(() => {
            const shown = (el) => el.getClientRects().length > 0;
            const controls = [...document.querySelectorAll('[data-shell] button, [data-shell] a')].filter(shown);
            const current = controls.filter((el) => el.getAttribute('aria-current') === 'page').map((el) => el.textContent.trim());
            const tabs = [...document.querySelectorAll('[data-shell] nav[aria-label="Main"] li')].filter(shown);
            return {
              overflow: document.documentElement.scrollWidth - window.innerWidth,
              stray: controls
                .map((el) => `${el.getAttribute('aria-label') ?? ''} ${el.getAttribute('title') ?? ''} ${el.textContent ?? ''}`)
                .filter((t) => /search|notification|bell/i.test(t) && !/account menu/i.test(t)),
              current,
              tabRows: new Set(tabs.map((li) => Math.round(li.getBoundingClientRect().top))).size,
            };
          });
          if (chrome.overflow > 0) throw new Error(`${where}: the page scrolls sideways by ${chrome.overflow}px`);
          if (chrome.stray.length) throw new Error(`${where}: search or bell in the chrome: ${chrome.stray.join(' | ')}`);
          if (label === 'Fresh' && chrome.tabRows !== 1) throw new Error(`${where}: the tabs wrap onto ${chrome.tabRows} rows`);
          if (width === 375 && label !== 'Fresh') {
            // Phones: the sections are in the drawer.
            await page.getByRole('button', { name: 'Open navigation' }).click();
            const drawer = page.getByRole('dialog', { name: 'HOARD' });
            const books = drawer.getByRole('link', { name: 'Books', exact: true });
            await books.waitFor({ timeout: 10_000 });
            if ((await books.getAttribute('aria-current')) !== 'page') throw new Error(`${where}: Books is not current in the drawer`);
            await page.keyboard.press('Escape');
            await drawer.waitFor({ state: 'hidden', timeout: 10_000 });
          } else if (!chrome.current.includes('Books')) {
            throw new Error(`${where}: the navigation doesn't mark Books (current: ${chrome.current.join(', ') || 'none'})`);
          }
          const menu = await openUserMenu();
          for (const name of ['Settings', 'Log out', 'Search', 'Command palette']) {
            await menu.getByRole('menuitem', { name, exact: true }).waitFor({ timeout: 10_000 });
          }
          const themeItems = await menu.getByRole('menuitem', { name: /^(Dark|Light) mode$/ }).count();
          if (themeItems !== (label === 'Fresh' ? 0 : 1)) throw new Error(`${where}: ${themeItems} theme items in the menu`);
          await menu.getByRole('menuitem', { name: /^Notifications/ }).click();
          const sheet = page.getByRole('dialog', { name: 'Notifications' });
          await sheet.getByRole('button', { name: 'Mark all read' }).waitFor({ timeout: 10_000 });
          await page.keyboard.press('Escape');
          await sheet.waitFor({ state: 'hidden', timeout: 10_000 });
          // Closing it hands focus back to the menu's trigger, not <body>.
          const back = await page.evaluate(() => document.activeElement?.matches('[data-user-menu]') ?? false);
          if (!back) throw new Error(`${where}: focus didn't return to the user menu after Notifications`);
          const after = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
          if (after > 0) throw new Error(`${where}: the page scrolls sideways by ${after}px after the menu`);
        }
        if (label === 'Fresh') await checkFreshStrip();
        if (label === 'Minimal' || label === 'Fresh') {
          await page.setViewportSize({ width: 1280, height: 600 });
          await page.goto(`${BASE_URL}/settings?tab=general`, { waitUntil: 'networkidle' });
          await page.evaluate(() => window.scrollTo(0, 400));
          const m = await page.evaluate(() => ({
            scrolled: window.scrollY,
            bar: [...document.querySelectorAll('header[data-shell]')].find((h) => h.getClientRects().length > 0)?.getBoundingClientRect().bottom ?? 0,
            list: document.querySelector('nav[aria-label="Settings"]').getBoundingClientRect().top,
          }));
          if (m.scrolled < 100) throw new Error(`${label}: Settings didn't scroll (${m.scrolled}px)`);
          if (Math.abs(m.list - (m.bar + 24)) > 2) throw new Error(`${label}: the Settings list sticks at ${m.list}px, not below the ${m.bar}px top bar`);
        }
      }
    } finally {
      await page.setViewportSize({ width: 1280, height: 900 });
      await pickLayout('Classic');
    }
  });
  // The section toolbar in every layout, at desktop and phone width, on
  // Books and Video Games (the longest "Add …"): one row that never wraps
  // or overflows, every control the same height; the Filters popover
  // applies a status (the count on the button follows, Clear filters clears
  // it), while a sort doesn't count and has its own "Default sort &
  // grouping"; in Classic on a phone the folded items are in More. Then the cards on TV Shows (the demo show is
  // ongoing, with progress): Classic's plain card has no progress bar,
  // Organised shows at most one badge (the show's progress), Minimal and
  // Fresh render their own cards. On a phone, pages whose rows used to wrap
  // don't scroll sideways. Classic is restored afterwards.
  await step('section toolbar and cards in every layout', async () => {
    try {
      for (const label of ['Classic', 'Minimal', 'Organised', 'Fresh']) {
        await pickLayout(label);
        for (const width of [1280, 375]) {
          await page.setViewportSize({ width, height: width === 375 ? 812 : 900 });
          for (const path of ['/books', '/games']) {
            const where = `${label} ${path} at ${width}`;
            await page.goto(`${BASE_URL}${path}`, { waitUntil: 'networkidle' });
            const m = await page.evaluate(() => {
              const bar = document.querySelector('[data-section-toolbar]');
              const items = [...bar.children].filter((el) => el.getClientRects().length > 0);
              const r = bar.getBoundingClientRect();
              return {
                rows: new Set(items.map((el) => Math.round(el.getBoundingClientRect().top + el.getBoundingClientRect().height / 2))).size,
                height: Math.round(r.height),
                tallest: Math.max(...items.map((el) => Math.round(el.getBoundingClientRect().height))),
                spill: Math.max(bar.scrollWidth - bar.clientWidth, Math.round(Math.max(...items.map((el) => el.getBoundingClientRect().right)) - r.right)),
                overflow: document.documentElement.scrollWidth - window.innerWidth,
                filter: Math.round(bar.querySelector('input').getBoundingClientRect().width),
                heights: [...new Set(items.map((el) => Math.round(el.getBoundingClientRect().height)))],
              };
            });
            if (m.rows !== 1 || m.height > m.tallest + 1) throw new Error(`${where}: the toolbar is ${m.rows} rows, ${m.height}px tall`);
            if (m.spill > 0) throw new Error(`${where}: the toolbar spills ${m.spill}px`);
            if (m.overflow > 0) throw new Error(`${where}: the page scrolls sideways by ${m.overflow}px`);
            if (m.filter < 96) throw new Error(`${where}: the title filter is squeezed to ${m.filter}px`);
            if (m.heights.length !== 1) throw new Error(`${where}: the controls are ${m.heights.join(' / ')}px tall`);
            if (path !== '/books') continue;
            const toolbar = page.locator('[data-section-toolbar]');
            const filters = toolbar.locator('[data-filter-count]');
            const count = () => filters.getAttribute('data-filter-count');
            if ((await count()) !== '0') throw new Error(`${where}: Filters starts at ${await count()}`);
            await filters.click();
            const popover = page.getByRole('dialog', { name: 'Filters' });
            await popover.getByRole('combobox', { name: 'Status' }).click();
            await page.getByRole('option', { name: 'Reading', exact: true }).click();
            const counted = (n) =>
              page
                .waitForFunction((want) => document.querySelector('[data-filter-count]')?.getAttribute('data-filter-count') === want, n, { timeout: 10_000 })
                .catch(async () => {
                  throw new Error(`${where}: Filters counts ${await count()}, not ${n}`);
                });
            await counted('1');
            const sections = await page.locator('main section button[aria-controls^="section-"]').evaluateAll((els) => els.map((el) => el.getAttribute('aria-controls')));
            if (sections.join() !== 'section-books-CONSUMING') throw new Error(`${where}: filtered to Reading, the page shows ${sections.join(', ')}`);
            if ((await filters.getAttribute('aria-label')) !== 'Filters (1 active)') throw new Error(`${where}: the button is named ${await filters.getAttribute('aria-label')}`);
            await popover.getByRole('button', { name: 'Clear filters' }).click();
            await counted('0');
            // The sort only reorders: no count, and its own reset.
            await popover.getByRole('combobox', { name: 'Sort' }).click();
            await page.getByRole('option', { name: 'Title (A–Z)', exact: true }).click();
            const sortDefault = (state) => popover.locator(`button${state}`, { hasText: 'Default sort & grouping' });
            await sortDefault(':not([disabled])')
              .waitFor({ timeout: 10_000 })
              .catch(() => {
                throw new Error(`${where}: Default sort & grouping is off after a sort change`);
              });
            if ((await count()) !== '0') throw new Error(`${where}: a sort counts as a filter`);
            await sortDefault(':not([disabled])').click();
            await sortDefault('[disabled]')
              .waitFor({ timeout: 10_000 })
              .catch(() => {
                throw new Error(`${where}: Default sort & grouping didn't restore the sort`);
              });
            await page.keyboard.press('Escape');
            await popover.waitFor({ state: 'hidden', timeout: 10_000 });
            const more = toolbar.getByRole('button', { name: 'More', exact: true });
            if (label === 'Classic' && width === 375) {
              await more.click();
              const menu = page.getByRole('menu');
              for (const [role, name] of [['menuitem', 'Tiers'], ['menuitem', 'Roast my taste'], ['menuitemradio', 'List view']]) {
                if (!(await menu.getByRole(role, { name, exact: true }).isVisible())) throw new Error(`${where}: More lacks ${name}`);
              }
              await page.keyboard.press('Escape');
              await menu.waitFor({ state: 'hidden', timeout: 10_000 });
            } else if (width === 1280 && (await more.isVisible())) {
              throw new Error(`${where}: More shows although everything fits`);
            }
          }
          await checkDashboard(`${label} at ${width}`);
          if (width !== 375) continue;
          // Rows that used to wrap: nothing scrolls sideways on a phone, and
          // the tier list tray's header stays on one line.
          for (const path of ['/dashboard', '/books/arena', '/diary', '/settings?tab=system']) {
            await page.goto(`${BASE_URL}${path}`, { waitUntil: 'networkidle' });
            const r = await page.evaluate(() => {
              const tray = document.getElementById('tray-heading')?.parentElement;
              const items = tray ? [...tray.children].map((el) => el.getBoundingClientRect()) : [];
              return {
                overflow: document.documentElement.scrollWidth - window.innerWidth,
                trayRows: items.length ? (Math.max(...items.map((b) => b.top)) < Math.min(...items.map((b) => b.bottom)) ? 1 : 2) : 0,
              };
            });
            if (r.overflow > 0) throw new Error(`${label} ${path} at 375: the page scrolls sideways by ${r.overflow}px`);
            if (path === '/books/arena' && r.trayRows !== 1) throw new Error(`${label} at 375: the tier tray header wraps`);
          }
        }
        await page.setViewportSize({ width: 1280, height: 900 });
        await page.evaluate(() => localStorage.setItem('hoard:tv:view', '"grid"'));
        await page.goto(`${BASE_URL}/tv`, { waitUntil: 'networkidle' });
        const cards = await page.evaluate(() => {
          const all = [...document.querySelectorAll('main [data-card]')];
          return {
            kinds: [...new Set(all.map((c) => c.dataset.card))].join(),
            badges: all.map((c) => c.querySelectorAll('[data-card-badge]').length),
            bars: document.querySelectorAll('main [role="progressbar"]').length,
          };
        });
        const want = { Classic: 'plain', Minimal: 'poster', Organised: 'one-badge', Fresh: 'cinematic' }[label];
        if (cards.kinds !== want) throw new Error(`${label}: /tv shows ${cards.kinds || 'no'} cards, not ${want}`);
        if (cards.bars > 0) throw new Error(`${label}: a card shows a progress bar`);
        const most = Math.max(0, ...cards.badges);
        if (label === 'Organised' ? most !== 1 : most !== 0) throw new Error(`${label}: a card shows ${most} badges`);
      }
    } finally {
      await page.setViewportSize({ width: 1280, height: 900 });
      await pickLayout('Classic');
    }
  });
  // A title page's outline: one h1, then an h2 for every panel (Notes,
  // History, Tags, Lists, Progress, Seasons, Format, Play sessions, Review,
  // More by), and no level skipped anywhere in <main>.
  const checkTitleOutline = async (where) => {
    const o = await page.evaluate(() => {
      const heads = [...document.querySelectorAll('main :is(h1, h2, h3, h4, h5, h6)')];
      const levels = heads.map((h) => Number(h.tagName[1]));
      const name = (h) => `${h.tagName.toLowerCase()} “${h.textContent.trim()}”`;
      const skips = heads.filter((h, i) => i > 0 && levels[i] > levels[i - 1] + 1).map((h, i) => name(h));
      const panels = [...document.querySelectorAll('main [data-panel], main section[aria-label="Play sessions"]')].filter(
        (el) => el.getClientRects().length > 0,
      );
      return {
        h1: levels.filter((l) => l === 1).length,
        first: levels[0],
        skips,
        bare: panels.filter((el) => !el.querySelector('h2')).map((el) => el.dataset.panel ?? el.getAttribute('aria-label')),
        h2s: heads.filter((h) => h.tagName === 'H2').map((h) => h.textContent.trim()),
      };
    });
    if (o.h1 !== 1 || o.first !== 1) throw new Error(`${where}: ${o.h1} h1s, the first heading is an h${o.first}`);
    if (o.skips.length) throw new Error(`${where}: heading levels skip at ${o.skips.join(', ')}`);
    if (o.bare.length) throw new Error(`${where}: panels without an h2: ${o.bare.join(', ')} (h2s: ${o.h2s.join(', ')})`);
    return o.h2s;
  };
  // TV seasons (3.3 / 4.5): the demo show's title page lists its seasons and
  // links to the season tier page. Its outline, and a game's (Owned on, Play
  // sessions), have an h2 per panel. A section that doesn't exist is a 404,
  // even with one's own title id.
  await step('tv seasons on the title page → season tiers', async () => {
    const game = await gameId();
    await page.goto(`${BASE_URL}/games/title/${game}`, { waitUntil: 'networkidle' });
    await page.getByRole('heading', { level: 2, name: 'Play sessions' }).waitFor({ timeout: 15_000 });
    const gameH2s = await checkTitleOutline('the game page');
    for (const want of ['Notes', 'History', 'Tags', 'Lists', 'Owned on', 'Play sessions']) {
      if (!gameH2s.includes(want)) throw new Error(`the game page has no “${want}” h2 (h2s: ${gameH2s.join(', ')})`);
    }
    const nope = await page.request.get(`${BASE_URL}/nope/title/${game}`, { maxRedirects: 0 });
    if (nope.status() !== 404) throw new Error(`/nope/title/<own id> answered ${nope.status()}`);
    await page.goto(`${BASE_URL}/tv/title/demo-activity-tv-expanse`, { waitUntil: 'networkidle' });
    await page.getByRole('heading', { level: 1, name: 'The Expanse' }).waitFor({ timeout: 15_000 });
    await page.getByRole('heading', { level: 2, name: 'Seasons' }).waitFor({ timeout: 15_000 });
    const tvH2s = await checkTitleOutline('the TV page');
    for (const want of ['Notes', 'History', 'Tags', 'Lists', 'Progress', 'Seasons']) {
      if (!tvH2s.includes(want)) throw new Error(`the TV page has no “${want}” h2 (h2s: ${tvH2s.join(', ')})`);
    }
    await page.getByLabel('Watched episodes of Season 3').waitFor({ timeout: 10_000 });
    // Where to watch and sub-scores are gone from the details.
    const main = await page.locator('main').innerText();
    if (/Where to watch|Sub-scores/i.test(main)) throw new Error('the title page still shows Where to watch or sub-scores');
    await Promise.all([
      page.waitForURL((url) => url.pathname === '/tv/seasons/demo-activity-tv-expanse', { timeout: 20_000 }),
      page.getByRole('link', { name: 'Season tiers' }).click(),
    ]);
    await page.getByRole('heading', { name: 'Which season is better?' }).waitFor({ timeout: 15_000 });
  });
  // The popup title view (the default): only the short fields, the season-
  // tracked progress read-only, a footer that fits a phone, and "Open full
  // page" for everything else.
  await step('popup: short fields, Open full page', async () => {
    for (const width of [375, 1280]) {
      await page.setViewportSize({ width, height: width === 375 ? 812 : 900 });
      await page.goto(`${BASE_URL}/tv?open=demo-activity-tv-expanse`, { waitUntil: 'networkidle' });
      const dialog = page.getByRole('dialog', { name: 'The Expanse', exact: true });
      await dialog.waitFor({ timeout: 15_000 });
      await dialog.getByText('Tracked by seasons').waitFor({ timeout: 10_000 });
      for (const label of ['Status', 'Rating', 'Favorite', 'Progress', 'Notes']) {
        await dialog.getByText(label, { exact: true }).first().waitFor({ timeout: 10_000 });
      }
      // The popup keeps its markup: its title is its one heading.
      const heads = await dialog.getByRole('heading').count();
      if (heads !== 1) throw new Error(`at ${width} the popup has ${heads} headings`);
      const text = await dialog.innerText();
      const extra = ['Franchise', 'Tags', 'History', 'Season tiers', 'Add to list', 'More by the same people'].filter((t) => text.includes(t));
      if (extra.length) throw new Error(`at ${width} the popup still shows ${extra.join(', ')}`);
      const fit = await page.evaluate(() => {
        const d = document.querySelector('[role="dialog"]').getBoundingClientRect();
        const buttons = [...document.querySelectorAll('[role="dialog"] button')].map((b) => b.getBoundingClientRect());
        return { spill: Math.max(...buttons.map((b) => b.right)) - d.right, overflow: document.documentElement.scrollWidth - window.innerWidth };
      });
      if (fit.spill > 0 || fit.overflow > 0) throw new Error(`at ${width} the popup spills ${fit.spill}px (page ${fit.overflow}px)`);
    }
    await Promise.all([
      page.waitForURL((url) => url.pathname === '/tv/title/demo-activity-tv-expanse', { timeout: 20_000 }),
      page.getByRole('dialog').getByRole('button', { name: 'Open full page' }).click(),
    ]);
    await page.getByRole('heading', { level: 1, name: 'The Expanse' }).waitFor({ timeout: 15_000 });
    if ((await page.getByRole('dialog').count()) > 0) throw new Error('the popup stayed open over the title page');
  });
  // Score these (1.3): no banner (or crowd panel) on the section page any
  // more, and ?score=1 does nothing there; the tier list's tray opens the
  // dialog in place (the demo has an unscored finished book, Snow Crash).
  await step('score these from the tier tray', async () => {
    await page.goto(`${BASE_URL}/books?score=1`, { waitUntil: 'networkidle' });
    const main = await page.locator('main').innerText();
    if (/Score these/.test(main)) throw new Error('the section page still shows Score these');
    if (/You vs\. the crowd/.test(main)) throw new Error('the section page still shows the crowd panel');
    if ((await page.getByRole('dialog').count()) > 0) throw new Error('?score=1 still opens a dialog');
    await page.goto(`${BASE_URL}/books/arena`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: /^Score these · \d+$/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Score these' });
    await dialog.waitFor({ timeout: 10_000 });
    await dialog.getByText('Snow Crash').waitFor({ timeout: 10_000 });
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'hidden', timeout: 10_000 });
    if (new URL(page.url()).pathname !== '/books/arena') throw new Error(`left the tier list: ${page.url()}`);
  });
  // An empty tier list keeps the button: the demo's only game (Outer Wilds,
  // 12 h on Steam, not finished) isn't on the board but waits in Score these.
  await step('score these on an empty tier list', async () => {
    await page.goto(`${BASE_URL}/games/arena`, { waitUntil: 'networkidle' });
    await page.getByText('Nothing to tier yet').waitFor({ timeout: 10_000 });
    await page.getByRole('button', { name: /^Score these · \d+$/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Score these' });
    await dialog.getByText('Outer Wilds').waitFor({ timeout: 10_000 });
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'hidden', timeout: 10_000 });
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
  // Dashboard tiles: Customize opens the tile editor. Closing it drops a
  // change; hiding the overview and moving Coming up up one place (focus
  // stays on the button) changes the dashboard after Save; Undo puts it
  // back; Reset to default saves the default. At 640 the overview of the
  // default order still moves first; at 1024 (narrow tiles) the header and
  // the status lines stay one row. On a phone the editor is a bottom sheet
  // whose rows fit, with 36px controls; Settings → Themes has the same
  // editor inline. The demo's dashboard prefs end as they started.
  await step('dashboard tiles: customize, undo, reset', async () => {
    const stored = async () => JSON.stringify((await (await page.request.get(`${BASE_URL}/api/export/all.json`)).json()).prefs?.dashboard);
    const before = await stored();
    const tiles = () => page.locator('[data-dashboard-tiles] > *').evaluateAll((els) => els.map((el) => el.innerText.split('\n')[0].trim()));
    const showsTiles = (want, what) =>
      page
        .waitForFunction(
          (want) => [...document.querySelectorAll('[data-dashboard-tiles] > *')].map((el) => el.innerText.split('\n')[0].trim()).join('|') === want,
          want.join('|'),
          { timeout: 15_000 },
        )
        .catch(async () => {
          throw new Error(`${what}: the dashboard shows ${(await tiles()).join(', ')}`);
        });
    const customize = async () => {
      await page.getByRole('button', { name: 'Customize dashboard', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Customize dashboard' });
      await dialog.getByRole('checkbox', { name: 'Show Overview' }).waitFor({ timeout: 15_000 });
      return dialog;
    };
    try {
      await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'networkidle' });
      const start = await tiles();
      const coming = start.indexOf('Coming up');
      if (!start.includes('Your hoard') || coming < 1) throw new Error(`the dashboard starts with ${start.join(', ')}`);

      let dialog = await customize();
      await dialog.getByRole('checkbox', { name: 'Show Overview' }).uncheck();
      await page.keyboard.press('Escape');
      await dialog.waitFor({ state: 'hidden', timeout: 10_000 });
      dialog = await customize();
      if (!(await dialog.getByRole('checkbox', { name: 'Show Overview' }).isChecked())) throw new Error('closing the dialog kept a change');

      await dialog.getByRole('checkbox', { name: 'Show Overview' }).uncheck();
      await dialog.getByRole('button', { name: 'Move Coming up up', exact: true }).click();
      const focused = await page.evaluate(() => document.activeElement?.getAttribute('aria-label'));
      if (focused !== 'Move Coming up up') throw new Error(`after Move up, focus is on ${focused}`);
      await dialog.getByRole('button', { name: 'Save', exact: true }).click();
      await page.getByText('Dashboard updated.').first().waitFor({ timeout: 15_000 });
      await dialog.waitFor({ state: 'hidden', timeout: 10_000 });
      const moved = [...start];
      [moved[coming - 1], moved[coming]] = [moved[coming], moved[coming - 1]];
      await showsTiles(moved.filter((t) => t !== 'Your hoard'), 'after Save');

      await page.getByRole('button', { name: 'Undo' }).click();
      await page.getByText('Undone.').first().waitFor({ timeout: 15_000 });
      await showsTiles(start, 'after Undo');

      dialog = await customize();
      await dialog.getByRole('button', { name: 'Reset to default' }).click();
      await page.getByText('Dashboard reset to default.').first().waitFor({ timeout: 15_000 });
      await dialog.waitFor({ state: 'hidden', timeout: 10_000 });
      await showsTiles(start, 'after Reset');

      await page.setViewportSize({ width: 640, height: 900 });
      await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'networkidle' });
      const first = await page.locator('[data-dashboard-tiles] > *').evaluateAll((els) => {
        const at = (el) => el.getBoundingClientRect();
        return els.sort((a, b) => at(a).top - at(b).top || at(a).left - at(b).left)[0].innerText.split('\n')[0].trim();
      });
      if (first !== 'Your hoard') throw new Error(`at 640 the default order starts with ${first}`);
      await page.setViewportSize({ width: 1024, height: 900 });
      await checkDashboard('Classic at 1024');

      await page.setViewportSize({ width: 375, height: 812 });
      await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'networkidle' });
      dialog = await customize();
      const fit = await page.evaluate(() => {
        const d = document.querySelector('[role="dialog"]');
        const list = d.querySelector('ul[aria-label="Dashboard tiles"]');
        const rows = [...list.children];
        const footer = [...d.querySelectorAll('button')].filter((b) => /^(Reset to default|Cancel|Save)$/.test(b.textContent.trim()));
        return {
          bottom: Math.round(window.innerHeight - d.getBoundingClientRect().bottom),
          rows: rows.length,
          tall: rows.filter((li) => li.getBoundingClientRect().height > 50).length,
          spill: rows.filter((li) => li.scrollWidth > li.clientWidth).length,
          small: [...list.querySelectorAll('button, label')]
            .filter((c) => c.getBoundingClientRect().height < 36)
            .map((c) => c.getAttribute('aria-label') ?? c.textContent.trim()),
          footerRows: new Set(footer.map((b) => Math.round(b.getBoundingClientRect().top))).size,
          overflow: document.documentElement.scrollWidth - window.innerWidth,
        };
      });
      if (fit.bottom !== 0) throw new Error(`at 375 the editor is not a bottom sheet (${fit.bottom}px above the bottom)`);
      if (fit.rows < 10 || fit.tall || fit.spill) throw new Error(`at 375 the editor's ${fit.rows} rows: ${fit.tall} wrap, ${fit.spill} spill`);
      if (fit.small.length) throw new Error(`at 375 these controls are under 36px: ${fit.small.join(', ')}`);
      if (fit.footerRows !== 1 || fit.overflow > 0) throw new Error(`at 375 the footer is ${fit.footerRows} rows (page ${fit.overflow}px)`);
      await page.keyboard.press('Escape');
      await dialog.waitFor({ state: 'hidden', timeout: 10_000 });

      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto(`${BASE_URL}/settings?tab=themes`, { waitUntil: 'networkidle' });
      const card = page.locator('#dashboard-tiles');
      const box = card.getByRole('checkbox', { name: 'Show Goals' });
      await box.waitFor({ timeout: 15_000 });
      const save = card.getByRole('button', { name: 'Save', exact: true });
      if (!(await save.isDisabled())) throw new Error('Settings: Save is on before any change');
      await box.uncheck();
      if (await save.isDisabled()) throw new Error('Settings: Save is off after a change');
      await card.getByRole('button', { name: 'Cancel', exact: true }).click();
      if (!(await box.isChecked()) || !(await save.isDisabled())) throw new Error('Settings: Cancel kept the change');
    } finally {
      await page.setViewportSize({ width: 1280, height: 900 });
    }
    const after = await stored();
    if (after !== before) throw new Error(`demo's dashboard prefs were ${before}, now ${after}`);
  });
  // Settings → Accounts (8.1–8.3): each account renders either its link form
  // or a friendly "not configured" note, with or without provider keys.
  await step('settings accounts', async () => {
    await page.goto(`${BASE_URL}/settings?tab=accounts`, { waitUntil: 'networkidle' });
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
  // Linked notes (8.5): the demo Aliens notes link to Alien (opens it); "Alien
  // 3" isn't in the library. Alien's full page lists Aliens under
  // "Mentioned in", and its notes complete [[links]]; an edit there brings
  // up the Save bar, and Discard puts the notes back.
  await step('linked notes + mentioned in', async () => {
    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'networkidle' });
    await page.keyboard.press('ControlOrMeta+k');
    const box = page.getByRole('combobox', { name: 'Find a title or page' });
    await box.waitFor({ timeout: 10_000 });
    await box.fill('Aliens');
    await page.getByRole('option', { name: /^Aliens/ }).first().waitFor({ timeout: 10_000 });
    await page.keyboard.press('Enter');
    const aliens = page.getByRole('dialog', { name: 'Aliens', exact: true });
    await aliens.waitFor({ timeout: 15_000 });
    const unresolved = aliens.locator('span[title="Not in your library"]', { hasText: 'Alien 3' });
    await unresolved.waitFor({ timeout: 10_000 });
    await aliens.getByRole('button', { name: 'Alien', exact: true }).click();
    const alien = page.getByRole('dialog', { name: 'Alien', exact: true });
    await alien.waitFor({ timeout: 15_000 });
    await Promise.all([
      page.waitForURL((url) => /^\/movies\/title\/[^/]+$/.test(url.pathname), { timeout: 20_000 }),
      alien.getByRole('button', { name: 'Open full page' }).click(),
    ]);
    await page.getByRole('heading', { level: 1, name: 'Alien', exact: true }).waitFor({ timeout: 15_000 });
    await page.getByRole('heading', { name: 'Mentioned in' }).waitFor({ timeout: 10_000 });
    await page.getByRole('button', { name: /^Aliens/ }).waitFor({ timeout: 10_000 });
    // Autocomplete after [[ in the notes.
    const notes = page.getByLabel('Notes');
    const before = await notes.inputValue();
    await notes.click();
    await notes.press('End');
    await notes.pressSequentially(' [[Cowb');
    await page.getByRole('listbox', { name: 'Link to a title' }).getByRole('option', { name: /Cowboy Bebop/ }).waitFor({ timeout: 10_000 });
    await page.keyboard.press('Enter');
    const value = await notes.inputValue();
    if (!value.endsWith('[[Cowboy Bebop]]')) throw new Error(`autocomplete gave: ${value}`);
    const bar = page.getByRole('region', { name: 'Unsaved changes' });
    await bar.waitFor({ timeout: 10_000 });
    await bar.getByRole('button', { name: 'Discard' }).click();
    await bar.waitFor({ state: 'hidden', timeout: 10_000 });
    if ((await notes.inputValue()) !== before) throw new Error('Discard left the notes edited');
  });
  // The Full page title view (Settings → Themes, effective at once): a card
  // opens the title's page, `?open=` (the universal link) redirects there,
  // also from another section, while an unknown id stays on the section as
  // in popup mode; the palette and [[links]] go to pages; an edit brings up
  // the Save bar and Save persists (the notes are put back afterwards).
  // Popup is restored afterwards.
  const pickTitleView = async (label) => {
    if (new URL(page.url()).searchParams.get('tab') !== 'themes') {
      await page.goto(`${BASE_URL}/settings?tab=themes`, { waitUntil: 'networkidle' });
    }
    const radio = page.getByRole('radio', { name: label, exact: true });
    await radio.waitFor({ state: 'attached', timeout: 15_000 });
    if (await radio.isChecked()) return;
    await page.locator('label', { has: radio }).click();
    await page.getByText(`Title view: ${label}`).first().waitFor({ timeout: 15_000 });
  };
  await step('full page title view', async () => {
    // What a card's root is: a button (popup) or a link to the title page.
    const cardRoot = async () =>
      page.locator('main [data-card]').first().evaluate((el) => ({ tag: el.tagName.toLowerCase(), href: el.getAttribute('href') }));
    try {
      await page.evaluate(() => localStorage.setItem('hoard:books:view', '"grid"'));
      await page.goto(`${BASE_URL}/books`, { waitUntil: 'networkidle' });
      const popupCard = await cardRoot();
      if (popupCard.tag !== 'button') throw new Error(`in popup mode a card is a <${popupCard.tag}>`);
      // In the list view the title is a button: the keyboard opens the popup.
      await page.evaluate(() => localStorage.setItem('hoard:books:view', '"list"'));
      await page.goto(`${BASE_URL}/books`, { waitUntil: 'networkidle' });
      const rowTitle = page.locator('main table td button').first();
      const rowName = (await rowTitle.innerText()).trim();
      await rowTitle.focus();
      await page.keyboard.press('Enter');
      const rowDialog = page.getByRole('dialog', { name: rowName, exact: true });
      await rowDialog.waitFor({ timeout: 10_000 });
      await page.keyboard.press('Escape');
      await rowDialog.waitFor({ state: 'hidden', timeout: 10_000 });
      await page.evaluate(() => localStorage.setItem('hoard:books:view', '"grid"'));
      await pickTitleView('Full page');
      // Real links: new tab, prefetch, read as links. In the list view the
      // title cell is the link.
      await page.evaluate(() => localStorage.setItem('hoard:books:view', '"list"'));
      await page.goto(`${BASE_URL}/books`, { waitUntil: 'networkidle' });
      const rowLinks = await page.locator('main table a[href^="/books/title/"]').count();
      if (rowLinks === 0) throw new Error('in page mode the list view has no title links');
      await page.evaluate(() => localStorage.setItem('hoard:books:view', '"grid"'));
      await page.goto(`${BASE_URL}/books`, { waitUntil: 'networkidle' });
      const pageCard = await cardRoot();
      if (pageCard.tag !== 'a' || !/^\/books\/title\/[^/]+$/.test(pageCard.href ?? '')) {
        throw new Error(`in page mode a card is a <${pageCard.tag}> to ${pageCard.href}`);
      }
      await Promise.all([
        page.waitForURL((url) => url.pathname === pageCard.href, { timeout: 20_000 }),
        page.locator('main [data-card]').first().click(),
      ]);
      await page.getByRole('heading', { level: 1 }).waitFor({ timeout: 15_000 });
      if ((await page.getByRole('dialog').count()) > 0) throw new Error('a card opened a popup in page mode');
      const id = new URL(page.url()).pathname.split('/').pop();
      for (const from of [`/books?open=${id}`, `/tv?open=${id}&t=x`, `/tv/title/${id}`]) {
        await page.goto(`${BASE_URL}${from}`, { waitUntil: 'networkidle' });
        if (new URL(page.url()).pathname !== `/books/title/${id}`) throw new Error(`${from} landed on ${page.url()}`);
      }
      const stay = await page.goto(`${BASE_URL}/books?open=does-not-exist`, { waitUntil: 'networkidle' });
      if (stay?.status() !== 200 || new URL(page.url()).pathname !== '/books') throw new Error(`an unknown ?open= went to ${page.url()}`);
      // An unknown (or someone else's) title page is a 404 (asked without a
      // page load, so the browser logs no failed resource).
      const missing = await page.request.get(`${BASE_URL}/books/title/does-not-exist`, { maxRedirects: 0 });
      if (missing.status() !== 404) throw new Error(`an unknown title page answered ${missing.status()}`);

      await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'networkidle' });
      await page.keyboard.press('ControlOrMeta+k');
      const box = page.getByRole('combobox', { name: 'Find a title or page' });
      await box.waitFor({ timeout: 10_000 });
      await box.fill('Aliens');
      await page.getByRole('option', { name: /^Aliens/ }).first().waitFor({ timeout: 10_000 });
      await Promise.all([
        page.waitForURL((url) => /^\/movies\/title\/[^/]+$/.test(url.pathname), { timeout: 20_000 }),
        page.keyboard.press('Enter'),
      ]);
      await page.getByRole('heading', { level: 1, name: 'Aliens', exact: true }).waitFor({ timeout: 15_000 });
      const aliensPath = new URL(page.url()).pathname;
      await Promise.all([
        page.waitForURL((url) => /^\/movies\/title\/[^/]+$/.test(url.pathname) && url.pathname !== aliensPath, { timeout: 20_000 }),
        page.getByRole('button', { name: 'Alien', exact: true }).click(),
      ]);
      await page.getByRole('heading', { level: 1, name: 'Alien', exact: true }).waitFor({ timeout: 15_000 });

      const notes = page.getByLabel('Notes');
      const bar = page.getByRole('region', { name: 'Unsaved changes' });
      const before = await notes.inputValue();
      const edited = `${before}${before ? ' ' : ''}smoke note`;
      // Screen readers hear the bar come up: an always-present status line.
      const announced = () => page.locator('main p[role="status"]', { hasText: 'Unsaved changes' }).count();
      const saveNotes = async (value) => {
        await notes.fill(value);
        await bar.waitFor({ timeout: 10_000 });
        if ((await announced()) !== 1) throw new Error('the unsaved changes are not announced');
        await bar.getByRole('button', { name: 'Save', exact: true }).click();
        await bar.waitFor({ state: 'hidden', timeout: 15_000 });
      };
      try {
        if ((await bar.count()) > 0) throw new Error('the Save bar shows before any edit');
        await saveNotes(edited);
        await page.getByText('Saved.').first().waitFor({ timeout: 15_000 });
        if ((await announced()) !== 0) throw new Error('"Unsaved changes" is still announced after Save');
        await page.reload({ waitUntil: 'networkidle' });
        if ((await notes.inputValue()) !== edited) throw new Error(`after Save and a reload the notes are: ${await notes.inputValue()}`);
        if ((await bar.count()) > 0) throw new Error('the Save bar shows after a reload');
      } finally {
        if ((await notes.inputValue().catch(() => before)) !== before) await saveNotes(before);
      }
    } finally {
      await pickTitleView('Popup');
    }
  });
  // The title page in every layout, at desktop and phone width (with the
  // Save bar up): nothing scrolls sideways, and at most one blur (Fresh's
  // backdrop, when the title has a poster). Classic is restored afterwards.
  await step('title page in every layout', async () => {
    const game = await gameId();
    try {
      for (const label of ['Classic', 'Minimal', 'Organised', 'Fresh']) {
        await pickLayout(label);
        for (const width of [1280, 375]) {
          const where = `${label} at ${width}`;
          await page.setViewportSize({ width, height: width === 375 ? 812 : 900 });
          for (const path of ['/tv/title/demo-activity-tv-expanse', `/games/title/${game}`]) {
            await page.goto(`${BASE_URL}${path}`, { waitUntil: 'networkidle' });
            await page.getByRole('heading', { level: 1 }).waitFor({ timeout: 15_000 });
            await page.getByLabel('Notes').fill('layout check');
            await page.getByRole('region', { name: 'Unsaved changes' }).waitFor({ timeout: 10_000 });
            const m = await page.evaluate(() => ({
              overflow: document.documentElement.scrollWidth - window.innerWidth,
              blurs: [...document.querySelectorAll('main *')].filter((el) => {
                const cs = getComputedStyle(el);
                return /blur/.test(cs.filter) || /blur/.test(cs.backdropFilter);
              }).length,
            }));
            if (m.overflow > 0) throw new Error(`${where} ${path}: the page scrolls sideways by ${m.overflow}px`);
            if (m.blurs > 1) throw new Error(`${where} ${path}: ${m.blurs} blurred elements`);
            await page.getByRole('region', { name: 'Unsaved changes' }).getByRole('button', { name: 'Discard' }).click();
          }
        }
      }
    } finally {
      await page.setViewportSize({ width: 1280, height: 900 });
      await pickLayout('Classic');
    }
  });
  // Saved views (8.6): the demo view opens from the navigation (in Classic,
  // under Views in the user menu) with results.
  await step('saved view from the navigation', async () => {
    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'networkidle' });
    const menu = await openUserMenu();
    await Promise.all([
      page.waitForURL((url) => url.pathname === '/views' && url.searchParams.get('view') === 'demo-view-scifi', { timeout: 15_000 }),
      menu.getByRole('menuitem', { name: 'Sci-fi favourites' }).click(),
    ]);
    await page.getByRole('heading', { name: 'Sci-fi favourites' }).waitFor({ timeout: 15_000 });
    await page.getByText(/^\d+ titles?$/).waitFor({ timeout: 10_000 });
  });
  // API tokens (8.7): create one, call the API with it (no cookies), revoke
  // it, and see the API refuse it.
  await step('api token create → call → revoke', async () => {
    await page.goto(`${BASE_URL}/settings?tab=data`, { waitUntil: 'networkidle' });
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
  // turn both opt-ins on, see the comparison, the feed and the Friends pages;
  // then, as demo2, see demo vanish from Compare the moment demo opts out
  // (the same answer as for an unknown user), and come back after.
  const setOptIn = async (card, on, toast) => {
    await page.goto(`${BASE_URL}/settings?tab=sharing`, { waitUntil: 'networkidle' });
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
    // The Friends pages are in Classic's user menu once opted in.
    const menu = await openUserMenu();
    for (const name of ['Feed', 'Compare', 'Watch together']) {
      await menu.getByRole('menuitem', { name, exact: true }).waitFor({ timeout: 10_000 });
    }
    await page.keyboard.press('Escape');

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
