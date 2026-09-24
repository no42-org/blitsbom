#!/usr/bin/env node
/*
 * Copyright 2026 Ronny Trommer <ronny@no42.org>
 * SPDX-License-Identifier: MIT
 */

// Release-tag guard: create and push vX.Y.Z only on the merged release bump.
//
// The CI version gate (#242) compares the tag with package.json, but only after
// the tag is public. v0.8.1 to v0.8.4 all went onto a Dependabot merge that
// happened to be main HEAD, and each one cost a red run, an issue, a bump PR
// and a manual re-point (#231, #239, #263). This moves the check to before the
// push. (#265)
//
// package.json is read from the commit, not the working tree: the tag points
// at a commit, so an uncommitted edit must not make a wrong commit pass.

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Same anchored shape as the version gate in .github/workflows/gates.yml.
const SEMVER = /^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$/;

/**
 * Every precondition the tag fails, as messages. Empty means it may be created.
 *
 * `facts.remoteTag` is null when origin could not be asked; that is reported
 * rather than read as "absent".
 */
export function findProblems(version, facts) {
  if (!version || !SEMVER.test(version)) {
    return [`'${version ?? ''}' is not a version. Expected VERSION=X.Y.Z, without a leading v.`];
  }
  const tag = `v${version}`;
  const bump = `chore(release): ${tag}`;
  const problems = [];

  if (facts.head !== facts.originMain) {
    problems.push(
      `HEAD ${facts.head.slice(0, 7)} is not origin/main ${facts.originMain.slice(0, 7)}. ` +
        'Check out main and run git pull --ff-only.',
    );
  }
  if (facts.pkgVersion !== version) {
    problems.push(`package.json says ${facts.pkgVersion}, not ${version}. Merge the release bump PR first.`);
  }
  // A prefix match alone would let v0.8.1 match a v0.8.10 subject.
  const rest = facts.subject.startsWith(bump) ? facts.subject.slice(bump.length) : null;
  if (rest === null || !(rest === '' || rest.startsWith(' '))) {
    problems.push(`HEAD subject is '${facts.subject}', not '${bump}'. Tag the merged bump commit.`);
  }
  if (facts.localTag) problems.push(`${tag} already exists locally.`);
  if (facts.remoteTag === null) problems.push(`could not check origin for ${tag}.`);
  else if (facts.remoteTag) problems.push(`${tag} already exists on origin.`);

  return problems;
}

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();

function gitOk(...args) {
  try {
    git(...args);
    return true;
  } catch {
    return false;
  }
}

function remoteTagExists(tag) {
  try {
    return git('ls-remote', '--tags', 'origin', `refs/tags/${tag}`) !== '';
  } catch {
    return null;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const version = process.argv[2];
  const fail = (problems) => {
    console.error('release-tag: refusing to tag.\n');
    for (const p of problems) console.error(`  ✗ ${p}`);
    console.error('');
    process.exit(1);
  };

  // Validate the argument before touching the network.
  if (!version || !SEMVER.test(version)) fail(findProblems(version));

  const tag = `v${version}`;
  git('fetch', '--quiet', 'origin', 'main');
  const facts = {
    head: git('rev-parse', 'HEAD'),
    originMain: git('rev-parse', 'origin/main'),
    subject: git('log', '-1', '--format=%s', 'HEAD'),
    pkgVersion: JSON.parse(git('show', 'HEAD:package.json')).version,
    localTag: gitOk('rev-parse', '-q', '--verify', `refs/tags/${tag}`),
    remoteTag: remoteTagExists(tag),
  };
  const problems = findProblems(version, facts);
  if (problems.length) fail(problems);

  git('tag', '-a', tag, '-m', tag, facts.head);
  try {
    execFileSync('git', ['push', 'origin', `refs/tags/${tag}`], { stdio: 'inherit' });
  } catch {
    // Leave no local tag behind, so a rerun starts from the same state.
    git('tag', '-d', tag);
    fail([`pushing ${tag} failed. The local tag was removed again.`]);
  }
  console.error(`release-tag: pushed ${tag} at ${facts.head.slice(0, 7)} (${facts.subject}).`);
}
