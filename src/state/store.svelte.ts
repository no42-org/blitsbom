import type { Component, LoadedSbom, LicenseCategory } from '../types';
import {
  applyFilters,
  computeCategoryBreakdown,
  computeLicenseBreakdown,
  distinctScopes,
  distinctTypes,
  licensesInCategory,
} from './filters';
import { filtersToQueryString, searchParamsToFilters } from './url';

const EMPTY_COMPONENTS: Component[] = [];

export type IngestState = 'idle' | 'reading' | 'parsing' | 'error';

class SbomStore {
  // $state.raw — the loaded SBOM is read-only after ingest. Without `.raw`
  // Svelte 5 deep-proxies every Component / License object lazily on each
  // read, which compounds across the derived chain (components, filtered,
  // breakdown, drilldown) and freezes the browser for SBOMs with thousands
  // of packages. Raw skips the proxy machinery entirely.
  loadedSbom = $state.raw<LoadedSbom | null>(null);
  loadError = $state<string | null>(null);

  ingestState = $state<IngestState>('idle');
  ingestBytesLoaded = $state(0);
  ingestBytesTotal = $state(0);

  query = $state('');
  licenseFilters = $state<Set<string>>(new Set());
  scopeFilters = $state<Set<string>>(new Set());
  typeFilters = $state<Set<string>>(new Set());
  categoryFilters = $state<Set<LicenseCategory>>(new Set());

  // Plain getter, NOT $derived. Reads the raw $state.raw loadedSbom and
  // returns its components array directly. Using $derived here was making
  // the array participate in Svelte's reactive proxy machinery in ways
  // that compounded with downstream iteration. Plain getter side-steps it.
  get components(): Component[] {
    return this.loadedSbom?.components ?? EMPTY_COMPONENTS;
  }

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
    this.syncToUrl();
  }

  toggleScope(value: string): void {
    this.scopeFilters = toggle(this.scopeFilters, value);
    this.syncToUrl();
  }

  toggleType(value: string): void {
    this.typeFilters = toggle(this.typeFilters, value);
    this.syncToUrl();
  }

  toggleCategory(value: LicenseCategory): void {
    this.categoryFilters = toggle(this.categoryFilters, value) as Set<LicenseCategory>;
    this.syncToUrl();
  }

  clearCategory(): void {
    this.categoryFilters = new Set();
    this.syncToUrl();
  }

  clearFilters(): void {
    this.query = '';
    this.licenseFilters = new Set();
    this.scopeFilters = new Set();
    this.typeFilters = new Set();
    this.categoryFilters = new Set();
    this.syncToUrl();
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
