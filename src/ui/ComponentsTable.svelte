<script lang="ts">
  import type { Component } from '../types';
  import { store } from '../state/store.svelte';

  interface Props {
    components: Component[];
  }

  let { components }: Props = $props();

  type SortKey = 'name' | 'version' | 'license' | 'scope' | 'type';
  type SortDir = 'asc' | 'desc';

  let sortKey = $state<SortKey>('name');
  let sortDir = $state<SortDir>('asc');

  const PAGE_SIZE = 500;
  let visibleCount = $state(PAGE_SIZE);

  // Reset the cap whenever the input list shrinks (new SBOM, filter change).
  $effect(() => {
    components.length;
    visibleCount = PAGE_SIZE;
  });

  const sorted = $derived(
    [...components].sort((a, b) => {
      const va = sortValue(a, sortKey);
      const vb = sortValue(b, sortKey);
      const cmp = va.localeCompare(vb, undefined, { numeric: true });
      return sortDir === 'asc' ? cmp : -cmp;
    }),
  );

  const visibleRows = $derived(sorted.slice(0, visibleCount));
  const hasMore = $derived(sorted.length > visibleRows.length);

  function sortValue(c: Component, key: SortKey): string {
    switch (key) {
      case 'name':
        return c.name.toLowerCase();
      case 'version':
        return c.version ?? '';
      case 'license':
        return c.licenses[0]?.value.toLowerCase() ?? '';
      case 'scope':
        return c.scope ?? '';
      case 'type':
        return c.type;
    }
  }

  function setSort(key: SortKey) {
    if (sortKey === key) {
      sortDir = sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      sortKey = key;
      sortDir = 'asc';
    }
  }

  function arrow(key: SortKey): string {
    if (sortKey !== key) return '';
    return sortDir === 'asc' ? '↑' : '↓';
  }
</script>

<div class="table-wrap">
  <table class="components-table">
    <thead>
      <tr>
        {#each [['name', 'Name'], ['version', 'Version'], ['license', 'License'], ['scope', 'Scope'], ['type', 'Type']] as [key, label]}
          <th
            scope="col"
            aria-sort={sortKey === key
              ? sortDir === 'asc'
                ? 'ascending'
                : 'descending'
              : 'none'}
          >
            <button
              type="button"
              class="sort"
              onclick={() => setSort(key as SortKey)}
            >
              {label}
              <span class="sort__arrow" aria-hidden="true">{arrow(key as SortKey)}</span>
            </button>
          </th>
        {/each}
        <th scope="col">purl</th>
      </tr>
    </thead>
    <tbody>
      {#if sorted.length === 0}
        <tr>
          <td class="empty" colspan="6">
            No components match the current filters.
          </td>
        </tr>
      {:else}
        {#each visibleRows as c (c.purl ?? `${c.group ?? ''}:${c.name}:${c.version ?? ''}`)}
          <tr>
            <td>
              <div class="cell-name">
                {#if c.group}<span class="cell-name__group">{c.group}</span>{/if}
                <span class="cell-name__name">{c.name}</span>
              </div>
            </td>
            <td class="mono">{c.version ?? '—'}</td>
            <td>
              {#if c.licenses.length === 0}
                <span class="muted">—</span>
              {:else}
                {#each c.licenses as lic, i (lic.value + i)}
                  {#if i > 0}, {/if}
                  <button
                    type="button"
                    class="license-pill"
                    class:license-pill--active={store.licenseFilters.has(lic.value)}
                    onclick={() => store.toggleLicense(lic.value)}
                    title={lic.kind === 'expression'
                      ? 'SPDX expression'
                      : lic.value}
                  >
                    {lic.value}
                  </button>
                {/each}
              {/if}
            </td>
            <td>
              {#if c.scope}
                <span class="badge">{c.scope}</span>
              {:else}
                <span class="muted">—</span>
              {/if}
            </td>
            <td>
              <span class="badge badge--neutral">{c.type}</span>
            </td>
            <td class="mono purl">{c.purl ?? '—'}</td>
          </tr>
        {/each}
      {/if}
    </tbody>
  </table>
  {#if hasMore}
    <div class="more">
      <span class="more__count">
        Showing {visibleRows.length.toLocaleString()} of {sorted.length.toLocaleString()} components
      </span>
      <button
        type="button"
        class="more__btn"
        onclick={() => (visibleCount += PAGE_SIZE)}
      >
        Show {Math.min(PAGE_SIZE, sorted.length - visibleRows.length).toLocaleString()} more
      </button>
      <button
        type="button"
        class="more__btn more__btn--ghost"
        onclick={() => (visibleCount = sorted.length)}
      >
        Show all
      </button>
    </div>
  {/if}
</div>

<style>
  .table-wrap {
    background: white;
    border: 1px solid var(--color-ink-200);
    border-radius: 12px;
    overflow: hidden;
  }
  .components-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.875rem;
  }
  thead {
    background: var(--color-ink-50);
    text-align: left;
  }
  thead th {
    padding: 0.75rem 1rem;
    font-weight: 600;
    color: var(--color-ink-600);
    border-bottom: 1px solid var(--color-ink-200);
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  tbody td {
    padding: 0.75rem 1rem;
    border-bottom: 1px solid var(--color-ink-100);
    vertical-align: top;
  }
  tbody tr:last-child td {
    border-bottom: 0;
  }
  tbody tr:hover {
    background: color-mix(in srgb, var(--color-ink-50) 60%, transparent);
  }
  .sort {
    appearance: none;
    background: transparent;
    border: 0;
    padding: 0;
    color: inherit;
    font: inherit;
    text-transform: inherit;
    letter-spacing: inherit;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
  }
  .sort:hover {
    color: var(--color-ink-900);
  }
  .sort__arrow {
    width: 0.75rem;
    color: var(--color-ink-500);
  }
  .mono {
    font-family: var(--font-mono);
    color: var(--color-ink-700);
  }
  .purl {
    word-break: break-all;
    max-width: 24rem;
  }
  .cell-name {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
  }
  .cell-name__group {
    font-family: var(--font-mono);
    font-size: 0.75rem;
    color: var(--color-ink-500);
  }
  .cell-name__name {
    font-weight: 500;
    color: var(--color-ink-900);
  }
  .badge {
    display: inline-block;
    padding: 0.125rem 0.5rem;
    border-radius: 999px;
    background: var(--color-ink-100);
    color: var(--color-ink-700);
    font-size: 0.75rem;
    font-family: var(--font-mono);
  }
  .badge--neutral {
    background: var(--color-ink-50);
  }
  .license-pill {
    display: inline-block;
    padding: 0.125rem 0.5rem;
    border-radius: 999px;
    background: color-mix(in srgb, var(--color-accent-500) 8%, transparent);
    border: 1px solid color-mix(in srgb, var(--color-accent-500) 20%, transparent);
    color: var(--color-accent-600);
    font-size: 0.8125rem;
    font-family: var(--font-mono);
    cursor: pointer;
  }
  .license-pill:hover {
    background: color-mix(in srgb, var(--color-accent-500) 15%, transparent);
  }
  .license-pill--active {
    background: var(--color-accent-500);
    color: white;
    border-color: var(--color-accent-500);
  }
  .muted {
    color: var(--color-ink-400);
  }
  .empty {
    padding: 3rem 1rem;
    text-align: center;
    color: var(--color-ink-500);
  }
  .more {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.75rem;
    padding: 0.875rem 1rem;
    border-top: 1px solid var(--color-ink-100);
    background: var(--color-ink-50);
    font-size: 0.8125rem;
    color: var(--color-ink-600);
  }
  .more__count {
    flex: 1;
  }
  .more__btn {
    appearance: none;
    border: 1px solid var(--color-ink-200);
    background: white;
    border-radius: 6px;
    padding: 0.375rem 0.75rem;
    font-size: 0.8125rem;
    color: var(--color-ink-800);
    cursor: pointer;
  }
  .more__btn:hover {
    background: var(--color-ink-100);
  }
  .more__btn--ghost {
    background: transparent;
    border-color: transparent;
    color: var(--color-ink-600);
  }
  .more__btn--ghost:hover {
    background: var(--color-ink-100);
    color: var(--color-ink-900);
  }
</style>
