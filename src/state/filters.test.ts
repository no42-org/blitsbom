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
    scope: 'required',
    purl: null,
    licenses: [{ kind: 'id', value: 'Apache-2.0' }],
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
