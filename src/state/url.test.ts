import { describe, expect, it } from 'vitest';
import {
  filtersToQueryString,
  filtersToSearchParams,
  searchParamsToFilters,
} from './url';
import { emptyFilters } from './filters';

describe('URL serialization', () => {
  it('produces empty query string for empty filters', () => {
    expect(filtersToQueryString(emptyFilters())).toBe('');
  });

  it('encodes the search query as q=...', () => {
    const params = filtersToSearchParams({
      ...emptyFilters(),
      query: 'jackson',
    });
    expect(params.toString()).toBe('q=jackson');
  });

  it('encodes multiple licenses with stable ordering', () => {
    const params = filtersToSearchParams({
      ...emptyFilters(),
      licenses: new Set(['MIT', 'Apache-2.0']),
    });
    expect(params.getAll('license')).toEqual(['Apache-2.0', 'MIT']);
  });

  it('round-trips through filtersToSearchParams / searchParamsToFilters', () => {
    const original = {
      query: 'jackson',
      licenses: new Set(['Apache-2.0', 'MIT']),
      scopes: new Set(['required']),
      types: new Set(['library']),
    };
    const params = filtersToSearchParams(original);
    const restored = searchParamsToFilters(params);
    expect(restored.query).toBe('jackson');
    expect([...restored.licenses].sort()).toEqual(['Apache-2.0', 'MIT']);
    expect([...restored.scopes]).toEqual(['required']);
    expect([...restored.types]).toEqual(['library']);
  });

  it('parses an empty search string as empty filters', () => {
    const restored = searchParamsToFilters(new URLSearchParams(''));
    expect(restored.query).toBe('');
    expect(restored.licenses.size).toBe(0);
    expect(restored.scopes.size).toBe(0);
    expect(restored.types.size).toBe(0);
  });
});
