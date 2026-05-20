#!/usr/bin/env node
// Fail if the gzipped single-file `dist/index.html` exceeds the budget.
// vite-plugin-singlefile inlines all JS and CSS into index.html, so the
// HTML size IS the bundle size for both air-gapped (file://) and Docker
// deployments. The budget covers the full inlined payload.
import { gzipSync } from 'node:zlib';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const BUDGET_BYTES = 60 * 1024;
const DIST_DIR = join(process.cwd(), 'dist');
const INDEX_HTML = join(DIST_DIR, 'index.html');
const ASSETS_DIR = join(DIST_DIR, 'assets');

if (!existsSync(INDEX_HTML)) {
  console.error(`size-check: ${INDEX_HTML} not found — did you run \`make build\` first?`);
  process.exit(1);
}

// Guard against vite-plugin-singlefile silently failing to inline an asset.
// If any sibling chunk lands in dist/assets/, the file:// air-gapped path is
// broken and the budget below is meaningless.
if (existsSync(ASSETS_DIR) && readdirSync(ASSETS_DIR).length > 0) {
  console.error(
    `size-check: ${ASSETS_DIR} is non-empty — vite-plugin-singlefile did not inline everything.`,
  );
  process.exit(1);
}

const raw = readFileSync(INDEX_HTML);
if (raw.length === 0) {
  console.error(`size-check: ${INDEX_HTML} is zero bytes`);
  process.exit(1);
}
const gz = gzipSync(raw, { level: 9 });

const fmt = (n) => `${(n / 1024).toFixed(2)} KB`;
console.log('Single-file bundle size (gzip level 9):');
console.log(`  ${INDEX_HTML}  raw=${fmt(raw.length)}  gz=${fmt(gz.length)}`);
console.log(`  budget=${fmt(BUDGET_BYTES)}`);

if (gz.length > BUDGET_BYTES) {
  console.error(
    `\nFAIL: gzipped index.html ${fmt(gz.length)} exceeds budget ${fmt(BUDGET_BYTES)}.`,
  );
  process.exit(1);
}
console.log('\nOK: under budget.');
