<script lang="ts">
  import type { OriginatorBreakdownEntry } from '../state/filters';
  import { store } from '../state/store.svelte';

  interface Props {
    breakdown: OriginatorBreakdownEntry[];
    heading?: string;
    ariaLabel?: string;
  }

  let {
    breakdown,
    heading = 'Licenses by Originator',
    ariaLabel,
  }: Props = $props();

  // Cycling palette for the top-N "named" originators. Synthetic buckets
  // ("Other", "Unknown") use dedicated tokens so they read as neutral.
  const PALETTE_TOKENS = [
    'color-originator-1',
    'color-originator-2',
    'color-originator-3',
    'color-originator-4',
    'color-originator-5',
    'color-originator-6',
    'color-originator-7',
    'color-originator-8',
  ];

  // Map each named originator to its rank among NAMED entries so palette
  // colors stay stable when "Other" / "Unknown" shift position.
  const namedRank = $derived.by<Map<string, number>>(() => {
    const m = new Map<string, number>();
    let i = 0;
    for (const e of breakdown) {
      if (!e.synthetic) m.set(e.id, i++);
    }
    return m;
  });

  function colorTokenFor(entry: OriginatorBreakdownEntry): string {
    if (entry.id === '__originator_other__') return 'color-originator-other';
    if (entry.id === '__originator_unknown__') return 'color-originator-unknown';
    const rank = namedRank.get(entry.id) ?? 0;
    return PALETTE_TOKENS[rank % PALETTE_TOKENS.length]!;
  }

  const total = $derived(breakdown.reduce((s, b) => s + b.count, 0));

  function isActive(id: string): boolean {
    return store.originatorFilters.has(id);
  }
  const anyActive = $derived(store.originatorFilters.size > 0);

  function fillFor(entry: OriginatorBreakdownEntry): string {
    const token = colorTokenFor(entry);
    if (!anyActive || isActive(entry.id)) return `var(--${token})`;
    return 'var(--color-ink-200)';
  }
</script>

{#if total > 0}
  <section class="chart" aria-label={ariaLabel ?? heading}>
    <h2 class="chart__heading">
      {heading}
      <span class="chart__total">{total.toLocaleString()}</span>
    </h2>
    <ul class="bars">
      {#each breakdown as entry (entry.id)}
        {@const pct = (entry.count / total) * 100}
        <li>
          <button
            type="button"
            class="bar"
            class:bar--active={isActive(entry.id)}
            class:bar--dimmed={anyActive && !isActive(entry.id)}
            aria-pressed={isActive(entry.id)}
            aria-label={`${entry.label}: ${entry.count} components (${pct.toFixed(1)}%)`}
            title={entry.label}
            onclick={() => store.toggleOriginator(entry.id)}
          >
            <span class="bar__label">{entry.label}</span>
            <span class="bar__track">
              <span
                class="bar__fill"
                style={`width: ${pct}%; background: ${fillFor(entry)};`}
              ></span>
            </span>
            <span class="bar__count">{entry.count.toLocaleString()}</span>
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
    /* Originator names can be many and long — cap height with scroll
       rather than stretching the card vertically. */
    max-height: 22rem;
    overflow-y: auto;
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
    grid-template-columns: 12rem 1fr 4rem 4rem;
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
    min-width: 0;
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
