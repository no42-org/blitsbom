import { emptyFilters, type FilterState } from './filters';

const PARAM_QUERY = 'q';
const PARAM_LICENSE = 'license';
const PARAM_SCOPE = 'scope';
const PARAM_TYPE = 'type';

export function filtersToSearchParams(filters: FilterState): URLSearchParams {
  const params = new URLSearchParams();
  const q = filters.query.trim();
  if (q.length > 0) params.set(PARAM_QUERY, q);
  for (const v of [...filters.licenses].sort()) params.append(PARAM_LICENSE, v);
  for (const v of [...filters.scopes].sort()) params.append(PARAM_SCOPE, v);
  for (const v of [...filters.types].sort()) params.append(PARAM_TYPE, v);
  return params;
}

export function searchParamsToFilters(params: URLSearchParams): FilterState {
  const base = emptyFilters();
  return {
    query: params.get(PARAM_QUERY) ?? base.query,
    licenses: new Set(params.getAll(PARAM_LICENSE)),
    scopes: new Set(params.getAll(PARAM_SCOPE)),
    types: new Set(params.getAll(PARAM_TYPE)),
  };
}

export function filtersToQueryString(filters: FilterState): string {
  const params = filtersToSearchParams(filters);
  const s = params.toString();
  return s.length > 0 ? `?${s}` : '';
}
