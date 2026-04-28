import { describe, expect, it } from 'vitest';
import {
  applyFilters,
  computeLicenseBreakdown,
  emptyFilters,
} from './filters';
import type { Component } from '../types';

function lib(
  name: string,
  overrides: Partial<Component> = {},
): Component {
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
  ];

  it('returns everything with empty filters', () => {
    expect(applyFilters(components, emptyFilters())).toHaveLength(4);
  });

  it('matches free-text query case-insensitively', () => {
    const filters = { ...emptyFilters(), query: 'JACKSON' };
    expect(applyFilters(components, filters).map((c) => c.name)).toEqual([
      'jackson-core',
    ]);
  });

  it('filters by license (single value)', () => {
    const filters = { ...emptyFilters(), licenses: new Set(['MIT']) };
    expect(applyFilters(components, filters).map((c) => c.name)).toEqual([
      'slf4j-api',
    ]);
  });

  it('OR semantics within license facet', () => {
    const filters = {
      ...emptyFilters(),
      licenses: new Set(['MIT', 'Apache-2.0']),
    };
    expect(applyFilters(components, filters)).toHaveLength(3);
  });

  it('AND semantics across facets', () => {
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

  it('SPDX expression matches its bucket exactly, not its decomposition', () => {
    const filters = {
      ...emptyFilters(),
      licenses: new Set(['(MIT OR Apache-2.0)']),
    };
    expect(applyFilters(components, filters).map((c) => c.name)).toEqual([
      'legacy-tool',
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

  it('places SPDX expressions in their own bucket', () => {
    const components: Component[] = [
      lib('a', { licenses: [{ kind: 'id', value: 'MIT' }] }),
      lib('b', {
        licenses: [{ kind: 'expression', value: '(MIT OR Apache-2.0)' }],
      }),
    ];
    const result = computeLicenseBreakdown(components);
    const buckets = result.map((r) => r.license).sort();
    expect(buckets).toEqual(['(MIT OR Apache-2.0)', 'MIT']);
  });

  it('sorts descending by count then ascending by name', () => {
    const components: Component[] = [
      lib('a', { licenses: [{ kind: 'id', value: 'Z-License' }] }),
      lib('b', { licenses: [{ kind: 'id', value: 'A-License' }] }),
      lib('c', { licenses: [{ kind: 'id', value: 'A-License' }] }),
    ];
    const result = computeLicenseBreakdown(components);
    expect(result.map((r) => r.license)).toEqual(['A-License', 'Z-License']);
  });

  it('counts a multi-license component in each bucket', () => {
    const components: Component[] = [
      lib('a', {
        licenses: [
          { kind: 'id', value: 'Apache-2.0' },
          { kind: 'id', value: 'MIT' },
        ],
      }),
    ];
    const result = computeLicenseBreakdown(components);
    expect(result).toEqual([
      { license: 'Apache-2.0', count: 1, kind: 'id' },
      { license: 'MIT', count: 1, kind: 'id' },
    ]);
  });
});
