#!/usr/bin/env node
// Marketplace metadata guard: fail the build if action.yml would be rejected
// when publishing to the GitHub Marketplace.
//
// These constraints are enforced only at publish time, on the release-draft
// page, one batch of errors at a time. Nothing in a normal CI run touches
// them, so a listing can be blocked hours after the change that broke it —
// which is how a 181-character description shipped (#151) and how the missing
// `branding` block nearly did (#150). Checking them here moves the failure to
// the PR that causes it.
//
// Uniqueness of `name` across the Marketplace is deliberately absent: it is
// only knowable from GitHub's own validation.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const FILE = join(process.cwd(), 'action.yml');

// Marketplace caps the description. The limit is exclusive: 125 is rejected.
const DESCRIPTION_MAX = 125;

// The documented palette for `branding.color`. Anything else is rejected.
const BRANDING_COLORS = new Set([
  'white',
  'yellow',
  'blue',
  'green',
  'orange',
  'red',
  'purple',
  'gray-dark',
]);

const lines = readFileSync(FILE, 'utf8').split('\n');

// Read one scalar by key path — `description` or `branding.color`. Returns the
// effective string GitHub's parser would see.
//
// Only the YAML shapes this file actually uses are understood. An unrecognized
// shape throws rather than returning something approximate: a metadata guard
// that quietly passes on input it cannot read is worse than no guard, since it
// reports the constraint as satisfied when it was never evaluated.
function readScalar(path) {
  const segments = path.split('.');
  const key = segments.at(-1);
  const indent = (segments.length - 1) * 2;
  const start = lines.findIndex((l) => l.startsWith(`${' '.repeat(indent)}${key}:`));
  if (start === -1) return null;

  const inline = lines[start].slice(indent + key.length + 1).trim();

  // Block scalar: `>`/`>-`/`>+` fold newlines to spaces, `|`/`|-`/`|+` keep them.
  const block = inline.match(/^([>|])([-+]?)$/);
  if (block) {
    const body = [];
    for (const line of lines.slice(start + 1)) {
      if (line.trim() === '') {
        body.push('');
        continue;
      }
      if (!/^\s/.test(line)) break;
      body.push(line.trim());
    }
    while (body.at(-1) === '') body.pop();
    return block[1] === '>' ? body.join(' ') : body.join('\n');
  }

  if (inline === '') {
    throw new Error(
      `${path}: empty value with no block indicator. If this is now a nested ` +
        `structure or a shape this script does not parse, update readScalar().`
    );
  }

  // A plain inline scalar may still continue onto indented lines below it.
  const continuation = [];
  for (const line of lines.slice(start + 1)) {
    if (line.trim() === '' || !/^\s/.test(line)) break;
    if (/^\s+[\w-]+:/.test(line)) break; // a nested key, not a continuation
    continuation.push(line.trim());
  }

  const quoted = inline.match(/^(['"])(.*)\1$/);
  if (quoted) {
    if (continuation.length) {
      throw new Error(`${path}: quoted scalar with trailing lines is not parsed here.`);
    }
    return quoted[2];
  }

  return [inline, ...continuation].join(' ');
}

const problems = [];

// A shape readScalar cannot read is reported as a failure, not a crash: the
// outcome is the same (non-zero, never a silent pass) but the maintainer gets
// told which key to look at instead of a stack trace. UNREADABLE is distinct
// from null so an unparseable key is not also reported as a missing one.
const UNREADABLE = Symbol('unreadable');
function read(path) {
  try {
    return readScalar(path);
  } catch (err) {
    problems.push(err.message);
    return UNREADABLE;
  }
}

const name = read('name');
if (name === null) {
  problems.push('name: missing. A listing needs one, and it must be unique on the Marketplace.');
}

const description = read('description');
if (description === null) {
  problems.push('description: missing. A listing requires one.');
} else if (typeof description === 'string' && description.length >= DESCRIPTION_MAX) {
  problems.push(
    `description: ${description.length} characters, must be under ${DESCRIPTION_MAX}. ` +
      `Trim ${description.length - DESCRIPTION_MAX + 1} or more.`
  );
}

const icon = read('branding.icon');
const color = read('branding.color');
if (icon === null || color === null) {
  problems.push(
    'branding: needs both `icon` (a Feather icon name) and `color`. ' +
      'Without it the action cannot be listed.'
  );
} else if (typeof color === 'string' && !BRANDING_COLORS.has(color)) {
  problems.push(
    `branding.color: "${color}" is not accepted. Use one of: ` +
      `${[...BRANDING_COLORS].join(', ')}.`
  );
}

if (problems.length) {
  console.error('marketplace-check: action.yml would be rejected when publishing.\n');
  for (const p of problems) console.error(`  ✗ ${p}`);
  console.error('');
  process.exit(1);
}

console.error(
  `marketplace-check: ok — description ${description.length}/${DESCRIPTION_MAX - 1} chars, ` +
    `branding ${icon}/${color}.`
);
