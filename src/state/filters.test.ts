import { describe, expect, it } from 'vitest';
import {
  applyFilters,
  computeLicenseBreakdown,
  computeCategoryBreakdown,
  licensesInCategory,
  emptyFilters,
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
