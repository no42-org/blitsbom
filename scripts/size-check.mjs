#!/usr/bin/env node
// Fail if the gzipped single-file `dist/index.html` exceeds the budget.
// vite-plugin-singlefile inlines all JS and CSS into index.html, so the
// HTML size IS the bundle size for both air-gapped (file://) and Docker
// deployments. The budget covers the full inlined payload.
import { gzipSync } from 'node:zlib';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const BUDGET_BYTES = 60 * 1024;
const INDEX_HTML = join(process.cwd(), 'dist', 'index.html');

try {
  statSync(INDEX_HTML);
} catch (err) {
  if (err.code === 'ENOENT') {
    console.error(`size-check: ${INDEX_HTML} not found — did you run \`make build\` first?`);
    process.exit(1);
  }
  throw err;
}

const raw = readFileSync(INDEX_HTML);
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
