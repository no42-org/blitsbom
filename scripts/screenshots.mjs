#!/usr/bin/env node
// Capture marketing screenshots for the README.
// Produces:
//   screenshots/loaded-view.png   — normal screen rendering
//   screenshots/print-preview.png — same view with print-media emulation
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import { join, dirname } from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DIST_HTML = join(ROOT, 'dist', 'index.html');
const FIXTURE = join(ROOT, 'test-fixtures', 'reference-bom.json');
const OUT = join(ROOT, 'screenshots');

if (!existsSync(DIST_HTML)) {
  console.error('screenshots: run `make build` first.');
  process.exit(1);
}
mkdirSync(OUT, { recursive: true });

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

await page.goto(url, { waitUntil: 'load' });
await page.waitForSelector('.drop-zone');
await page.setInputFiles('input[type=file]', FIXTURE);
await page.waitForSelector('.summary-header');
await page.waitForSelector('.components-table tbody tr');

const screenPath = join(OUT, 'loaded-view.png');
await page.screenshot({ path: screenPath, fullPage: true });
console.log(`screenshots: wrote ${screenPath}`);

// Switch to print-media emulation and capture the same view as the PDF would print.
await page.emulateMedia({ media: 'print' });
await page.waitForTimeout(150);
const printPath = join(OUT, 'print-preview.png');
await page.screenshot({ path: printPath, fullPage: true });
console.log(`screenshots: wrote ${printPath}`);

// Also produce a real PDF artifact for sanity-checking the print stylesheet.
const pdfPath = join(OUT, 'print-preview.pdf');
await page.pdf({
  path: pdfPath,
  format: 'A4',
  printBackground: true,
  margin: { top: '18mm', bottom: '18mm', left: '14mm', right: '14mm' },
});
console.log(`screenshots: wrote ${pdfPath}`);

await browser.close();
