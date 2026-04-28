import type {
  Component,
  License,
  LicenseCategory,
  Severity,
} from '../types';
import { classifyComponent } from '../license/classify';
import { isLive, worstSeverityOf } from '../parse/vex';

export interface FilterState {
  query: string;
  licenses: ReadonlySet<string>;
  scopes: ReadonlySet<string>;
  types: ReadonlySet<string>;
  categories: ReadonlySet<LicenseCategory>;
  /** Originator filter values; can include the special tokens
   * ORIGINATOR_OTHER and ORIGINATOR_UNKNOWN. */
  originators: ReadonlySet<string>;
  /** Severity filter values. `none` is a pseudo-severity that matches
   * components with zero live (visible-by-default) vulnerabilities. */
  severities: ReadonlySet<Severity>;
}

export function emptyFilters(): FilterState {
  return {
    query: '',
    licenses: new Set(),
    scopes: new Set(),
    types: new Set(),
    categories: new Set(),
    originators: new Set(),
    severities: new Set(),
  };
}

export function hasActiveFilters(f: FilterState): boolean {
  return (
    f.query.trim().length > 0 ||
    f.licenses.size > 0 ||
    f.scopes.size > 0 ||
    f.types.size > 0 ||
    f.categories.size > 0 ||
    f.originators.size > 0 ||
    f.severities.size > 0
  );
}

/**
 * AND across facets, OR within a facet. Free-text query is case-insensitive
 * substring match across the searchable fields documented in the
 * sbom-filter spec.
 */
export function applyFilters(
  components: readonly Component[],
  filters: FilterState,
  // Optional: the set of "named" (top-N) originators currently surfaced in
  // the donut. Required when filters.originators contains ORIGINATOR_OTHER
  // so we can identify which components belong to the implicit "Other"
  // bucket. When omitted, ORIGINATOR_OTHER matches no component.
  topOriginators: ReadonlySet<string> = EMPTY_SET,
  // When true, suppressed vulnerabilities (VEX `analysis.state` of
  // `not_affected` / `false_positive` / `resolved`) participate in the
  // severity filter. When false (default), they are treated as if absent.
  showSuppressed = false,
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
    if (filters.categories.size > 0) {
      const cat = classifyComponent(c.licenses);
      if (!filters.categories.has(cat)) return false;
    }
    if (filters.originators.size > 0) {
      if (!matchesOriginator(c, filters.originators, topOriginators)) {
        return false;
      }
    }
    if (filters.severities.size > 0) {
      if (!matchesSeverity(c, filters.severities, showSuppressed)) return false;
    }
    if (q.length > 0 && !matchesQuery(c, q)) return false;
    return true;
  });
}

function matchesSeverity(
  c: Component,
  selected: ReadonlySet<Severity>,
  showSuppressed: boolean,
): boolean {
  // Match by the component's WORST visible severity (mirrors the per-row
  // badge color). This makes "select low" mean "show me components whose
  // problems are all low-severity" rather than "show me components with
  // at least one low vuln (which may also have criticals)" — the latter
  // is confusing when criticals end up in the result set. The component's
  // primary severity behaves like its primary license-category for the
  // category facet: one value per component, exact match against the set.
  const visible = showSuppressed
    ? c.vulnerabilities
    : c.vulnerabilities.filter(isLive);
  if (visible.length === 0) {
    return selected.has('none');
  }
  return selected.has(worstSeverityOf(visible));
}

const EMPTY_SET: ReadonlySet<string> = new Set();

export const ORIGINATOR_OTHER = '__originator_other__';
export const ORIGINATOR_UNKNOWN = '__originator_unknown__';

function matchesOriginator(
  c: Component,
  selected: ReadonlySet<string>,
  topOriginators: ReadonlySet<string>,
): boolean {
  const orig = c.originator;
  if (orig === null) {
    return selected.has(ORIGINATOR_UNKNOWN);
  }
  if (selected.has(orig)) return true;
  if (selected.has(ORIGINATOR_OTHER) && !topOriginators.has(orig)) return true;
  return false;
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
 * Count components per distinct license value, sorted descending. SPDX
 * expressions get their own bucket. A multi-license component contributes
 * to each of its license buckets.
 */
export function computeLicenseBreakdown(
  components: readonly Component[],
): LicenseBreakdownEntry[] {
  const counts = new Map<string, { count: number; kind: License['kind'] }>();
  for (const c of components) {
    if (c.licenses.length === 0) continue;
    for (const lic of c.licenses) {
      const existing = counts.get(lic.value);
      if (existing) existing.count += 1;
      else counts.set(lic.value, { count: 1, kind: lic.kind });
    }
  }
  return Array.from(counts.entries())
    .map(([license, { count, kind }]) => ({ license, count, kind }))
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.license.localeCompare(b.license);
    });
}

export interface CategoryBreakdownEntry {
  category: LicenseCategory;
  count: number;
}

/**
 * Count components per license category. Each component is classified by
 * its first license (see classifyComponent). Empty categories are omitted.
 */
export function computeCategoryBreakdown(
  components: readonly Component[],
): CategoryBreakdownEntry[] {
  const counts = new Map<LicenseCategory, number>();
  for (const c of components) {
    const cat = classifyComponent(c.licenses);
    counts.set(cat, (counts.get(cat) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count);
}

/**
 * For the drill-down panel: list of distinct license values whose
 * components classify into the given category, with counts.
 */
export function licensesInCategory(
  components: readonly Component[],
  category: LicenseCategory,
): LicenseBreakdownEntry[] {
  const entries = computeLicenseBreakdown(
    components.filter((c) => classifyComponent(c.licenses) === category),
  );
  return entries;
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

export interface OriginatorBreakdownEntry {
  /** Display name for this slice (originator, "Other", or "Unknown"). */
  label: string;
  /** Filter token: real originator name, ORIGINATOR_OTHER, or ORIGINATOR_UNKNOWN. */
  id: string;
  count: number;
  /** True for the synthetic Other / Unknown buckets. */
  synthetic: boolean;
}

/**
 * Bucket components by `originator`, returning the top N + an "Other"
 * bucket for the long tail + an "Unknown" bucket for components without
 * an originator. Empty buckets are omitted. Top-N is sorted descending
 * by count; ties broken alphabetically.
 */
export function computeOriginatorBreakdown(
  components: readonly Component[],
  topN = 8,
): OriginatorBreakdownEntry[] {
  const counts = new Map<string, number>();
  let unknown = 0;
  for (const c of components) {
    if (c.originator === null) {
      unknown += 1;
    } else {
      counts.set(c.originator, (counts.get(c.originator) ?? 0) + 1);
    }
  }
  const ranked = Array.from(counts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.name.localeCompare(b.name);
    });

  const top = ranked.slice(0, topN);
  const tail = ranked.slice(topN);
  const otherCount = tail.reduce((s, t) => s + t.count, 0);

  const out: OriginatorBreakdownEntry[] = top.map((t) => ({
    label: t.name,
    id: t.name,
    count: t.count,
    synthetic: false,
  }));
  if (otherCount > 0) {
    out.push({
      label: `Other (${tail.length})`,
      id: ORIGINATOR_OTHER,
      count: otherCount,
      synthetic: true,
    });
  }
  if (unknown > 0) {
    out.push({
      label: 'Unknown',
      id: ORIGINATOR_UNKNOWN,
      count: unknown,
      synthetic: true,
    });
  }
  // Final pass: sort the full list (named + synthetic) by count desc so
  // "Other" / "Unknown" land in their correct rank instead of pinned to
  // the bottom. Tie-breaker pushes synthetics after named entries, then
  // alphabetical on labels.
  out.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    if (a.synthetic !== b.synthetic) return a.synthetic ? 1 : -1;
    return a.label.localeCompare(b.label);
  });
  return out;
}

/** The set of "named" (top-N) originator strings currently surfaced in
 * the donut, used by applyFilters to resolve the synthetic "Other" bucket. */
export function topOriginatorIds(
  breakdown: readonly OriginatorBreakdownEntry[],
): Set<string> {
  const set = new Set<string>();
  for (const b of breakdown) if (!b.synthetic) set.add(b.id);
  return set;
}

export interface SeverityBreakdownEntry {
  severity: Severity;
  label: string;
  count: number;
}

const SEVERITY_LABEL: Record<Severity, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  unknown: 'Unknown',
  none: 'None',
};

/** Display order from most severe → least severe; mirrors SeverityFilter. */
const SEVERITY_ORDER: readonly Severity[] = [
  'critical',
  'high',
  'medium',
  'low',
  'unknown',
];

/**
 * Count vulnerabilities by severity across all loaded components. Honors
 * `showSuppressed` (suppressed entries count only when the toggle is on).
 * The "none" pseudo-severity is intentionally excluded — it represents
 * components without vulns and would crowd the donut.
 */
export function computeVulnsBySeverityBreakdown(
  components: readonly Component[],
  showSuppressed: boolean,
): SeverityBreakdownEntry[] {
  const counts: Record<Severity, number> = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    unknown: 0,
    none: 0,
  };
  for (const c of components) {
    for (const v of c.vulnerabilities) {
      if (!showSuppressed && !isLive(v)) continue;
      counts[v.severity] = (counts[v.severity] ?? 0) + 1;
    }
  }
  // Empty buckets are omitted so the donut doesn't render slivers for
  // severities that aren't present in this SBOM/VEX pair.
  return SEVERITY_ORDER.filter((s) => counts[s] > 0).map((s) => ({
    severity: s,
    label: SEVERITY_LABEL[s],
    count: counts[s],
  }));
}

/**
 * Bucket vulnerabilities by their components' originator. The shape mirrors
 * computeOriginatorBreakdown so it can feed the same OriginatorDonut. Counts
 * are vulnerabilities (not components); a component with three live vulns
 * contributes three to its originator's bucket. Honors the `showSuppressed`
 * flag — when false, only entries where `isLive` is true are counted.
 *
 * Originators with zero vulnerabilities are omitted entirely.
 */
export function computeVulnsByOriginatorBreakdown(
  components: readonly Component[],
  showSuppressed: boolean,
  topN = 8,
): OriginatorBreakdownEntry[] {
  const counts = new Map<string, number>();
  let unknown = 0;
  for (const c of components) {
    const n = showSuppressed
      ? c.vulnerabilities.length
      : c.vulnerabilities.filter(isLive).length;
    if (n === 0) continue;
    if (c.originator === null) {
      unknown += n;
    } else {
      counts.set(c.originator, (counts.get(c.originator) ?? 0) + n);
    }
  }
  const ranked = Array.from(counts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.name.localeCompare(b.name);
    });
  const top = ranked.slice(0, topN);
  const tail = ranked.slice(topN);
  const otherCount = tail.reduce((s, t) => s + t.count, 0);
  const out: OriginatorBreakdownEntry[] = top.map((t) => ({
    label: t.name,
    id: t.name,
    count: t.count,
    synthetic: false,
  }));
  if (otherCount > 0) {
    out.push({
      label: `Other (${tail.length})`,
      id: ORIGINATOR_OTHER,
      count: otherCount,
      synthetic: true,
    });
  }
  if (unknown > 0) {
    out.push({
      label: 'Unknown',
      id: ORIGINATOR_UNKNOWN,
      count: unknown,
      synthetic: true,
    });
  }
  out.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    if (a.synthetic !== b.synthetic) return a.synthetic ? 1 : -1;
    return a.label.localeCompare(b.label);
  });
  return out;
}
