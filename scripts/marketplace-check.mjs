#!/usr/bin/env node
// Marketplace metadata guard: fail the build if action.yml would be rejected
// when publishing to the GitHub Marketplace.
//
// These constraints are enforced only at publish time, on the release-draft
// page, one batch of errors at a time. Nothing else in CI touches them, so a
// listing can be blocked hours after the change that broke it — which is how a
// 181-character description shipped (#151) and how the missing `branding` block
// nearly did (#150). Checking them here moves the failure to the PR.
//
// Uniqueness of `name` across the Marketplace is deliberately absent: it is
// only knowable from GitHub's own validation.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { parse } from 'yaml';

// GitHub's rejection message is "must be less than 125 characters", so 124 is
// the longest that passes.
export const DESCRIPTION_MAX = 124;

// The documented palette for `branding.color`. Anything else is rejected.
export const BRANDING_COLORS = [
  'white',
  'yellow',
  'blue',
  'green',
  'orange',
  'red',
  'purple',
  'gray-dark',
];

// A field is unusable if absent, not a string, or blank — the Marketplace
// rejects an empty name, description or icon just as it rejects a missing one.
function text(value) {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

// Returns a list of human-readable problems; empty means the metadata would be
// accepted. Pure and exported so the cases live in tests rather than in a
// maintainer's memory.
export function validateMetadata(doc) {
  const problems = [];

  if (doc === null || typeof doc !== 'object') {
    return ['action.yml did not parse as a mapping.'];
  }

  if (!text(doc.name)) {
    problems.push('name: missing or empty. A listing needs one, and it must be unique on the Marketplace.');
  }

  const description = text(doc.description);
  if (!description) {
    problems.push('description: missing or empty. A listing requires one.');
  } else if (description.length > DESCRIPTION_MAX) {
    problems.push(
      `description: ${description.length} characters, at most ${DESCRIPTION_MAX} allowed. ` +
        `Trim ${description.length - DESCRIPTION_MAX} or more.`
    );
  }

  const branding = doc.branding;
  if (branding === null || typeof branding !== 'object') {
    problems.push(
      'branding: missing. It needs both `icon` (a Feather icon name) and `color`, ' +
        'or the action cannot be listed.'
    );
    return problems;
  }

  if (!text(branding.icon)) {
    problems.push('branding.icon: missing or empty. Use a Feather icon name.');
  }

  const color = text(branding.color);
  if (!color) {
    problems.push('branding.color: missing or empty.');
  } else if (!BRANDING_COLORS.includes(color)) {
    problems.push(
      `branding.color: "${color}" is not accepted. Use one of: ${BRANDING_COLORS.join(', ')}.`
    );
  }

  return problems;
}

// Parse and validate in one step. A malformed document is reported as a
// problem rather than thrown: the file is unpublishable either way, and a
// parse error naming the line is more use than a stack trace.
export function checkSource(source) {
  let doc;
  try {
    doc = parse(source);
  } catch (err) {
    return [`action.yml is not valid YAML — ${err.message.split('\n')[0]}`];
  }
  return validateMetadata(doc);
}

// Only run as a CLI when invoked directly, so importing this from a test does
// not exit the process.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const file = join(process.cwd(), 'action.yml');
  const source = readFileSync(file, 'utf8');
  const problems = checkSource(source);
  const doc = problems.length ? null : parse(source);

  if (problems.length) {
    console.error('marketplace-check: action.yml would be rejected when publishing.\n');
    for (const p of problems) console.error(`  ✗ ${p}`);
    console.error('');
    process.exit(1);
  }

  console.error(
    `marketplace-check: ok — description ${doc.description.length}/${DESCRIPTION_MAX} chars, ` +
      `branding ${doc.branding.icon}/${doc.branding.color}.`
  );
}
