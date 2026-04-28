import { emptyFilters, type FilterState } from './filters';
import type { LicenseCategory, Severity } from '../types';

const PARAM_QUERY = 'q';
const PARAM_LICENSE = 'license';
const PARAM_SCOPE = 'scope';
const PARAM_TYPE = 'type';
const PARAM_CATEGORY = 'category';
const PARAM_ORIGINATOR = 'originator';
const PARAM_SEVERITY = 'severity';

const VALID_CATEGORIES: ReadonlySet<LicenseCategory> = new Set<LicenseCategory>([
  'undeclared',
  'public-domain',
  'permissive',
  'copyleft',
  'strong-copyleft',
  'unrecognized',
  'proprietary',
]);

const VALID_SEVERITIES: ReadonlySet<Severity> = new Set<Severity>([
  'none',
  'low',
  'medium',
  'high',
  'critical',
  'unknown',
]);

export function filtersToSearchParams(filters: FilterState): URLSearchParams {
  const params = new URLSearchParams();
  const q = filters.query.trim();
  if (q.length > 0) params.set(PARAM_QUERY, q);
  for (const v of [...filters.licenses].sort()) params.append(PARAM_LICENSE, v);
  for (const v of [...filters.scopes].sort()) params.append(PARAM_SCOPE, v);
  for (const v of [...filters.types].sort()) params.append(PARAM_TYPE, v);
  for (const v of [...filters.categories].sort()) params.append(PARAM_CATEGORY, v);
  for (const v of [...filters.originators].sort()) {
    params.append(PARAM_ORIGINATOR, v);
  }
  for (const v of [...filters.severities].sort()) {
    params.append(PARAM_SEVERITY, v);
  }
  return params;
}

export function searchParamsToFilters(params: URLSearchParams): FilterState {
  const base = emptyFilters();
  const categories = new Set<LicenseCategory>();
  for (const raw of params.getAll(PARAM_CATEGORY)) {
    if (VALID_CATEGORIES.has(raw as LicenseCategory)) {
      categories.add(raw as LicenseCategory);
    }
  }
  const severities = new Set<Severity>();
  for (const raw of params.getAll(PARAM_SEVERITY)) {
    if (VALID_SEVERITIES.has(raw as Severity)) {
      severities.add(raw as Severity);
    }
  }
  return {
    query: params.get(PARAM_QUERY) ?? base.query,
    licenses: new Set(params.getAll(PARAM_LICENSE)),
    scopes: new Set(params.getAll(PARAM_SCOPE)),
    types: new Set(params.getAll(PARAM_TYPE)),
    categories,
    originators: new Set(params.getAll(PARAM_ORIGINATOR)),
    severities,
  };
}

export function filtersToQueryString(filters: FilterState): string {
  const params = filtersToSearchParams(filters);
  const s = params.toString();
  return s.length > 0 ? `?${s}` : '';
}
