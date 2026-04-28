<script lang="ts">
  import type { LicenseBreakdownEntry } from '../state/filters';
  import { store } from '../state/store.svelte';

  interface Props {
    breakdown: LicenseBreakdownEntry[];
    totalForScale: number;
  }

  let { breakdown, totalForScale }: Props = $props();

  function isActive(license: string): boolean {
    return store.licenseFilters.has(license);
  }

  function widthPercent(count: number): number {
    if (totalForScale <= 0) return 0;
    return Math.max(2, Math.round((count / totalForScale) * 100));
  }
</script>

{#if breakdown.length > 0}
  <section class="chart" aria-label="License breakdown">
    <h2 class="chart__heading">License breakdown</h2>
    <ul class="chart__list">
      {#each breakdown as entry (entry.license)}
        <li>
          <button
            type="button"
            class="bar"
            class:bar--active={isActive(entry.license)}
            onclick={() => store.toggleLicense(entry.license)}
            aria-pressed={isActive(entry.license)}
            title={entry.kind === 'expression'
              ? 'SPDX expression — counted as its own bucket'
              : entry.license}
          >
            <span class="bar__label">{entry.license}</span>
            <span class="bar__track" aria-hidden="true">
              <span
                class="bar__fill"
                style="width: {widthPercent(entry.count)}%"
              ></span>
            </span>
            <span class="bar__count">{entry.count}</span>
          </button>
        </li>
      {/each}
    </ul>
  </section>
{/if}

<style>
  .chart {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 1.5rem;
    background: white;
    border: 1px solid var(--color-ink-200);
    border-radius: 12px;
  }
  .chart__heading {
    margin: 0;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--color-ink-500);
  }
  .chart__list {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .bar {
    display: grid;
    grid-template-columns: minmax(8rem, 14rem) 1fr 3rem;
    align-items: center;
    gap: 0.75rem;
    width: 100%;
    padding: 0.375rem 0.5rem;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 6px;
    cursor: pointer;
    text-align: left;
    color: inherit;
    font: inherit;
    transition: background-color 80ms ease, border-color 80ms ease;
  }
  .bar:hover {
    background: var(--color-ink-50);
  }
  .bar--active {
    background: color-mix(in srgb, var(--color-accent-500) 8%, transparent);
    border-color: color-mix(in srgb, var(--color-accent-500) 35%, transparent);
  }
  .bar__label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: var(--font-mono);
    font-size: 0.875rem;
    color: var(--color-ink-700);
  }
  .bar__track {
    position: relative;
    height: 0.5rem;
    background: var(--color-ink-100);
    border-radius: 4px;
    overflow: hidden;
  }
  .bar__fill {
    position: absolute;
    inset-block: 0;
    inset-inline-start: 0;
    background: var(--color-accent-500);
    opacity: 0.85;
  }
  .bar--active .bar__fill {
    opacity: 1;
  }
  .bar__count {
    text-align: right;
    font-variant-numeric: tabular-nums;
    font-size: 0.875rem;
    color: var(--color-ink-600);
  }
</style>
