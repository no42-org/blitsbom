#!/usr/bin/env node
// End-to-end check: loads dist/index.html via file://, drives each sample
// SBOM (CycloneDX + two SPDX), and exercises the loaded-state UX. Asserts
// the donut/category filter wires through to the table and the URL, and
// verifies CSV download for every sample. No external network requests.
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import { join, dirname } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DIST_HTML = join(ROOT, 'dist', 'index.html');
const SAMPLES = join(ROOT, 'samples', 'opennms');

const FIXTURES = [
  {
    name: 'CycloneDX small',
    file: join(SAMPLES, 'prometheus-remote-writer.json'),
    expectedCount: 24,
    expectsPermissive: true,
  },
  {
    name: 'SPDX synthetic',
    file: join(SAMPLES, 'spdx-synthetic.json'),
    expectedCount: 3,
    expectsPermissive: true,
  },
  {
    name: 'SPDX large (opennms-minion)',
    file: join(SAMPLES, 'opennms-minion.json'),
    expectedCount: 1339,
    expectsPermissive: true,
  },
  {
    name: 'SPDX huge (opennms-core)',
    file: join(SAMPLES, 'opennms-core.json'),
    expectedCount: 2839,
    expectsPermissive: true,
  },
];

if (!existsSync(DIST_HTML)) {
  console.error(`e2e: ${DIST_HTML} not found. Run \`make build\` first.`);
  process.exit(1);
}
for (const f of FIXTURES) {
  if (!existsSync(f.file)) {
    console.error(`e2e: missing fixture ${f.file}`);
    process.exit(1);
  }
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

for (const fixture of FIXTURES) {
  console.log(`\n--- ${fixture.name} ---`);

  // Reset between fixtures: navigate back to the empty URL and reload so
  // the file picker is fresh.
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForSelector('.drop-zone');

  // Upload via the file input. setInputFiles waits for the change event to
  // dispatch but our async handlers continue afterward — that's fine.
  await page.setInputFiles('input[type=file]', fixture.file);
  try {
    await page.waitForSelector('.summary-header', { timeout: 180_000 });
  } catch (err) {
    const ingestText = await page
      .evaluate(() => document.querySelector('.drop-zone')?.textContent ?? '')
      .catch(() => '');
    console.error(`  drop-zone text at timeout: ${ingestText.slice(0, 200)}`);
    throw err;
  }

  // Component count.
  const countText = await page.textContent(
    '.summary-header__stats .stat:nth-child(1) .stat__value',
  );
  const count = Number(countText?.trim());
  if (count !== fixture.expectedCount) {
    fail(
      `${fixture.name}: expected ${fixture.expectedCount} components, got ${count}`,
    );
  }
  console.log(`  components: ${count} (ok)`);

  // Bar chart should render at least one bar.
  const barCount = await page.locator('.bar').count();
  if (barCount === 0) fail(`${fixture.name}: bar chart rendered no bars`);
  console.log(`  chart bars: ${barCount}`);

  // Activate the Permissive category via the chart bar (matched by
  // visible label text).
  if (fixture.expectsPermissive) {
    await page
      .locator('.bar', { hasText: 'Permissive' })
      .first()
      .click();
    await page.waitForFunction(
      () => location.search.includes('category=permissive'),
    );
    const tableRows = await page.locator('tbody tr').count();
    if (tableRows === 0) {
      fail(`${fixture.name}: permissive filter produced no rows`);
    }
    // Drilldown panel should show licenses for the active category.
    await page.waitForSelector('.drilldown');
    const drilldownRows = await page.locator('.license-row').count();
    if (drilldownRows === 0) {
      fail(`${fixture.name}: drilldown rendered no license rows`);
    }
    console.log(
      `  permissive filter: ${tableRows} table rows, ${drilldownRows} drilldown rows`,
    );

    // Clear via the back link.
    await page.locator('.drilldown__back').click();
    await page.waitForFunction(() => !location.search.includes('category='));
  }

  // CSV export.
  const downloadPromise = page.waitForEvent('download', { timeout: 30_000 });
  await page.locator('button', { hasText: 'Export CSV' }).click();
  const download = await downloadPromise;
  const csvPath = await download.path();
  if (!csvPath) fail(`${fixture.name}: CSV download path missing`);
  const csv = readFileSync(csvPath, 'utf8');
  const lineCount = csv.split('\r\n').length - 1;
  if (lineCount < fixture.expectedCount + 1) {
    fail(
      `${fixture.name}: CSV row count looks too low: ${lineCount} (expected ≥ ${fixture.expectedCount + 1} including header)`,
    );
  }
  console.log(`  CSV: ${csv.length} bytes, ${lineCount} non-blank lines`);
}

// VEX flow — load the small CycloneDX SBOM, then drop the synthetic VEX
// fixture. Verify: vuln tile appears, severity column populated, severity
// filter narrows the table, "Show suppressed" reveals the hidden entry.
console.log(`\n--- VEX overlay (CycloneDX small + fixture VEX) ---`);
await page.goto(url, { waitUntil: 'load' });
await page.waitForSelector('.drop-zone');
await page.setInputFiles(
  'input[type=file]',
  join(SAMPLES, 'prometheus-remote-writer.json'),
);
await page.waitForSelector('.summary-header', { timeout: 60_000 });

// No vuln tile yet.
const vulnTilePre = await page.locator('.stat--vuln').count();
if (vulnTilePre !== 0) fail(`VEX flow: vuln tile present before VEX load`);

// Drop the VEX through the LoadVexButton's hidden file input.
await page.setInputFiles(
  '.vex-load__btn input[type=file]',
  join(SAMPLES, 'prometheus-remote-writer.vex.json'),
);
await page.waitForSelector('.stat--vuln', { timeout: 30_000 });
const liveCountText = await page.textContent('.stat--vuln .stat__value');
const liveCount = Number(liveCountText?.trim().replace(/,/g, ''));
// Fixture has 4 raws; 1 unmatched, 1 suppressed → expect 2 live.
if (liveCount !== 2) {
  fail(`VEX flow: expected 2 live vulns, got ${liveCount}`);
}
console.log(`  live vulns: ${liveCount} (ok)`);

// Vuln severity columns should be populated. The components with vulns
// (snappy-java / sshd-osgi) sort alphabetically toward the end of the
// 24-component SBOM, so bump the page size to "all" before counting
// counts; also wait until at least one count cell has rendered.
await page.locator('.more__select').selectOption('all');
await page.waitForSelector('.sev-count', { timeout: 10_000 });
const badgeCount = await page.locator('.sev-count').count();
if (badgeCount < 1) fail(`VEX flow: no severity counts rendered`);
console.log(`  severity counts: ${badgeCount}`);

// Click critical severity chip → table narrows.
await page.locator('.sev-chip--critical').click();
await page.waitForFunction(() => location.search.includes('severity=critical'));
// Table re-render is deferred via setTimeout(0); wait for the row count
// to actually drop before reading it.
await page.waitForFunction(
  () => document.querySelectorAll('tbody tr').length < 24,
  { timeout: 5_000 },
);
const criticalRows = await page.locator('tbody tr').count();
if (criticalRows < 1 || criticalRows > 5) {
  fail(`VEX flow: critical filter row count out of expected range: ${criticalRows}`);
}
console.log(`  critical filter: ${criticalRows} rows`);

// Clear the filter.
await page.locator('.sev-chip--critical').click();
await page.waitForFunction(() => !location.search.includes('severity='));

// Toggle "Show suppressed" — count should bump (suppressed=1).
await page.locator('.suppressed-toggle').click();
await page.waitForFunction(() => {
  const t = document.querySelector('.suppressed-toggle');
  return t && /Hide/.test(t.textContent ?? '');
});
const liveAfter = Number(
  (await page.textContent('.stat--vuln .stat__value'))?.trim().replace(/,/g, ''),
);
if (liveAfter !== 3) {
  fail(`VEX flow: expected 3 vulns after showing suppressed, got ${liveAfter}`);
}
console.log(`  show suppressed: ${liveAfter} vulns (ok)`);

// Click a severity count → drilldown opens.
await page.locator('.sev-count').first().click();
await page.waitForSelector('.vuln-row', { timeout: 5_000 });
const drilldownVulnRows = await page.locator('.vuln-row').count();
if (drilldownVulnRows < 1) fail(`VEX flow: vuln drilldown empty`);
console.log(`  vuln drilldown rows: ${drilldownVulnRows}`);

// Reload the page (URL stays) — VEX state is in-memory only, the tile
// should be gone after a fresh load. Skipping that explicit assertion
// here to keep the e2e fast; covered by unit tests.

if (externalRequests.length > 0) {
  console.error('\ne2e: unexpected external requests:');
  for (const u of externalRequests) console.error('  ', u);
  process.exit(1);
}

if (pageErrors.length > 0 || consoleErrors.length > 0) {
  for (const e of pageErrors) console.error('pageerror:', e);
  for (const e of consoleErrors) console.error('console.error:', e);
  process.exit(1);
}

await browser.close();
console.log('\ne2e: OK');
