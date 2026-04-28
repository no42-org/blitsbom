<script lang="ts">
  import { store } from '../state/store.svelte';
  import type { Severity } from '../types';

  // Display order: most severe → least, with `none` at the end as a
  // pseudo-severity meaning "no live vulnerabilities".
  const ORDER: readonly Severity[] = [
    'critical',
    'high',
    'medium',
    'low',
    'unknown',
    'none',
  ];

  function isActive(s: Severity): boolean {
    return store.severityFilters.has(s);
  }
</script>

{#if store.hasVex}
  <div class="severity-filter" role="group" aria-label="Filter by severity">
    {#each ORDER as s (s)}
      <button
        type="button"
        class="sev-chip sev-chip--{s}"
        class:sev-chip--active={isActive(s)}
        onclick={() => store.toggleSeverity(s)}
        aria-pressed={isActive(s)}
      >
        {s}
      </button>
    {/each}
  </div>
{/if}

<style>
  .severity-filter {
    display: inline-flex;
    flex-wrap: wrap;
    gap: 0.375rem;
    align-items: center;
  }
  .sev-chip {
    appearance: none;
    border: 1px solid var(--chip-border, var(--color-ink-200));
    background: var(--chip-bg, var(--color-surface));
    color: var(--chip-fg, var(--color-ink-700));
    border-radius: 999px;
    padding: 0.25rem 0.625rem;
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    cursor: pointer;
    transition: background-color 80ms ease, border-color 80ms ease;
  }
  .sev-chip:hover {
    border-color: var(--chip-fg, var(--color-ink-400));
  }
  .sev-chip--active {
    box-shadow: 0 0 0 1px var(--chip-fg, var(--color-accent-500));
  }

  .sev-chip--critical {
    --chip-fg: var(--color-severity-critical);
    --chip-border: color-mix(in srgb, var(--color-severity-critical) 30%, transparent);
  }
  .sev-chip--critical.sev-chip--active {
    --chip-bg: color-mix(in srgb, var(--color-severity-critical) 10%, transparent);
  }
  .sev-chip--high {
    --chip-fg: var(--color-severity-high);
    --chip-border: color-mix(in srgb, var(--color-severity-high) 30%, transparent);
  }
  .sev-chip--high.sev-chip--active {
    --chip-bg: color-mix(in srgb, var(--color-severity-high) 10%, transparent);
  }
  .sev-chip--medium {
    --chip-fg: var(--color-severity-medium);
    --chip-border: color-mix(in srgb, var(--color-severity-medium) 30%, transparent);
  }
  .sev-chip--medium.sev-chip--active {
    --chip-bg: color-mix(in srgb, var(--color-severity-medium) 10%, transparent);
  }
  .sev-chip--low {
    --chip-fg: var(--color-severity-low);
    --chip-border: color-mix(in srgb, var(--color-severity-low) 30%, transparent);
  }
  .sev-chip--low.sev-chip--active {
    --chip-bg: color-mix(in srgb, var(--color-severity-low) 10%, transparent);
  }
  .sev-chip--unknown,
  .sev-chip--none {
    --chip-fg: var(--color-ink-600);
  }
  .sev-chip--unknown.sev-chip--active,
  .sev-chip--none.sev-chip--active {
    --chip-bg: var(--color-ink-100);
  }
</style>
