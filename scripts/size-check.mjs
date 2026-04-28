#!/usr/bin/env node
// Fail if combined gzipped JS in dist/assets/*.js exceeds the budget.
import { gzipSync } from 'node:zlib';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const BUDGET_BYTES = 60 * 1024;
const ASSETS_DIR = join(process.cwd(), 'dist', 'assets');

function listJsFiles(dir) {
  try {
    return readdirSync(dir)
      .filter((f) => f.endsWith('.js'))
      .map((f) => join(dir, f))
      .filter((p) => statSync(p).isFile());
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

const files = listJsFiles(ASSETS_DIR);
if (files.length === 0) {
  console.error(`size-check: no JS files found in ${ASSETS_DIR}`);
  process.exit(1);
}

let total = 0;
const breakdown = [];
for (const file of files) {
  const raw = readFileSync(file);
  const gz = gzipSync(raw, { level: 9 });
  total += gz.length;
  breakdown.push({ file, raw: raw.length, gz: gz.length });
}

const fmt = (n) => `${(n / 1024).toFixed(2)} KB`;
console.log('JS bundle size (gzip level 9):');
for (const b of breakdown) {
  console.log(`  ${b.file}  raw=${fmt(b.raw)}  gz=${fmt(b.gz)}`);
}
console.log(`  total gz=${fmt(total)} / budget=${fmt(BUDGET_BYTES)}`);

if (total > BUDGET_BYTES) {
  console.error(
    `\nFAIL: gzipped JS total ${fmt(total)} exceeds budget ${fmt(BUDGET_BYTES)}.`,
  );
  process.exit(1);
}
console.log('\nOK: under budget.');
