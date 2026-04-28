#!/usr/bin/env node
// Capture marketing screenshots for the README. Renders one screenshot per
// committed sample plus a print-preview from the small CycloneDX one.
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import { join, dirname } from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DIST_HTML = join(ROOT, 'dist', 'index.html');
const SAMPLES = join(ROOT, 'samples', 'opennms');
const OUT = join(ROOT, 'screenshots');

if (!existsSync(DIST_HTML)) {
  console.error('screenshots: run `make build` first.');
  process.exit(1);
}
mkdirSync(OUT, { recursive: true });

const SHOTS = [
  {
    label: 'cyclonedx',
    sample: join(SAMPLES, 'prometheus-remote-writer.json'),
    file: 'loaded-cyclonedx.png',
  },
  {
    label: 'spdx-synthetic',
    sample: join(SAMPLES, 'spdx-synthetic.json'),
    file: 'loaded-spdx-synthetic.png',
  },
  // The big OpenNMS SPDX samples (opennms-core 29MB, opennms-minion 18MB)
  // hang headless Chromium post-render — see design.md open questions.
  // Capturing them via the dev server in a real browser is the v2 plan.
];

const url = pathToFileURL(DIST_HTML).toString();
console.log(`screenshots: loading ${url}`);

const browser = await chromium.launch({
  headless: true,
  args: ['--allow-file-access-from-files'],
});
const context = await browser.newContext({
  viewport: { width: 1400, height: 1100 },
  deviceScaleFactor: 2,
});
const page = await context.newPage();

for (const shot of SHOTS) {
  console.log(`  capturing ${shot.label}…`);
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForSelector('.drop-zone');
  await page.setInputFiles('input[type=file]', shot.sample);
  await page.waitForSelector('.summary-header', { timeout: 60_000 });
  await page.waitForSelector('.donut__svg');
  await page.waitForSelector('.components-table tbody tr');
  await page.waitForTimeout(150);
  const out = join(OUT, shot.file);
  await page.screenshot({ path: out, fullPage: true });
  console.log(`    wrote ${out}`);
}

// Keep an updated `loaded-view.png` pointed at the small CycloneDX sample
// so the README's primary image still shows the canonical cover.
{
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForSelector('.drop-zone');
  await page.setInputFiles('input[type=file]', SHOTS[0].sample);
  await page.waitForSelector('.summary-header');
  await page.waitForSelector('.donut__svg');
  await page.waitForSelector('.components-table tbody tr');
  await page.waitForTimeout(150);

  const screenPath = join(OUT, 'loaded-view.png');
  await page.screenshot({ path: screenPath, fullPage: true });
  console.log(`  wrote ${screenPath}`);

  await page.emulateMedia({ media: 'print' });
  await page.waitForTimeout(150);
  const printPath = join(OUT, 'print-preview.png');
  await page.screenshot({ path: printPath, fullPage: true });
  console.log(`  wrote ${printPath}`);

  const pdfPath = join(OUT, 'print-preview.pdf');
  await page.pdf({
    path: pdfPath,
    format: 'A4',
    printBackground: true,
    margin: { top: '18mm', bottom: '18mm', left: '14mm', right: '14mm' },
  });
  console.log(`  wrote ${pdfPath}`);
}

await browser.close();
