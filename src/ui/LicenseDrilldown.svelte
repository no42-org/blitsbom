<script lang="ts">
  import { untrack } from 'svelte';
  import { store } from '../state/store.svelte';
  import { CATEGORY_METADATA } from '../license/classify';
  import type { LicenseCategory } from '../types';

  const activeCategory = $derived<LicenseCategory | null>(
    store.categoryFilters.size === 1 ? [...store.categoryFilters][0]! : null,
  );

  const meta = $derived(
    activeCategory
      ? CATEGORY_METADATA.find((c) => c.id === activeCategory) ?? null
      : null,
  );

  // PERF: same pattern as ComponentsTable — $state.raw populated via
  // $effect avoids Svelte 5 proxying iterated array elements. The
  // untrack(...) wraps the spread copy so iterating the source $derived
  // doesn't register per-element dependencies on the proxy.
  let licenses = $state.raw<{ license: string; count: number; kind: string }[]>([]);
  $effect(() => {
    const src = store.drilldownLicenses;
    licenses = src ? untrack(() => [...src]) : [];
  });
</script>

{#if activeCategory && meta}
  <section class="drilldown" aria-label={`Licenses in ${meta.label}`}>
    <header class="drilldown__header">
      <span
        class="drilldown__swatch"
        style={`background: var(--${meta.colorToken});`}
        aria-hidden="true"
      ></span>
      <h3 class="drilldown__title">
        {meta.label} <span class="drilldown__count">({licenses.length} {licenses.length === 1 ? 'license' : 'licenses'})</span>
      </h3>
      <button
        type="button"
        class="drilldown__back"
        onclick={() => store.clearCategory()}
      >← All categories</button>
    </header>

    {#if licenses.length === 0}
      <p class="drilldown__empty">No licenses in this category.</p>
    {:else}
      <ul class="drilldown__list">
        {#each licenses as entry (entry.license)}
          <li>
            <button
              type="button"
              class="license-row"
              class:license-row--active={store.licenseFilters.has(entry.license)}
              onclick={() => store.toggleLicense(entry.license)}
              aria-pressed={store.licenseFilters.has(entry.license)}
            >
              <span class="license-row__name">{entry.license}</span>
              <span class="license-row__count">{entry.count}</span>
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  </section>
{/if}

<style>
  .drilldown {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 1.25rem 1.5rem;
    background: white;
    border: 1px solid var(--color-ink-200);
    border-radius: 12px;
  }
  .drilldown__header {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    flex-wrap: wrap;
  }
  .drilldown__swatch {
    width: 0.875rem;
    height: 0.875rem;
    border-radius: 3px;
    border: 1px solid color-mix(in srgb, var(--color-ink-900) 20%, transparent);
  }
  .drilldown__title {
    margin: 0;
    font-size: 0.9375rem;
    font-weight: 600;
    color: var(--color-ink-800);
    flex: 1;
  }
  .drilldown__count {
    font-weight: 400;
    color: var(--color-ink-500);
    font-size: 0.875rem;
  }
  .drilldown__back {
    appearance: none;
    border: 0;
    background: transparent;
    padding: 0.25rem 0.5rem;
    font-size: 0.8125rem;
    color: var(--color-accent-600);
    cursor: pointer;
  }
  .drilldown__back:hover {
    text-decoration: underline;
  }
  .drilldown__empty {
    margin: 0;
    color: var(--color-ink-500);
    font-size: 0.875rem;
  }
  .drilldown__list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(14rem, 1fr));
    gap: 0.25rem 0.75rem;
  }
  .license-row {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 0.625rem;
    align-items: center;
    width: 100%;
    padding: 0.375rem 0.5rem;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 6px;
    cursor: pointer;
    text-align: left;
    color: inherit;
    font: inherit;
    transition: background-color 80ms ease;
  }
  .license-row:hover {
    background: var(--color-ink-50);
  }
  .license-row--active {
    background: color-mix(in srgb, var(--color-accent-500) 10%, transparent);
    border-color: color-mix(in srgb, var(--color-accent-500) 30%, transparent);
  }
  .license-row__name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: var(--font-mono);
    font-size: 0.8125rem;
    color: var(--color-ink-700);
  }
  .license-row__count {
    text-align: right;
    font-variant-numeric: tabular-nums;
    font-size: 0.8125rem;
    color: var(--color-ink-600);
  }
</style>
