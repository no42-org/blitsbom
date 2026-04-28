import type {
  Component,
  LoadedSbom,
  LicenseCategory,
  Severity,
} from '../types';
import {
  applyFilters,
  computeCategoryBreakdown,
  computeLicenseBreakdown,
  computeOriginatorBreakdown,
  computeVulnsBySeverityBreakdown,
  distinctScopes,
  distinctTypes,
  licensesInCategory,
  topOriginatorIds,
} from './filters';
import { isLive } from '../parse/vex';
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
  originatorFilters = $state<Set<string>>(new Set());
  severityFilters = $state<Set<Severity>>(new Set());
  /** When true, suppressed VEX entries (status `not_affected` etc.)
   * are included in counts, badges, and severity filtering. */
  showSuppressed = $state(false);
  /** Component currently expanded in the vulnerability drilldown panel,
   * or null when no row is expanded. Tracked by purl/bomRef/name fallback
   * so a re-merge that creates fresh component objects keeps the panel
   * pointing at the right component. */
  vexDrilldownKey = $state<string | null>(null);
  /** When set, the drilldown is scoped to a single severity (the user
   * clicked the Crit/High/Med/Low cell rather than the row generally).
   * Null = show all visible vulnerabilities for the row. */
  vexDrilldownSeverity = $state<Severity | null>(null);

  // Plain getter, NOT $derived. Reads the raw $state.raw loadedSbom and
  // returns its components array directly. Using $derived here was making
  // the array participate in Svelte's reactive proxy machinery in ways
  // that compounded with downstream iteration. Plain getter side-steps it.
  get components(): Component[] {
    return this.loadedSbom?.components ?? EMPTY_COMPONENTS;
  }

  // Top-N (named) originator slice — needed both to render the donut and
  // to resolve the synthetic "Other" filter token in applyFilters.
  originatorBreakdownAll = $derived(
    computeOriginatorBreakdown(this.components),
  );
  topOriginatorIdSet = $derived(topOriginatorIds(this.originatorBreakdownAll));

  /** Vulnerabilities (live or suppressed per `showSuppressed`) bucketed by
   * severity. Only meaningful when a VEX is loaded. */
  vulnsBySeverityBreakdownAll = $derived(
    computeVulnsBySeverityBreakdown(this.components, this.showSuppressed),
  );

  filteredComponents = $derived(
    applyFilters(
      this.components,
      {
        query: this.query,
        licenses: this.licenseFilters,
        scopes: this.scopeFilters,
        types: this.typeFilters,
        categories: this.categoryFilters,
        originators: this.originatorFilters,
        severities: this.severityFilters,
      },
      this.topOriginatorIdSet,
      this.showSuppressed,
    ),
  );

  /** True when a VEX file has been merged into the loaded SBOM. */
  get hasVex(): boolean {
    return this.loadedSbom?.vexMetadata != null;
  }

  /** Counts derived from the merged components. `live` honors VEX status
   * suppression unless `showSuppressed` is on. */
  liveVulnCount = $derived.by(() => {
    let n = 0;
    for (const c of this.components) {
      for (const v of c.vulnerabilities) {
        if (this.showSuppressed || isLive(v)) n += 1;
      }
    }
    return n;
  });
  suppressedVulnCount = $derived.by(() => {
    return this.loadedSbom?.vexMetadata?.suppressedByStatus ?? 0;
  });
  unmatchedVulnCount = $derived.by(() => {
    return this.loadedSbom?.vexMetadata?.unmatched ?? 0;
  });

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

  // Distinct non-null originators across all loaded components — drives
  // the "Originators" stat in the summary header. We count uniques rather
  // than the donut's top-N + Other since the long tail still has identity.
  distinctOriginatorCount = $derived.by(() => {
    const set = new Set<string>();
    for (const c of this.components) {
      if (c.originator !== null) set.add(c.originator);
    }
    return set.size;
  });

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
    this.originatorFilters = new Set();
    this.severityFilters = new Set();
    this.showSuppressed = false;
    this.vexDrilldownKey = null;
    this.vexDrilldownSeverity = null;
  }

  /** Replace the loaded SBOM with a VEX-merged version. The merged
   * LoadedSbom carries a `vexMetadata` block; the rest of the store
   * keeps its filter state intact. */
  applyVex(merged: LoadedSbom): void {
    this.loadedSbom = merged;
  }

  /** Drop any loaded VEX while keeping the SBOM. Restores components
   * to their VEX-free state by zeroing each component's vulnerabilities
   * array — cheaper than re-parsing, and the original raw vulnerabilities
   * are not retained anyway. */
  clearVex(): void {
    if (!this.loadedSbom) return;
    const components = this.loadedSbom.components.map((c) => ({
      ...c,
      vulnerabilities: [],
    }));
    this.loadedSbom = {
      metadata: this.loadedSbom.metadata,
      components,
    };
    this.severityFilters = new Set();
    this.showSuppressed = false;
    this.syncToUrl();
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

  toggleOriginator(value: string): void {
    this.originatorFilters = toggle(this.originatorFilters, value);
    this.syncToUrl();
  }

  clearOriginator(): void {
    this.originatorFilters = new Set();
    this.syncToUrl();
  }

  toggleSeverity(value: Severity): void {
    this.severityFilters = toggle(this.severityFilters, value) as Set<Severity>;
    this.syncToUrl();
  }

  clearSeverity(): void {
    this.severityFilters = new Set();
    this.syncToUrl();
  }

  toggleSuppressed(): void {
    this.showSuppressed = !this.showSuppressed;
  }

  /** Compose a stable key for a component the user opened in the vuln
   * drilldown. Falls back through purlCanonical → bomRef → name+version. */
  static componentKey(c: Component): string {
    if (c.purlCanonical) return `purl:${c.purlCanonical}`;
    if (c.bomRef) return `bomref:${c.bomRef}`;
    return `nv:${c.name}@${c.version ?? ''}`;
  }
  /** Open / close / re-scope the per-row vulnerability drilldown.
   *
   * - No `severity` arg → toggle the row in "all severities" mode.
   * - With `severity` arg → toggle the row in "this severity only" mode.
   * - Clicking the same row at a DIFFERENT severity column re-scopes the
   *   open drilldown instead of closing it (so users can flip between
   *   Crit / High / Med / Low quickly).
   */
  toggleVexDrilldown(c: Component, severity?: Severity): void {
    const key = SbomStore.componentKey(c);
    const sev = severity ?? null;
    if (this.vexDrilldownKey === key && this.vexDrilldownSeverity === sev) {
      // Same row + same scope → close.
      this.vexDrilldownKey = null;
      this.vexDrilldownSeverity = null;
    } else {
      this.vexDrilldownKey = key;
      this.vexDrilldownSeverity = sev;
    }
  }
  closeVexDrilldown(): void {
    this.vexDrilldownKey = null;
    this.vexDrilldownSeverity = null;
  }
  /** Component instance corresponding to the currently-expanded drilldown
   * key, looked up from the live merged component list. Null when none. */
  get vexDrilldownComponent(): Component | null {
    if (!this.vexDrilldownKey) return null;
    for (const c of this.components) {
      if (SbomStore.componentKey(c) === this.vexDrilldownKey) return c;
    }
    return null;
  }

  clearFilters(): void {
    this.query = '';
    this.licenseFilters = new Set();
    this.scopeFilters = new Set();
    this.typeFilters = new Set();
    this.categoryFilters = new Set();
    this.originatorFilters = new Set();
    this.severityFilters = new Set();
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
    this.originatorFilters = new Set(f.originators);
    this.severityFilters = new Set(f.severities);
  }

  syncToUrl(): void {
    if (typeof window === 'undefined') return;
    const qs = filtersToQueryString({
      query: this.query,
      licenses: this.licenseFilters,
      scopes: this.scopeFilters,
      types: this.typeFilters,
      categories: this.categoryFilters,
      originators: this.originatorFilters,
      severities: this.severityFilters,
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
