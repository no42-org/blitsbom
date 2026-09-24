/*
 * Copyright 2026 Ronny Trommer <ronny@no42.org>
 * SPDX-License-Identifier: MIT
 */

// Cases for the release-tag guard (#265). The Dependabot case is the one that
// happened four times in a row (v0.8.1 to v0.8.4): main HEAD was a dependency
// bump, not the release bump, and the tag went on it anyway.
import { describe, it, expect } from 'vitest';
import { findProblems } from './release-tag.mjs';

const SHA = 'ff9f8516070e082f78bc98453217d6f43cc4a357';

const facts = (over = {}) => ({
  head: SHA,
  originMain: SHA,
  subject: 'chore(release): v0.8.4 (#270)',
  pkgVersion: '0.8.4',
  localTag: false,
  remoteTag: false,
  ...over,
});

const has = (problems, fragment) => problems.some((p) => p.includes(fragment));

describe('findProblems', () => {
  it('passes on the merged bump commit with a squash suffix', () => {
    expect(findProblems('0.8.4', facts())).toEqual([]);
  });

  it('passes on a bump commit without a PR suffix', () => {
    expect(findProblems('0.8.4', facts({ subject: 'chore(release): v0.8.4' }))).toEqual([]);
  });

  it('passes a prerelease version', () => {
    expect(
      findProblems(
        '0.9.0-rc.1',
        facts({ subject: 'chore(release): v0.9.0-rc.1 (#300)', pkgVersion: '0.9.0-rc.1' }),
      ),
    ).toEqual([]);
  });

  it('rejects a missing version and stops there', () => {
    for (const v of [undefined, '']) {
      const p = findProblems(v, facts());
      expect(p).toHaveLength(1);
      expect(p[0]).toContain('VERSION=X.Y.Z');
    }
  });

  it('rejects a v-prefixed or malformed version', () => {
    for (const v of ['v0.8.4', '0.8', '0.8.4.1', 'next']) {
      const p = findProblems(v, facts());
      expect(p, v).toHaveLength(1);
      expect(p[0], v).toContain('VERSION=X.Y.Z');
    }
  });

  it('rejects HEAD that is not origin/main and says how to fix it', () => {
    const p = findProblems('0.8.4', facts({ head: 'a'.repeat(40) }));
    expect(has(p, 'origin/main')).toBe(true);
    expect(has(p, 'git pull --ff-only')).toBe(true);
  });

  it('rejects a package.json version mismatch', () => {
    const p = findProblems('0.8.4', facts({ pkgVersion: '0.8.3' }));
    expect(p).toHaveLength(1);
    expect(p[0]).toContain('package.json says 0.8.3');
  });

  it('rejects a subject that is not the release bump', () => {
    const p = findProblems('0.8.4', facts({ subject: 'chore(deps-dev): Bump postcss (#252)' }));
    expect(p).toHaveLength(1);
    expect(p[0]).toContain('chore(release): v0.8.4');
  });

  it('does not let v0.8.1 match a v0.8.10 bump subject', () => {
    const p = findProblems('0.8.1', facts({ subject: 'chore(release): v0.8.10 (#300)', pkgVersion: '0.8.1' }));
    expect(p).toHaveLength(1);
    expect(p[0]).toContain('chore(release): v0.8.1');
  });

  it('reports version and subject together on a Dependabot merge', () => {
    const p = findProblems(
      '0.8.4',
      facts({ subject: 'chore(deps-dev): Bump postcss from 8.5.26 to 8.5.28 (#252)', pkgVersion: '0.8.3' }),
    );
    expect(p).toHaveLength(2);
    expect(has(p, 'package.json says 0.8.3')).toBe(true);
    expect(has(p, 'chore(release): v0.8.4')).toBe(true);
  });

  it('rejects a tag that already exists locally', () => {
    const p = findProblems('0.8.4', facts({ localTag: true }));
    expect(p).toHaveLength(1);
    expect(p[0]).toContain('v0.8.4 already exists locally');
  });

  it('rejects a tag that already exists on origin', () => {
    const p = findProblems('0.8.4', facts({ remoteTag: true }));
    expect(p).toHaveLength(1);
    expect(p[0]).toContain('v0.8.4 already exists on origin');
  });

  it('treats an unknown remote tag state as a problem, not as absent', () => {
    const p = findProblems('0.8.4', facts({ remoteTag: null }));
    expect(p).toHaveLength(1);
    expect(p[0]).toContain('could not check origin');
  });
});
