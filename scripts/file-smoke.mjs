#!/usr/bin/env node
// file:// smoke test. Loads dist/index.html in headless Chromium via a
// file:// URL and asserts the empty-state UI renders without console errors.
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { existsSync } from 'node:fs';

const dist = join(process.cwd(), 'dist', 'index.html');
if (!existsSync(dist)) {
  console.error(`file-smoke: ${dist} not found. Run \`make build\` first.`);
  process.exit(1);
}

const url = pathToFileURL(dist).toString();
console.log(`file-smoke: loading ${url}`);

const browser = await chromium.launch({
  headless: true,
  args: ['--allow-file-access-from-files'],
});
const context = await browser.newContext();
const page = await context.newPage();

const pageErrors = [];
const consoleErrors = [];
page.on('pageerror', (err) => pageErrors.push(err));
page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(msg.text());
});

const externalRequests = [];
await context.route('**/*', (route) => {
  const u = route.request().url();
  if (u.startsWith('file://') || u.startsWith('data:') || u.startsWith('blob:')) {
    return route.continue();
  }
  externalRequests.push(u);
  return route.abort();
});

await page.goto(url, { waitUntil: 'load' });
await page.waitForTimeout(500);

function dumpDiagnostics() {
  for (const e of pageErrors) console.error('pageerror:', e);
  for (const e of consoleErrors) console.error('console.error:', e);
}

const dropZone = await page.$('.drop-zone');
if (!dropZone) {
  dumpDiagnostics();
  const html = await page.content();
  console.error('file-smoke: drop zone not found in rendered DOM');
  console.error('--- page HTML (truncated) ---');
  console.error(html.slice(0, 3000));
  await browser.close();
  process.exit(1);
}

// The masthead should be present.
const masthead = await page.$('.page__masthead');
if (!masthead) {
  console.error('file-smoke: masthead not found in rendered DOM');
  await browser.close();
  process.exit(1);
}

await browser.close();

if (externalRequests.length > 0) {
  console.error('file-smoke: unexpected external requests:');
  for (const u of externalRequests) console.error('  ', u);
  process.exit(1);
}

if (pageErrors.length > 0 || consoleErrors.length > 0) {
  dumpDiagnostics();
  process.exit(1);
}

console.log('file-smoke: OK');
