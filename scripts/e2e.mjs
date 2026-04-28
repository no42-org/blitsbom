#!/usr/bin/env node
// End-to-end check: loads dist/index.html via file://, uploads the reference
// SBOM, and exercises the loaded-state UX (summary, search, chart filter,
// chip removal, CSV download). Asserts no external network requests fire.
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import { join, dirname } from 'node:path';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DIST_HTML = join(ROOT, 'dist', 'index.html');
const FIXTURE = join(ROOT, 'test-fixtures', 'reference-bom.json');

if (!existsSync(DIST_HTML)) {
  console.error(`e2e: ${DIST_HTML} not found. Run \`make build\` first.`);
  process.exit(1);
}
if (!existsSync(FIXTURE)) {
  console.error(`e2e: ${FIXTURE} missing.`);
  process.exit(1);
}

const url = pathToFileURL(DIST_HTML).toString();
console.log(`e2e: loading ${url}`);

const browser = await chromium.launch({
  headless: true,
  args: ['--allow-file-access-from-files'],
});
const context = await browser.newContext({
  acceptDownloads: true,
  viewport: { width: 1280, height: 900 },
});
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
  if (
    u.startsWith('file://') ||
    u.startsWith('data:') ||
    u.startsWith('blob:')
  ) {
    return route.continue();
  }
  externalRequests.push(u);
  return route.abort();
});

function fail(msg) {
  console.error(`e2e: ${msg}`);
  for (const e of pageErrors) console.error('  pageerror:', e);
  for (const e of consoleErrors) console.error('  console.error:', e);
  process.exit(1);
}

await page.goto(url, { waitUntil: 'load' });
await page.waitForSelector('.drop-zone', { timeout: 5000 });

// 1. Upload the reference SBOM.
await page.setInputFiles('input[type=file]', FIXTURE);
await page.waitForSelector('.summary-header', { timeout: 5000 });

// 2. Summary should show the project metadata for the reference SBOM.
const projectName = await page.textContent('.summary-header h1');
if (projectName !== 'prometheus-remote-writer-parent') {
  fail(`expected project name "prometheus-remote-writer-parent", got "${projectName}"`);
}

const componentCountText = await page.textContent('.summary-header__stats .stat:nth-child(1) .stat__value');
if (componentCountText?.trim() !== '24') {
  fail(`expected 24 components, got "${componentCountText}"`);
}

// 3. License chart should have at least one bar (the reference SBOM is mostly Apache-2.0).
const barCount = await page.locator('.chart .bar').count();
if (barCount === 0) fail('expected at least one license bar in the chart');

// 4. Click the first license bar — it should filter the table.
await page.locator('.chart .bar').first().click();
await page.waitForFunction(() => location.search.includes('license='));
const urlAfterChartFilter = page.url();
if (!urlAfterChartFilter.includes('license=')) {
  fail(`URL did not capture license filter: ${urlAfterChartFilter}`);
}
const chipsAfterFilter = await page.locator('.chip').count();
if (chipsAfterFilter === 0) fail('expected at least one filter chip after clicking a bar');

// 5. Remove the chip — filter should clear.
await page.locator('.chip__remove').first().click();
await page.waitForFunction(() => !location.search.includes('license='));

// 6. Search filtering.
await page.fill('.search__input', 'jackson');
await page.waitForFunction(() => location.search.includes('q=jackson'));
const visibleRowsAfterSearch = await page.locator('tbody tr').count();
if (visibleRowsAfterSearch === 0 || visibleRowsAfterSearch === 24) {
  fail(`search "jackson" produced unexpected row count: ${visibleRowsAfterSearch}`);
}
await page.fill('.search__input', '');

// 7. CSV export — capture the download.
const downloadPromise = page.waitForEvent('download', { timeout: 5000 });
await page.locator('button', { hasText: 'Export CSV' }).click();
const download = await downloadPromise;
const csvPath = await download.path();
if (!csvPath) fail('download path missing for CSV export');
const csv = readFileSync(csvPath, 'utf8');
if (!csv.startsWith('﻿Name,Version,License') && !csv.startsWith('Name,Version,License')) {
  fail(`CSV header unexpected: ${csv.slice(0, 80)}`);
}
if (csv.split('\r\n').length < 25) {
  fail(`CSV row count looks too low: ${csv.split('\r\n').length}`);
}
console.log(`e2e: CSV exported (${csv.length} bytes, ${csv.split('\r\n').length - 2} data rows)`);

// 8. Network purity — nothing left the browser.
if (externalRequests.length > 0) {
  console.error('e2e: unexpected external requests:');
  for (const u of externalRequests) console.error('  ', u);
  process.exit(1);
}

if (pageErrors.length > 0 || consoleErrors.length > 0) {
  for (const e of pageErrors) console.error('pageerror:', e);
  for (const e of consoleErrors) console.error('console.error:', e);
  process.exit(1);
}

await browser.close();
console.log('e2e: OK');
