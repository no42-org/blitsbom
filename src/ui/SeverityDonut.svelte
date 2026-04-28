<script lang="ts">
  import type { SeverityBreakdownEntry } from '../state/filters';
  import { store } from '../state/store.svelte';
  import type { Severity } from '../types';

  interface Props {
    breakdown: SeverityBreakdownEntry[];
  }

  let { breakdown }: Props = $props();

  const COLOR_TOKEN: Record<Severity, string> = {
    critical: 'color-severity-critical',
    high: 'color-severity-high',
    medium: 'color-severity-medium',
    low: 'color-severity-low',
    unknown: 'color-severity-unknown',
    none: 'color-severity-none',
  };

  const total = $derived(breakdown.reduce((s, b) => s + b.count, 0));

  function isActive(s: Severity): boolean {
    return store.severityFilters.has(s);
  }
  const anyActive = $derived(store.severityFilters.size > 0);

  function fillFor(entry: SeverityBreakdownEntry): string {
    const token = COLOR_TOKEN[entry.severity];
    if (!anyActive || isActive(entry.severity)) return `var(--${token})`;
    return 'var(--color-ink-200)';
  }
</script>

{#if total > 0}
  <section class="chart" aria-label="Vulnerability breakdown by severity">
    <h2 class="chart__heading">
      Vulnerabilities by Severity
      <span class="chart__total">{total.toLocaleString()}</span>
    </h2>
    <ul class="bars">
      {#each breakdown as entry (entry.severity)}
        {@const pct = (entry.count / total) * 100}
        <li>
          <button
            type="button"
            class="bar"
            class:bar--active={isActive(entry.severity)}
            class:bar--dimmed={anyActive && !isActive(entry.severity)}
            aria-pressed={isActive(entry.severity)}
            aria-label={`${entry.label}: ${entry.count} vulnerabilities (${pct.toFixed(1)}%)`}
            onclick={() => store.toggleSeverity(entry.severity)}
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
    grid-template-columns: 6rem 1fr 4rem 4rem;
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
