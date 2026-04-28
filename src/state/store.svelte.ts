import type { LoadedSbom } from '../types';
import {
  applyFilters,
  computeLicenseBreakdown,
  distinctScopes,
  distinctTypes,
} from './filters';
import { filtersToQueryString, searchParamsToFilters } from './url';

class SbomStore {
  loadedSbom = $state<LoadedSbom | null>(null);
  loadError = $state<string | null>(null);

  query = $state('');
  licenseFilters = $state<Set<string>>(new Set());
  scopeFilters = $state<Set<string>>(new Set());
  typeFilters = $state<Set<string>>(new Set());

  components = $derived(this.loadedSbom?.components ?? []);

  filteredComponents = $derived(
    applyFilters(this.components, {
      query: this.query,
      licenses: this.licenseFilters,
      scopes: this.scopeFilters,
      types: this.typeFilters,
    }),
  );

  licenseBreakdown = $derived(computeLicenseBreakdown(this.filteredComponents));
  licenseBreakdownAll = $derived(computeLicenseBreakdown(this.components));
  availableScopes = $derived(distinctScopes(this.components));
  availableTypes = $derived(distinctTypes(this.components));

  setLoaded(sbom: LoadedSbom): void {
    this.loadedSbom = sbom;
    this.loadError = null;
  }

  setError(message: string): void {
    this.loadError = message;
  }

  reset(): void {
    this.loadedSbom = null;
    this.loadError = null;
    this.query = '';
    this.licenseFilters = new Set();
    this.scopeFilters = new Set();
    this.typeFilters = new Set();
  }

  toggleLicense(value: string): void {
    this.licenseFilters = toggle(this.licenseFilters, value);
  }

  toggleScope(value: string): void {
    this.scopeFilters = toggle(this.scopeFilters, value);
  }

  toggleType(value: string): void {
    this.typeFilters = toggle(this.typeFilters, value);
  }

  clearFilters(): void {
    this.query = '';
    this.licenseFilters = new Set();
    this.scopeFilters = new Set();
    this.typeFilters = new Set();
  }

  hydrateFromUrl(): void {
    if (typeof window === 'undefined') return;
    const f = searchParamsToFilters(
      new URLSearchParams(window.location.search),
    );
    this.query = f.query;
    this.licenseFilters = new Set(f.licenses);
    this.scopeFilters = new Set(f.scopes);
    this.typeFilters = new Set(f.types);
  }

  /**
   * Serialize current filter state into the URL via history.replaceState.
   * Uses replaceState (not pushState) so the back button still leaves the app.
   */
  syncToUrl(): void {
    if (typeof window === 'undefined') return;
    const qs = filtersToQueryString({
      query: this.query,
      licenses: this.licenseFilters,
      scopes: this.scopeFilters,
      types: this.typeFilters,
    });
    const next = `${window.location.pathname}${qs}${window.location.hash}`;
    if (next !== window.location.pathname + window.location.search + window.location.hash) {
      window.history.replaceState(null, '', next);
    }
  }
}

function toggle(set: Set<string>, value: string): Set<string> {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

export const store = new SbomStore();
