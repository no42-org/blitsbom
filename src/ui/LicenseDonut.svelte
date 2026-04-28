<script lang="ts">
  import type { CategoryBreakdownEntry } from '../state/filters';
  import { CATEGORY_METADATA } from '../license/classify';
  import { store } from '../state/store.svelte';
  import { computeArcs, type DonutGeometry } from './donut-arc';

  interface Props {
    breakdown: CategoryBreakdownEntry[];
  }

  let { breakdown }: Props = $props();

  const geom: DonutGeometry = { cx: 60, cy: 60, r: 50, rInner: 32 };

  // Index entries in metadata order so the donut + legend ordering is stable
  // across re-renders (segments don't shuffle as filters change).
  const ordered = $derived(
    CATEGORY_METADATA.map((meta) => {
      const entry = breakdown.find((b) => b.category === meta.id);
      return { meta, count: entry?.count ?? 0 };
    }),
  );

  const arcs = $derived(
    computeArcs(
      ordered.map((o) => ({ count: o.count })),
      geom,
    ),
  );

  const total = $derived(ordered.reduce((s, o) => s + o.count, 0));

  // Legend entries: only non-empty categories, sorted descending by count.
  const legendEntries = $derived(
    ordered
      .filter((o) => o.count > 0)
      .sort((a, b) => {
        if (b.count !== a.count) return b.count - a.count;
        return a.meta.order - b.meta.order;
      }),
  );

  function isActive(id: string): boolean {
    return store.categoryFilters.has(id as never);
  }
</script>

{#if total > 0}
  <section class="donut" aria-label="License breakdown by category">
    <h2 class="donut__heading">License breakdown</h2>
    <div class="donut__layout">
      <svg
        class="donut__svg"
        viewBox="0 0 120 120"
        role="img"
        aria-label="License category breakdown"
      >
        {#each arcs as arc (arc.index)}
          {@const meta = ordered[arc.index]?.meta}
          {#if meta}
            <path
              d={arc.d}
              fill={`var(--${meta.colorToken})`}
              class="donut__segment"
              class:donut__segment--active={isActive(meta.id)}
              role="button"
              tabindex="0"
              aria-pressed={isActive(meta.id)}
              aria-label={`${meta.label}: ${ordered[arc.index]!.count} components`}
              onclick={() => store.toggleCategory(meta.id)}
              onkeydown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  store.toggleCategory(meta.id);
                }
              }}
            />
          {/if}
        {/each}
        <text
          x="60"
          y="58"
          text-anchor="middle"
          class="donut__center-count"
        >{total}</text>
        <text
          x="60"
          y="72"
          text-anchor="middle"
          class="donut__center-label"
        >components</text>
      </svg>

      <ul class="legend">
        {#each legendEntries as entry (entry.meta.id)}
          <li>
            <button
              type="button"
              class="legend__row"
              class:legend__row--active={isActive(entry.meta.id)}
              onclick={() => store.toggleCategory(entry.meta.id)}
              aria-pressed={isActive(entry.meta.id)}
            >
              <span
                class="legend__swatch"
                style={`background: var(--${entry.meta.colorToken});`}
                aria-hidden="true"
              ></span>
              <span class="legend__label">{entry.meta.label}</span>
              <span class="legend__count">{entry.count}</span>
            </button>
          </li>
        {/each}
      </ul>
    </div>
  </section>
{/if}

<style>
  .donut {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 1.5rem;
    background: white;
    border: 1px solid var(--color-ink-200);
    border-radius: 12px;
  }
  .donut__heading {
    margin: 0;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--color-ink-500);
  }
  .donut__layout {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 2rem;
    align-items: center;
  }
  .donut__svg {
    width: 12rem;
    height: 12rem;
  }
  .donut__segment {
    cursor: pointer;
    transition: transform 80ms ease, opacity 80ms ease;
    transform-origin: 60px 60px;
  }
  .donut__segment:hover {
    opacity: 0.85;
  }
  .donut__segment--active {
    /* Slight outward bump signals the active segment. */
    transform: scale(1.03);
  }
  .donut__center-count {
    font-size: 1.25rem;
    font-weight: 600;
    fill: var(--color-ink-900);
    font-variant-numeric: tabular-nums;
  }
  .donut__center-label {
    font-size: 0.625rem;
    fill: var(--color-ink-500);
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .legend {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .legend__row {
    display: grid;
    grid-template-columns: 1rem 1fr auto;
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
    transition: background-color 80ms ease, border-color 80ms ease;
  }
  .legend__row:hover {
    background: var(--color-ink-50);
  }
  .legend__row--active {
    background: color-mix(in srgb, var(--color-accent-500) 8%, transparent);
    border-color: color-mix(in srgb, var(--color-accent-500) 35%, transparent);
  }
  .legend__swatch {
    width: 0.875rem;
    height: 0.875rem;
    border-radius: 3px;
    border: 1px solid color-mix(in srgb, var(--color-ink-900) 20%, transparent);
  }
  .legend__label {
    font-size: 0.875rem;
    color: var(--color-ink-700);
  }
  .legend__count {
    text-align: right;
    font-variant-numeric: tabular-nums;
    font-size: 0.875rem;
    color: var(--color-ink-600);
  }

  @media (max-width: 640px) {
    .donut__layout {
      grid-template-columns: 1fr;
      justify-items: center;
    }
    .legend {
      width: 100%;
    }
  }
</style>
