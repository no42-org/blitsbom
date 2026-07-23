<script lang="ts">
  import { onMount } from 'svelte';
  import { store } from '../state/store.svelte';
  import DropZone from './DropZone.svelte';
  import SummaryHeader from './SummaryHeader.svelte';
  import LicenseDonut from './LicenseDonut.svelte';
  import OriginatorDonut from './OriginatorDonut.svelte';
  import SeverityDonut from './SeverityDonut.svelte';
  import LicenseDrilldown from './LicenseDrilldown.svelte';
  import SearchBar from './SearchBar.svelte';
  import FilterChips from './FilterChips.svelte';
  import SeverityFilter from './SeverityFilter.svelte';
  import ComponentsTable from './ComponentsTable.svelte';
  import ErrorBanner from './ErrorBanner.svelte';
  import Toolbar from './Toolbar.svelte';
  import ThemeToggle from './ThemeToggle.svelte';
  import ReportProvenanceHeader from './ReportProvenanceHeader.svelte';
  import logoUrl from '../../assets/logo.svg';
  import { parseSbomText, parseAsVex } from '../parse/load';
  import { hasEmbeddedPayload, readEmbeddedPayload } from '../parse/payload';

  onMount(() => {
    void hydrate();
  });

  // A CI-generated report embeds its SBOM as a payload; hydrate from it when
  // present, otherwise fall through to the normal drop-zone flow. On any
  // decode/parse failure we stay out of report mode and surface the error so
  // the drop zone remains usable — a broken payload degrades to a working
  // viewer rather than a blank page.
  async function hydrate() {
    if (!hasEmbeddedPayload()) {
      store.hydrateFromUrl();
      return;
    }
    store.beginReportHydration();
    // Yield so the loading state paints before the synchronous parse of a
    // multi-megabyte payload blocks the main thread. Mirrors load.ts.
    await new Promise((resolve) => setTimeout(() => resolve(null), 0));
    const payload = await readEmbeddedPayload();
    if (payload.kind === 'ok') {
      const result = parseSbomText(payload.sbomText);
      if (result.ok) {
        let sbom = result.sbom;
        // A report may embed a VEX alongside the SBOM; merge it exactly as
        // the drop-SBOM-then-drop-VEX flow would, keeping the embedded SBOM
        // itself byte-identical to the downloadable source. The generator
        // already validated this same merge, so a failure here means the file
        // was corrupted after generation — surface it rather than silently
        // rendering a report that claims a VEX it never applied.
        let vexError: string | null = null;
        if (payload.vexText) {
          const vexResult = parseAsVex(payload.vexText, sbom, 'embedded-vex');
          if (vexResult.kind === 'vex') sbom = vexResult.sbom;
          else vexError = `Embedded VEX could not be applied: ${vexResult.error}`;
        }
        store.setLoaded(sbom);
        store.enterReportMode(payload.provenance, payload.sbomText);
        if (vexError) store.setError(vexError);
      } else {
        store.setError(result.error);
      }
    } else if (payload.kind === 'error') {
      store.setError(payload.error);
    }
    store.endReportHydration();
    store.hydrateFromUrl();
  }

  // URL state syncs directly from each store mutation method. The query
  // input also calls store.syncToUrl on change. We don't use a
  // $effect here because it fires AFTER the reactive cascade triggered
  // by the same state change — for large SBOMs, that means the URL update
  // gets queued behind a slow table render.
</script>

<div class="page">
  <header class="page__masthead">
    <div class="brand">
      <img src={logoUrl} alt="" class="brand__logo" aria-hidden="true" />
      <span class="brand__name">blitsbom</span>
      <span class="brand__tag">Pixelperfect SBOM analytics</span>
    </div>
    <div class="page__masthead-right">
      <p class="page__privacy">
        Everything stays in your browser — no upload, no telemetry, no tracking.
      </p>
      <ThemeToggle />
    </div>
  </header>

  <main class="page__main">
    {#if store.loadError}
      <ErrorBanner message={store.loadError} />
    {/if}

    {#if !store.loadedSbom}
      {#if store.reportHydrating}
        <div class="report-loading" role="status" aria-live="polite">
          <span class="report-loading__spinner" aria-hidden="true"></span>
          Loading report…
        </div>
      {:else}
        <DropZone />
      {/if}
    {:else}
      {@const sbom = store.loadedSbom}
      {#if store.reportMode}
        <ReportProvenanceHeader />
      {/if}
      <SummaryHeader
        sbom={sbom}
        componentCount={store.filteredComponents.length}
        licenseCount={store.licenseBreakdown.length}
        typeCount={store.availableTypes.length}
        originatorCount={store.distinctOriginatorCount}
      />
      <div class="donut-row" class:donut-row--three={store.hasVex}>
        <LicenseDonut breakdown={store.categoryBreakdownAll} />
        <OriginatorDonut breakdown={store.originatorBreakdownAll} />
        {#if store.hasVex}
          <SeverityDonut breakdown={store.vulnsBySeverityBreakdownAll} />
        {/if}
      </div>
      <LicenseDrilldown />

      <section class="controls">
        <div class="controls__row">
          <SearchBar />
          <Toolbar />
        </div>
        <SeverityFilter />
        <FilterChips />
      </section>

      <ComponentsTable components={store.filteredComponents} />
    {/if}
  </main>

  <footer class="page__footer">
    <span>
      <a
        href="https://github.com/no42-org/blitsbom"
        title={`v${__APP_VERSION__}`}
        target="_blank"
        rel="noopener noreferrer">blitsbom</a> · runs entirely in your browser
    </span>
    <span class="page__credit">
      Made with AI and ❤️ for Open Source in Europe
      <!-- Imprint / Privacy are site-relative and would 404 next to a
           standalone report file, so they are omitted in report mode. -->
      {#if !store.reportMode}
        · <a href="/imprint.html">Imprint</a> ·
        <a href="/privacy.html">Privacy</a>
      {/if}
    </span>
  </footer>
</div>

<style>
  .page {
    max-width: 110rem;
    margin: 0 auto;
    padding: 2rem 1.5rem 3rem;
    display: grid;
    gap: 1.5rem;
  }
  .donut-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1.5rem;
    align-items: stretch;
  }
  .donut-row--three {
    grid-template-columns: 1fr 1fr 1fr;
  }
  .donut-row > :global(*) {
    min-width: 0;
  }
  @media (max-width: 1500px) {
    .donut-row--three {
      grid-template-columns: 1fr 1fr;
    }
  }
  @media (max-width: 1100px) {
    .donut-row,
    .donut-row--three {
      grid-template-columns: 1fr;
    }
  }
  .page__masthead {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem 1rem;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid var(--color-ink-200);
  }
  .page__masthead-right {
    display: inline-flex;
    align-items: center;
    gap: 1rem;
    flex-wrap: wrap;
    justify-content: flex-end;
  }
  .brand {
    display: inline-flex;
    align-items: center;
    gap: 0.625rem;
  }
  .brand__logo {
    width: 1.75rem;
    height: 1.75rem;
    display: block;
    flex-shrink: 0;
  }
  .brand__name {
    font-size: 1.25rem;
    font-weight: 700;
    letter-spacing: -0.01em;
    color: var(--color-ink-900);
  }
  .brand__tag {
    font-size: 0.875rem;
    color: var(--color-ink-500);
  }
  .page__privacy {
    margin: 0;
    font-size: 0.8125rem;
    color: var(--color-ink-500);
  }
  .page__main {
    display: grid;
    gap: 1.5rem;
  }
  .report-loading {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    padding: 4rem 2rem;
    color: var(--color-ink-500);
    font-size: 0.95rem;
  }
  .report-loading__spinner {
    width: 1rem;
    height: 1rem;
    border: 2px solid var(--color-ink-200);
    border-top-color: var(--color-accent-500);
    border-radius: 50%;
    animation: report-loading-spin 0.7s linear infinite;
  }
  @keyframes report-loading-spin {
    to {
      transform: rotate(360deg);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .report-loading__spinner {
      animation: none;
    }
  }
  .controls {
    display: grid;
    gap: 0.75rem;
  }
  .controls__row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    align-items: center;
    justify-content: space-between;
  }
  .page__footer {
    margin-top: 1rem;
    padding-top: 1rem;
    border-top: 1px solid var(--color-ink-200);
    font-size: 0.8125rem;
    color: var(--color-ink-500);
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem 1.5rem;
    justify-content: space-between;
  }
  .page__footer a {
    color: var(--color-accent-600);
    text-decoration: none;
  }
  .page__footer a:hover {
    text-decoration: underline;
  }
</style>
