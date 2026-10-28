// ───────────────────────────────────────────────────────────────────────────
//  Renders the PWA icons (spec 1.7) from src/app/icon.svg, using
//  the locally installed Google Chrome through playwright-core (no new
//  dependencies). Re-run after changing the logo, then commit the PNGs:
//
//    node scripts/generate-icons.mjs        (CHROME_PATH=… to pick a binary)
//
//  - icon-192.png / icon-512.png: the logo as drawn (rounded square).
//  - icon-maskable-512.png: full-bleed background with the glyph inside the
//    central 80 % safe zone, so Android can crop it to any shape.
//  - src/app/apple-icon.png (180): full-bleed; iOS rounds the corners itself.
//    It lives in src/app/ so Next's file convention links it next to icon.svg.
// ───────────────────────────────────────────────────────────────────────────

import { readFileSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

const root = new URL('..', import.meta.url);
const svg = readFileSync(new URL('src/app/icon.svg', root), 'utf8');

// The tile colour and the glyph (everything after the background rect).
const fill = svg.match(/<rect[^>]*fill="([^"]+)"/)?.[1] ?? '#7c3aed';
const glyph = svg.slice(svg.indexOf('<g'), svg.lastIndexOf('</svg>'));

/** Full-bleed tile with the glyph scaled to `scale` around the centre. */
const fullBleed = (scale) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">` +
  `<rect width="100" height="100" fill="${fill}"/>` +
  `<g transform="translate(50 50) scale(${scale}) translate(-50 -50)">${glyph}</g></svg>`;

const outputs = [
  { file: 'public/icon-192.png', size: 192, svg },
  { file: 'public/icon-512.png', size: 512, svg },
  // The glyph spans ~58 % of the tile; 0.75 keeps it well inside the 80 % circle.
  { file: 'public/icon-maskable-512.png', size: 512, svg: fullBleed(0.75) },
  { file: 'src/app/apple-icon.png', size: 180, svg: fullBleed(0.85) },
];

const browser = await chromium.launch(
  process.env.CHROME_PATH
    ? { executablePath: process.env.CHROME_PATH, headless: true }
    : { channel: 'chrome', headless: true },
);
try {
  for (const { file, size, svg: source } of outputs) {
    const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
    const sized = source.replace('<svg ', `<svg width="${size}" height="${size}" `);
    await page.setContent(
      `<!doctype html><html><body style="margin:0;background:transparent">${sized}</body></html>`,
    );
    const png = await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
    writeFileSync(new URL(file, root), png);
    await page.close();
    console.log(`wrote ${file} (${size}×${size})`);
  }
} finally {
  await browser.close();
}
