/*
 * Copyright 2026 Ronny Trommer <ronny@no42.org>
 * SPDX-License-Identifier: MIT
 */
import { describe, expect, it } from 'vitest';
import {
  applyFilters,
  computeLicenseBreakdown,
  computeCategoryBreakdown,
  licensesInCategory,
  emptyFilters,
  computeOriginatorBreakdown,
  topOriginatorIds,
  ORIGINATOR_UNKNOWN,
  isLicensable,
  countExcluded,
  hasActiveFilters,
  countHiddenFiles,
} from './filters';
import type { Component } from '../types';

function lib(name: string, overrides: Partial<Component> = {}): Component {
  return {
    type: 'library',
    group: null,
    name,
    version: '1.0.0',
    description: null,
    publisher: null,
    originator: null,
    scope: 'required',
    purl: null,
    purlCanonical: null,
    bomRef: null,
    licenses: [{ kind: 'id', value: 'Apache-2.0' }],
    vulnerabilities: [],
    ...overrides,
  };
}

describe('applyFilters', () => {
  const components: Component[] = [
    lib('jackson-core'),
    lib('okhttp', { licenses: [{ kind: 'id', value: 'Apache-2.0' }] }),
    lib('slf4j-api', { licenses: [{ kind: 'id', value: 'MIT' }] }),
    lib('legacy-tool', {
      scope: 'optional',
      licenses: [{ kind: 'expression', value: '(MIT OR Apache-2.0)' }],
    }),
    lib('gpl-thing', { licenses: [{ kind: 'id', value: 'GPL-3.0' }] }),
  ];

  it('returns everything with empty filters', () => {
    expect(applyFilters(components, emptyFilters())).toHaveLength(5);
  });

  it('matches free-text query case-insensitively', () => {
    const filters = { ...emptyFilters(), query: 'JACKSON' };
    expect(applyFilters(components, filters).map((c) => c.name)).toEqual([
      'jackson-core',
    ]);
  });

  it('OR within license facet', () => {
    const filters = {
      ...emptyFilters(),
      licenses: new Set(['MIT', 'Apache-2.0']),
    };
    expect(applyFilters(components, filters)).toHaveLength(3);
  });

  it('AND across facets', () => {
    const filters = {
      ...emptyFilters(),
      licenses: new Set(['Apache-2.0']),
      scopes: new Set(['required']),
    };
    const names = applyFilters(components, filters)
      .map((c) => c.name)
      .sort();
    expect(names).toEqual(['jackson-core', 'okhttp']);
  });

  it('filters by license category (permissive)', () => {
    const filters = {
      ...emptyFilters(),
      categories: new Set(['permissive' as const]),
    };
    const names = applyFilters(components, filters).map((c) => c.name).sort();
    // legacy-tool's expression "(MIT OR Apache-2.0)" classifies as permissive
    // because OR takes the least restrictive sub-category.
    expect(names).toEqual(['jackson-core', 'legacy-tool', 'okhttp', 'slf4j-api']);
  });

  it('filters by license category (strong-copyleft)', () => {
    const filters = {
      ...emptyFilters(),
      categories: new Set(['strong-copyleft' as const]),
    };
    expect(applyFilters(components, filters).map((c) => c.name)).toEqual([
      'gpl-thing',
    ]);
  });

  it('OR within category facet, AND across with license filter', () => {
    const filters = {
      ...emptyFilters(),
      categories: new Set(['permissive' as const, 'strong-copyleft' as const]),
      licenses: new Set(['Apache-2.0']),
    };
    const names = applyFilters(components, filters).map((c) => c.name).sort();
    expect(names).toEqual(['jackson-core', 'okhttp']);
  });

  it('classifies unrecognized expressions accordingly', () => {
    const filters = {
      ...emptyFilters(),
      categories: new Set(['unrecognized' as const]),
    };
    // legacy-tool's expression `(MIT OR Apache-2.0)` resolves to permissive
    // (OR-min). Replace with a synthetic unrecognizable expression.
    const withUnknown: Component[] = [
      ...components,
      lib('mystery-tool', {
        licenses: [{ kind: 'name', value: 'CompletelyMadeUpLicense' }],
      }),
    ];
    expect(applyFilters(withUnknown, filters).map((c) => c.name)).toEqual([
      'mystery-tool',
    ]);
  });

  describe('severity facet (matched by worst severity)', () => {
    const a = lib('a', {
      vulnerabilities: [{ id: 'CVE-1', source: 's', severity: 'high' }],
    });
    const b = lib('b', {
      vulnerabilities: [{ id: 'CVE-2', source: 's', severity: 'low' }],
    });
    const mixed = lib('mixed', {
      vulnerabilities: [
        { id: 'CVE-A', source: 's', severity: 'low' },
        { id: 'CVE-B', source: 's', severity: 'high' },
      ],
    });
    const clean = lib('clean'); // no vulns
    const suppressed = lib('s', {
      vulnerabilities: [
        { id: 'CVE-3', source: 's', severity: 'critical', status: 'not_affected' },
      ],
    });
    const universe = [a, b, mixed, clean, suppressed];

    it('matches by the component WORST severity (OR within facet)', () => {
      const filters = {
        ...emptyFilters(),
        severities: new Set<'high' | 'critical'>(['high', 'critical']),
      };
      // a (high) and mixed (worst=high) match. b (low) does not.
      expect(
        applyFilters(universe, filters as never).map((c) => c.name).sort(),
      ).toEqual(['a', 'mixed']);
    });

    it('selecting "low" excludes components whose worst is higher than low', () => {
      // Regression: previously a "low" filter would match `mixed` because
      // it has at least one low vuln. The user-reported behavior was
      // confusing (criticals/highs leaking into the result). The fix
      // matches by the component's worst severity instead.
      const filters = { ...emptyFilters(), severities: new Set<'low'>(['low']) };
      expect(
        applyFilters(universe, filters as never).map((c) => c.name),
      ).toEqual(['b']);
    });

    it('"none" pseudo-severity matches components with zero live vulns', () => {
      const filters = { ...emptyFilters(), severities: new Set<'none'>(['none']) };
      expect(
        applyFilters(universe, filters as never).map((c) => c.name).sort(),
      ).toEqual(['clean', 's']); // suppressed-only counts as zero live by default
    });

    it('honors showSuppressed flag', () => {
      const filters = {
        ...emptyFilters(),
        severities: new Set<'critical'>(['critical']),
      };
      // Default: suppressed not visible, so `s` is filtered OUT of critical.
      expect(
        applyFilters(universe, filters as never, undefined, false).map(
          (c) => c.name,
        ),
      ).toEqual([]);
      // With showSuppressed=true, `s`'s worst becomes critical → matches.
      expect(
        applyFilters(universe, filters as never, undefined, true).map(
          (c) => c.name,
        ),
      ).toEqual(['s']);
    });
  });
});

describe('computeLicenseBreakdown', () => {
  it('counts components per distinct license value', () => {
    const components: Component[] = [
      lib('a', { licenses: [{ kind: 'id', value: 'Apache-2.0' }] }),
      lib('b', { licenses: [{ kind: 'id', value: 'Apache-2.0' }] }),
      lib('c', { licenses: [{ kind: 'id', value: 'MIT' }] }),
    ];
    const result = computeLicenseBreakdown(components);
    expect(result).toEqual([
      { license: 'Apache-2.0', count: 2, kind: 'id' },
      { license: 'MIT', count: 1, kind: 'id' },
    ]);
  });
});

describe('computeCategoryBreakdown', () => {
  it('buckets components into categories sorted descending', () => {
    const components: Component[] = [
      lib('a', { licenses: [{ kind: 'id', value: 'Apache-2.0' }] }),
      lib('b', { licenses: [{ kind: 'id', value: 'MIT' }] }),
      lib('c', { licenses: [{ kind: 'id', value: 'GPL-3.0' }] }),
      lib('d', { licenses: [] }),
    ];
    const result = computeCategoryBreakdown(components);
    const ids = result.map((r) => r.category);
    expect(ids[0]).toBe('permissive');
    const counts = Object.fromEntries(result.map((r) => [r.category, r.count]));
    expect(counts.permissive).toBe(2);
    expect(counts['strong-copyleft']).toBe(1);
    expect(counts.undeclared).toBe(1);
  });
});

describe('licensesInCategory', () => {
  it('returns distinct licenses scoped to the chosen category', () => {
    const components: Component[] = [
      lib('a', { licenses: [{ kind: 'id', value: 'Apache-2.0' }] }),
      lib('b', { licenses: [{ kind: 'id', value: 'Apache-2.0' }] }),
      lib('c', { licenses: [{ kind: 'id', value: 'MIT' }] }),
      lib('d', { licenses: [{ kind: 'id', value: 'GPL-3.0' }] }),
    ];
    const result = licensesInCategory(components, 'permissive');
    expect(result.map((r) => r.license).sort()).toEqual(['Apache-2.0', 'MIT']);
    expect(result.find((r) => r.license === 'Apache-2.0')!.count).toBe(2);
  });
});

describe('file components (syft image SBOMs, #306)', () => {
  // Mirrors alpine:3.20 scanned by syft: every package declares a license,
  // package-owned files carry none, and the OS component asserts none.
  const alpine: Component[] = [
    ...Array.from({ length: 14 }, (_, i) =>
      lib(`pkg-${i}`, {
        originator: 'Natanael Copa',
        licenses: [{ kind: 'id', value: 'MIT' }],
      }),
    ),
    ...Array.from({ length: 77 }, (_, i) =>
      lib(`/etc/file-${i}`, { type: 'file', scope: null, licenses: [] }),
    ),
    lib('alpine', { type: 'operating-system', scope: null, licenses: [] }),
  ];

  it('leaves files out of the category breakdown', () => {
    const counts = Object.fromEntries(
      computeCategoryBreakdown(alpine).map((r) => [r.category, r.count]),
    );
    expect(counts).toEqual({ permissive: 14, undeclared: 1 });
  });

  it('leaves files out of the originator breakdown', () => {
    const result = computeOriginatorBreakdown(alpine);
    expect(result.reduce((s, r) => s + r.count, 0)).toBe(15);
    expect(result.find((r) => r.id === ORIGINATOR_UNKNOWN)!.count).toBe(1);
  });

  it('leaves files out of the drill-down', () => {
    expect(licensesInCategory(alpine, 'undeclared')).toEqual([]);
    expect(licensesInCategory(alpine, 'permissive')).toEqual([
      { license: 'MIT', count: 14, kind: 'id' },
    ]);
  });

  it('category=undeclared matches only the OS component', () => {
    const filters = { ...emptyFilters(), categories: new Set(['undeclared']) };
    expect(
      applyFilters(alpine, filters as never).map((c) => c.type),
    ).toEqual(['operating-system']);
  });

  it('Unknown originator matches no file', () => {
    const filters = {
      ...emptyFilters(),
      originators: new Set([ORIGINATOR_UNKNOWN]),
    };
    expect(applyFilters(alpine, filters).map((c) => c.type)).toEqual([
      'operating-system',
    ]);
  });

  it('hides unlicensed files by default', () => {
    expect(applyFilters(alpine, emptyFilters())).toHaveLength(15);
  });

  it('lists every component with showFiles', () => {
    const filters = { ...emptyFilters(), showFiles: true };
    expect(applyFilters(alpine, filters)).toHaveLength(92);
  });

  it('always lists a file that declares a license', () => {
    const licensedFile = lib('/usr/bin/script', {
      type: 'file',
      licenses: [{ kind: 'id', value: 'MIT' }],
    });
    expect(
      applyFilters([...alpine, licensedFile], emptyFilters()).map((c) => c.name),
    ).toContain('/usr/bin/script');
  });

  it('lists a file that carries a vulnerability', () => {
    const vulnFile = lib('/usr/lib/libz.so', {
      type: 'file',
      licenses: [],
      vulnerabilities: [{ id: 'CVE-1', source: 'NVD', severity: 'high' }],
    });
    const all = [...alpine, vulnFile];
    expect(applyFilters(all, emptyFilters())).toHaveLength(16);
    const high = { ...emptyFilters(), severities: new Set(['high' as const]) };
    expect(applyFilters(all, high).map((c) => c.name)).toEqual(['/usr/lib/libz.so']);
    expect(countHiddenFiles(all)).toBe(77);
  });

  it('showFiles is not an active filter', () => {
    expect(hasActiveFilters({ ...emptyFilters(), showFiles: true })).toBe(false);
  });

  it('type=file still lists every file', () => {
    const filters = { ...emptyFilters(), types: new Set(['file']) };
    expect(applyFilters(alpine, filters)).toHaveLength(77);
  });

  it('type=file combined with a category matches nothing', () => {
    const filters = {
      ...emptyFilters(),
      types: new Set(['file']),
      categories: new Set(['undeclared']),
    };
    expect(applyFilters(alpine, filters as never)).toEqual([]);
  });

  it('counts a file that declares a license', () => {
    const licensedFile = lib('/usr/bin/script', {
      type: 'file',
      licenses: [{ kind: 'id', value: 'MIT' }],
    });
    const counts = Object.fromEntries(
      computeCategoryBreakdown([...alpine, licensedFile]).map((r) => [
        r.category,
        r.count,
      ]),
    );
    expect(counts).toEqual({ permissive: 15, undeclared: 1 });
    const filters = { ...emptyFilters(), categories: new Set(['permissive']) };
    expect(
      applyFilters([...alpine, licensedFile], filters as never),
    ).toHaveLength(15);
  });

  it('every slice count equals the rows its filter produces', () => {
    for (const { category, count } of computeCategoryBreakdown(alpine)) {
      const filters = { ...emptyFilters(), categories: new Set([category]) };
      expect(applyFilters(alpine, filters)).toHaveLength(count);
    }
    const originators = computeOriginatorBreakdown(alpine);
    const top = topOriginatorIds(originators);
    for (const { id, count } of originators) {
      const filters = { ...emptyFilters(), originators: new Set([id]) };
      expect(applyFilters(alpine, filters, top)).toHaveLength(count);
    }
  });
});

describe('RPM signing keys (#307)', () => {
  const key = (n: number) =>
    lib('gpg-pubkey', {
      version: `${n}`,
      purl: `pkg:rpm/redhat/gpg-pubkey@${n}?distro=rhel-10.2`,
      licenses: [{ kind: 'name', value: 'pubkey' }],
    });
  const sbom: Component[] = [
    lib('bash', { originator: 'Red Hat', licenses: [{ kind: 'id', value: 'GPL-3.0-or-later' }] }),
    key(1),
    key(2),
    key(3),
    lib('gpg-pubkey', { purl: 'pkg:npm/gpg-pubkey@1.0.0' }),
  ];

  it('leaves signing keys out of both breakdowns', () => {
    const counts = Object.fromEntries(
      computeCategoryBreakdown(sbom).map((r) => [r.category, r.count]),
    );
    expect(counts).toEqual({ 'strong-copyleft': 1, permissive: 1 });
    expect(
      computeOriginatorBreakdown(sbom).reduce((s, r) => s + r.count, 0),
    ).toBe(2);
  });

  it('keeps an npm package of the same name', () => {
    expect(isLicensable(sbom[4]!)).toBe(true);
    expect(isLicensable(sbom[1]!)).toBe(false);
  });

  it('category=unrecognized matches no signing key', () => {
    const filters = { ...emptyFilters(), categories: new Set(['unrecognized']) };
    expect(applyFilters(sbom, filters as never)).toEqual([]);
  });

  it('counts files and signing keys separately', () => {
    const file = lib('/etc/x', { type: 'file', licenses: [] });
    expect(countExcluded([...sbom, file, file])).toEqual({ files: 2, keys: 3 });
  });
});
