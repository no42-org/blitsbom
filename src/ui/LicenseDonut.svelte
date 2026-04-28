<script lang="ts">
  import type { CategoryBreakdownEntry } from '../state/filters';
  import { CATEGORY_METADATA } from '../license/classify';
  import { store } from '../state/store.svelte';

  interface Props {
    breakdown: CategoryBreakdownEntry[];
  }

  let { breakdown }: Props = $props();

  // Pin bar order to CATEGORY_METADATA so the chart stays stable as
  // filters change. Drop empty buckets so we don't render zero-width bars.
  const ordered = $derived(
    CATEGORY_METADATA.map((meta) => {
      const entry = breakdown.find((b) => b.category === meta.id);
      return { meta, count: entry?.count ?? 0 };
    }).filter((o) => o.count > 0),
  );

  const total = $derived(ordered.reduce((s, o) => s + o.count, 0));

  function isActive(id: string): boolean {
    return store.categoryFilters.has(id as never);
  }
  const anyActive = $derived(store.categoryFilters.size > 0);

  function fillFor(id: string, colorToken: string): string {
    if (!anyActive || isActive(id)) return `var(--${colorToken})`;
    return 'var(--color-ink-200)';
  }
</script>

{#if total > 0}
  <section class="chart" aria-label="License breakdown by category">
    <h2 class="chart__heading">
      Licenses by Category
      <span class="chart__total">{total.toLocaleString()}</span>
    </h2>
    <ul class="bars">
      {#each ordered as o (o.meta.id)}
        {@const pct = (o.count / total) * 100}
        <li>
          <button
            type="button"
            class="bar"
            class:bar--active={isActive(o.meta.id)}
            class:bar--dimmed={anyActive && !isActive(o.meta.id)}
            aria-pressed={isActive(o.meta.id)}
            aria-label={`${o.meta.label}: ${o.count} components (${pct.toFixed(1)}%)`}
            onclick={() => store.toggleCategory(o.meta.id)}
          >
            <span class="bar__label">{o.meta.label}</span>
            <span class="bar__track">
              <span
                class="bar__fill"
                style={`width: ${pct}%; background: ${fillFor(o.meta.id, o.meta.colorToken)};`}
              ></span>
            </span>
            <span class="bar__count">{o.count.toLocaleString()}</span>
            <span class="bar__pct">{pct.toFixed(1)}%</span>
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
    background: var(--color-surface);
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
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.5rem;
  }
  .chart__total {
    font-size: 0.875rem;
    color: var(--color-ink-700);
    font-variant-numeric: tabular-nums;
    font-weight: 500;
    letter-spacing: 0;
    text-transform: none;
  }
  .bars {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }
  .bar {
    appearance: none;
    border: 1px solid transparent;
    background: transparent;
    color: inherit;
    font: inherit;
    cursor: pointer;
    width: 100%;
    padding: 0.375rem 0.5rem;
    border-radius: 6px;
    display: grid;
    grid-template-columns: 9rem 1fr 4rem 4rem;
    align-items: center;
    gap: 0.625rem;
    text-align: left;
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
    font-size: 0.875rem;
    color: var(--color-ink-800);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .bar--dimmed .bar__label,
  .bar--dimmed .bar__count,
  .bar--dimmed .bar__pct {
    color: var(--color-ink-400);
  }
  .bar__track {
    height: 0.625rem;
    background: var(--color-ink-100);
    border-radius: 999px;
    overflow: hidden;
  }
  .bar__fill {
    display: block;
    height: 100%;
    border-radius: 999px;
    transition: width 120ms ease, background-color 120ms ease;
    min-width: 2px;
  }
  .bar__count {
    font-variant-numeric: tabular-nums;
    font-size: 0.875rem;
    color: var(--color-ink-700);
    text-align: right;
  }
  .bar__pct {
    font-variant-numeric: tabular-nums;
    font-size: 0.8125rem;
    color: var(--color-ink-500);
    text-align: right;
  }
  @media (max-width: 640px) {
    .bar {
      grid-template-columns: 1fr 3.5rem 3.5rem;
    }
    .bar__label {
      grid-column: 1 / -1;
    }
    .bar__track {
      grid-column: 1 / -1;
    }
  }
</style>
