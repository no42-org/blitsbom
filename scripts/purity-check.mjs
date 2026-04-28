#!/usr/bin/env node
// Network-purity guard: fail the build if any forbidden runtime call or
// known analytics SDK reference appears in the source tree.
//
// blitsbom is contractually a no-network app. Any drift toward fetch /
// XMLHttpRequest / sendBeacon / analytics needs to be a deliberate choice,
// not a quiet regression.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const ROOT = join(process.cwd(), 'src');
const FORBIDDEN = [
  /\bfetch\s*\(/,
  /\bXMLHttpRequest\b/,
  /\bnavigator\.sendBeacon\b/,
  /googletagmanager\.com/,
  /google-analytics\.com/,
  /\bgtag\s*\(/,
  /mixpanel/i,
  /segment\.io/,
  /segment\.com/,
  /plausible/i,
  /posthog/i,
  /sentry\.io/,
  /@sentry\//,
  /amplitude\.com/,
];

const ALLOWED_EXTS = new Set(['.ts', '.svelte', '.js', '.mjs', '.css']);
const ALLOWLIST_PATHS = new Set([
  // Tests are allowed to mention these in fixtures or assertions.
  // None today, kept as a hook.
]);

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      yield* walk(full);
    } else if (ALLOWED_EXTS.has(extname(entry))) {
      yield full;
    }
  }
}

const violations = [];
for (const file of walk(ROOT)) {
  if (ALLOWLIST_PATHS.has(file)) continue;
  if (file.endsWith('.test.ts')) continue; // tests don't ship
  const text = readFileSync(file, 'utf8');
  text.split('\n').forEach((line, i) => {
    for (const pattern of FORBIDDEN) {
      if (pattern.test(line)) {
        violations.push({ file, line: i + 1, match: pattern.source, text: line.trim() });
      }
    }
  });
}

if (violations.length > 0) {
  console.error('purity-check: forbidden runtime references found:\n');
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}  /${v.match}/`);
    console.error(`    ${v.text}`);
  }
  console.error(
    '\nblitsbom is a no-network app. If this reference is intentional, ' +
      'update purity-check.mjs allowlists with rationale.',
  );
  process.exit(1);
}
console.log('purity-check: no forbidden runtime references.');
