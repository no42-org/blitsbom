import type { Component, License } from '../types';

export interface FilterState {
  query: string;
  licenses: ReadonlySet<string>;
  scopes: ReadonlySet<string>;
  types: ReadonlySet<string>;
}

export function emptyFilters(): FilterState {
  return {
    query: '',
    licenses: new Set(),
    scopes: new Set(),
    types: new Set(),
  };
}

export function hasActiveFilters(f: FilterState): boolean {
  return (
    f.query.trim().length > 0 ||
    f.licenses.size > 0 ||
    f.scopes.size > 0 ||
    f.types.size > 0
  );
}

/**
 * Apply filters: AND across facets, OR within a facet.
 * Free-text query is case-insensitive substring match across the searchable
 * fields documented in the sbom-filter spec.
 */
export function applyFilters(
  components: readonly Component[],
  filters: FilterState,
): Component[] {
  const q = filters.query.trim().toLowerCase();
  return components.filter((c) => {
    if (filters.licenses.size > 0) {
      const matched = c.licenses.some((l) => filters.licenses.has(l.value));
      if (!matched) return false;
    }
    if (filters.scopes.size > 0) {
      if (c.scope === null || !filters.scopes.has(c.scope)) return false;
    }
    if (filters.types.size > 0) {
      if (!filters.types.has(c.type)) return false;
    }
    if (q.length > 0 && !matchesQuery(c, q)) return false;
    return true;
  });
}

function matchesQuery(c: Component, q: string): boolean {
  const haystacks: (string | null)[] = [
    c.name,
    c.version,
    c.scope,
    c.type,
    c.group,
    c.publisher,
    c.description,
    c.purl,
    ...c.licenses.map((l) => l.value),
  ];
  for (const h of haystacks) {
    if (h !== null && h.toLowerCase().includes(q)) return true;
  }
  return false;
}

export interface LicenseBreakdownEntry {
  license: string;
  count: number;
  kind: License['kind'];
}

/**
 * Count components per distinct license value, sorted descending.
 * SPDX expressions get their own bucket — they are NOT decomposed in v1.
 * A component carrying multiple licenses contributes to each bucket.
 */
export function computeLicenseBreakdown(
  components: readonly Component[],
): LicenseBreakdownEntry[] {
  const counts = new Map<string, { count: number; kind: License['kind'] }>();
  for (const c of components) {
    if (c.licenses.length === 0) continue;
    for (const lic of c.licenses) {
      const existing = counts.get(lic.value);
      if (existing) {
        existing.count += 1;
      } else {
        counts.set(lic.value, { count: 1, kind: lic.kind });
      }
    }
  }
  return Array.from(counts.entries())
    .map(([license, { count, kind }]) => ({ license, count, kind }))
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.license.localeCompare(b.license);
    });
}

export function distinctScopes(components: readonly Component[]): string[] {
  const set = new Set<string>();
  for (const c of components) if (c.scope !== null) set.add(c.scope);
  return Array.from(set).sort();
}

export function distinctTypes(components: readonly Component[]): string[] {
  const set = new Set<string>();
  for (const c of components) set.add(c.type);
  return Array.from(set).sort();
}
