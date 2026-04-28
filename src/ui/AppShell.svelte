<script lang="ts">
  import { onMount } from 'svelte';
  import { store } from '../state/store.svelte';
  import DropZone from './DropZone.svelte';
  import SummaryHeader from './SummaryHeader.svelte';
  import LicenseDonut from './LicenseDonut.svelte';
  import LicenseDrilldown from './LicenseDrilldown.svelte';
  import SearchBar from './SearchBar.svelte';
  import FilterChips from './FilterChips.svelte';
  import ComponentsTable from './ComponentsTable.svelte';
  import ErrorBanner from './ErrorBanner.svelte';
  import Toolbar from './Toolbar.svelte';

  onMount(() => {
    store.hydrateFromUrl();
  });

  $effect(() => {
    // Touch every filter slice so this effect re-runs on change.
    store.query;
    store.licenseFilters;
    store.scopeFilters;
    store.typeFilters;
    store.categoryFilters;
    store.syncToUrl();
  });
</script>

<div class="page">
  <header class="page__masthead">
    <div class="brand">
      <span class="brand__name">blitsbom</span>
      <span class="brand__tag">CycloneDX SBOM viewer</span>
    </div>
    <p class="page__privacy">
      Everything stays in your browser — no upload, no telemetry.
    </p>
  </header>

  <main class="page__main">
    {#if store.loadError}
      <ErrorBanner message={store.loadError} />
    {/if}

    {#if !store.loadedSbom}
      <DropZone />
    {:else}
      {@const sbom = store.loadedSbom}
      <SummaryHeader
        sbom={sbom}
        componentCount={store.filteredComponents.length}
        licenseCount={store.licenseBreakdown.length}
        typeCount={store.availableTypes.length}
        vulnCount={sbom.metadata.vulnerabilityCount}
      />

      <LicenseDonut breakdown={store.categoryBreakdownAll} />

      <LicenseDrilldown />

      <section class="controls">
        <div class="controls__row">
          <SearchBar />
          <Toolbar />
        </div>
        <FilterChips />
      </section>

      <ComponentsTable components={store.filteredComponents} />
    {/if}
  </main>

  <footer class="page__footer">
    <span>blitsbom · runs entirely in your browser</span>
    <span class="page__credit">
      Made with ❤️ for Open Source in Europe ·
      <a
        href="https://blog.no42.org/page/about/"
        target="_blank"
        rel="noopener noreferrer">About Me</a>
    </span>
  </footer>
</div>

<style>
  .page {
    max-width: 80rem;
    margin: 0 auto;
    padding: 2rem 1.5rem 3rem;
    display: grid;
    gap: 1.5rem;
  }
  .page__masthead {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.5rem;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid var(--color-ink-200);
  }
  .brand {
    display: inline-flex;
    align-items: baseline;
    gap: 0.625rem;
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
  .page__credit a {
    color: var(--color-accent-600);
    text-decoration: none;
  }
  .page__credit a:hover {
    text-decoration: underline;
  }
</style>
