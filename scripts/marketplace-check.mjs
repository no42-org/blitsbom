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
// The README is the listing body, so its version examples are checked against
// package.json too — a stale example hands a Marketplace visitor a superseded
// release (#165).
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

// Version references in the README that must track the current release. The
// README is the listing body, so a stale example hands a Marketplace visitor a
// version we have already superseded — v0.6.0's examples outlived the release
// that fixed v0.6.0's own defects (#165).
// Captures a prerelease suffix too (1.0.0-rc.1): RELEASING.md documents the
// prerelease flow, and a capture of bare X.Y.Z could never equal such a
// version, wedging the bump PR. The suffix must end alphanumeric so a
// sentence's trailing period is not swallowed into the version.
const V = /(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]*[0-9A-Za-z])?)/.source;

const README_VERSION_PATTERNS = [
  { label: 'action ref', re: new RegExp(`no42-org/blitsbom@v${V}`, 'g') },
  // Bare `@vX.Y.Z` as the resolution table writes it. The lookbehind keeps
  // third-party pins out: in `actions/upload-artifact@v4.6.2` the `@` follows
  // a word character, while ours follows a backtick, space or line start.
  { label: 'action ref', re: new RegExp(`(?<![\\w/])@v${V}`, 'g') },
  { label: 'generator image', re: new RegExp(`:report-${V}`, 'g') },
  { label: 'serving image', re: new RegExp(`blitsbom:${V}`, 'g') },
  // The quick start's download URL and artifact names. Release artifacts carry
  // the version since #222, and `releases/latest/download/<name>` resolves only
  // an exact filename, so no constant URL survives — the quick start names one
  // specific release and has to move with it, exactly as the action ref does.
  //
  // The `gh release download --pattern 'blitsbom-*.zip'` variant printed beside
  // it is version-free on purpose, and must stay unmatched: `*` is not a
  // version, so neither pattern fires on it. A checker that demanded a version
  // there would wedge every release bump.
  { label: 'release download URL', re: new RegExp(`releases/download/v${V}/`, 'g') },
  // Extensions are enumerated rather than left open. `blitsbom-${V}[-.]` would
  // let the prerelease suffix swallow part of a compound name like
  // `blitsbom-1.2.3-sbom.cdx.json` and report a version of `1.2.3-sbom.cdx`.
  { label: 'release artifact', re: new RegExp(`blitsbom-${V}\\.(?:zip|sha512|sigstore)`, 'g') },
];

// Blockquotes carry migration notes — "Moved in v0.6.0", "pins to @v0.5.0 keep
// working" — which are statements about the past and must not be rewritten.
// Anything outside one is a live example.
//
// The exemption is line-based, not CommonMark-aware: a lazy continuation line
// of a real blockquote is flagged (the fix the error suggests — prefix it with
// `>` — is also the correct Markdown), and a `>` redirect at the start of a
// fenced-code line is exempted. Both are accepted as the cost of not parsing
// Markdown here.
export function findStaleReadmeVersions(readme, version) {
  const problems = [];
  readme.split('\n').forEach((line, i) => {
    if (/^\s*>/.test(line)) return;
    for (const { label, re } of README_VERSION_PATTERNS) {
      for (const m of line.matchAll(re)) {
        if (m[1] !== version) {
          problems.push(
            `README.md:${i + 1}: ${label} says ${m[1]}, expected ${version} — ` +
              `"${m[0]}". Move it to a blockquote if it is deliberately historical.`
          );
        }
      }
    }
  });
  return problems;
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
  const root = process.cwd();
  const source = readFileSync(join(root, 'action.yml'), 'utf8');
  // Parse once: the same document is validated and then reported on. The
  // success-path field reads below are safe because validateMetadata proved
  // the fields present — via this doc, not a second parse that could diverge.
  let doc = null;
  let problems;
  try {
    doc = parse(source);
    problems = validateMetadata(doc);
  } catch (err) {
    problems = [`action.yml is not valid YAML — ${err.message.split('\n')[0]}`];
  }

  const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
  problems.push(
    ...findStaleReadmeVersions(readFileSync(join(root, 'README.md'), 'utf8'), version)
  );

  if (problems.length) {
    console.error('marketplace-check: the listing would be wrong or rejected.\n');
    for (const p of problems) console.error(`  ✗ ${p}`);
    console.error('');
    process.exit(1);
  }

  console.error(
    `marketplace-check: ok — description ${doc.description.length}/${DESCRIPTION_MAX} chars, ` +
      `branding ${doc.branding.icon}/${doc.branding.color}, README examples at ${version}.`
  );
}
