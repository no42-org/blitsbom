import type { LoadedSbom, LicenseCategory } from '../types';
import {
  applyFilters,
  computeCategoryBreakdown,
  computeLicenseBreakdown,
  distinctScopes,
  distinctTypes,
  licensesInCategory,
} from './filters';
import { filtersToQueryString, searchParamsToFilters } from './url';

export type IngestState = 'idle' | 'reading' | 'parsing' | 'error';

class SbomStore {
  loadedSbom = $state<LoadedSbom | null>(null);
  loadError = $state<string | null>(null);

  ingestState = $state<IngestState>('idle');
  ingestBytesLoaded = $state(0);
  ingestBytesTotal = $state(0);

  query = $state('');
  licenseFilters = $state<Set<string>>(new Set());
  scopeFilters = $state<Set<string>>(new Set());
  typeFilters = $state<Set<string>>(new Set());
  categoryFilters = $state<Set<LicenseCategory>>(new Set());

  components = $derived(this.loadedSbom?.components ?? []);

  filteredComponents = $derived(
    applyFilters(this.components, {
      query: this.query,
      licenses: this.licenseFilters,
      scopes: this.scopeFilters,
      types: this.typeFilters,
      categories: this.categoryFilters,
    }),
  );

  categoryBreakdownAll = $derived(computeCategoryBreakdown(this.components));
  categoryBreakdownFiltered = $derived(
    computeCategoryBreakdown(this.filteredComponents),
  );

  /**
   * Drill-down panel content: distinct license values for the *single*
   * category currently selected, or null when none/multiple are active.
   */
  drilldownLicenses = $derived(
    this.categoryFilters.size === 1
      ? licensesInCategory(
          this.components,
          [...this.categoryFilters][0]!,
        )
      : null,
  );

  licenseBreakdown = $derived(computeLicenseBreakdown(this.filteredComponents));
  availableScopes = $derived(distinctScopes(this.components));
  availableTypes = $derived(distinctTypes(this.components));

  setLoaded(sbom: LoadedSbom): void {
    this.loadedSbom = sbom;
    this.loadError = null;
    this.ingestState = 'idle';
    this.ingestBytesLoaded = 0;
    this.ingestBytesTotal = 0;
  }

  setError(message: string): void {
    this.loadError = message;
    this.ingestState = message ? 'error' : 'idle';
  }

  setIngestReading(loaded: number, total: number): void {
    this.ingestState = 'reading';
    this.ingestBytesLoaded = loaded;
    this.ingestBytesTotal = total;
  }

  setIngestParsing(): void {
    this.ingestState = 'parsing';
  }

  reset(): void {
    this.loadedSbom = null;
    this.loadError = null;
    this.ingestState = 'idle';
    this.ingestBytesLoaded = 0;
    this.ingestBytesTotal = 0;
    this.query = '';
    this.licenseFilters = new Set();
    this.scopeFilters = new Set();
    this.typeFilters = new Set();
    this.categoryFilters = new Set();
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

  toggleCategory(value: LicenseCategory): void {
    this.categoryFilters = toggle(this.categoryFilters, value) as Set<LicenseCategory>;
  }

  clearCategory(): void {
    this.categoryFilters = new Set();
  }

  clearFilters(): void {
    this.query = '';
    this.licenseFilters = new Set();
    this.scopeFilters = new Set();
    this.typeFilters = new Set();
    this.categoryFilters = new Set();
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
    this.categoryFilters = new Set(f.categories);
  }

  syncToUrl(): void {
    if (typeof window === 'undefined') return;
    const qs = filtersToQueryString({
      query: this.query,
      licenses: this.licenseFilters,
      scopes: this.scopeFilters,
      types: this.typeFilters,
      categories: this.categoryFilters,
    });
    const next = `${window.location.pathname}${qs}${window.location.hash}`;
    if (next !== window.location.pathname + window.location.search + window.location.hash) {
      window.history.replaceState(null, '', next);
    }
  }
}

function toggle<T>(set: Set<T>, value: T): Set<T> {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

export const store = new SbomStore();
