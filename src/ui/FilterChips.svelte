<script lang="ts">
  import { store } from '../state/store.svelte';

  type FacetEntry = {
    label: string;
    value: string;
    facet: 'license' | 'scope' | 'type';
  };

  const chips = $derived<FacetEntry[]>([
    ...[...store.licenseFilters].sort().map((value) => ({
      label: value,
      value,
      facet: 'license' as const,
    })),
    ...[...store.scopeFilters].sort().map((value) => ({
      label: `scope: ${value}`,
      value,
      facet: 'scope' as const,
    })),
    ...[...store.typeFilters].sort().map((value) => ({
      label: `type: ${value}`,
      value,
      facet: 'type' as const,
    })),
  ]);

  function remove(entry: FacetEntry) {
    if (entry.facet === 'license') store.toggleLicense(entry.value);
    else if (entry.facet === 'scope') store.toggleScope(entry.value);
    else store.toggleType(entry.value);
  }
</script>

{#if chips.length > 0}
  <div class="chips" aria-label="Active filters">
    {#each chips as entry (`${entry.facet}:${entry.value}`)}
      <span class="chip">
        <span class="chip__label">{entry.label}</span>
        <button
          type="button"
          class="chip__remove"
          onclick={() => remove(entry)}
          aria-label={`Remove filter ${entry.label}`}
        >
          ×
        </button>
      </span>
    {/each}
    <button type="button" class="chips__clear" onclick={() => store.clearFilters()}>
      Clear all
    </button>
  </div>
{/if}

<style>
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    align-items: center;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.25rem 0.5rem 0.25rem 0.625rem;
    background: white;
    border: 1px solid var(--color-ink-200);
    border-radius: 999px;
    font-size: 0.8125rem;
    color: var(--color-ink-700);
    font-family: var(--font-mono);
  }
  .chip__label {
    line-height: 1.25;
  }
  .chip__remove {
    appearance: none;
    border: 0;
    background: transparent;
    padding: 0 0.25rem;
    cursor: pointer;
    color: var(--color-ink-500);
    font-size: 1rem;
    line-height: 1;
  }
  .chip__remove:hover {
    color: var(--color-ink-800);
  }
  .chips__clear {
    appearance: none;
    border: 0;
    background: transparent;
    padding: 0.25rem 0.5rem;
    font-size: 0.8125rem;
    color: var(--color-accent-600);
    cursor: pointer;
  }
  .chips__clear:hover {
    text-decoration: underline;
  }
</style>
