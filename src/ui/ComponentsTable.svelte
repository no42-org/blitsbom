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

  const sorted = $derived(
    [...components].sort((a, b) => {
      const va = sortValue(a, sortKey);
      const vb = sortValue(b, sortKey);
      const cmp = va.localeCompare(vb, undefined, { numeric: true });
      return sortDir === 'asc' ? cmp : -cmp;
    }),
  );

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
        {#each sorted as c (c.purl ?? `${c.group ?? ''}:${c.name}:${c.version ?? ''}`)}
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
</div>

<style>
  .table-wrap {
    background: white;
    border: 1px solid theme('colors.ink.200');
    border-radius: 12px;
    overflow: hidden;
  }
  .components-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.875rem;
  }
  thead {
    background: theme('colors.ink.50');
    text-align: left;
  }
  thead th {
    padding: 0.75rem 1rem;
    font-weight: 600;
    color: theme('colors.ink.600');
    border-bottom: 1px solid theme('colors.ink.200');
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  tbody td {
    padding: 0.75rem 1rem;
    border-bottom: 1px solid theme('colors.ink.100');
    vertical-align: top;
  }
  tbody tr:last-child td {
    border-bottom: 0;
  }
  tbody tr:hover {
    background: theme('colors.ink.50 / 60%');
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
    color: theme('colors.ink.900');
  }
  .sort__arrow {
    width: 0.75rem;
    color: theme('colors.ink.500');
  }
  .mono {
    font-family: theme('fontFamily.mono');
    color: theme('colors.ink.700');
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
    font-family: theme('fontFamily.mono');
    font-size: 0.75rem;
    color: theme('colors.ink.500');
  }
  .cell-name__name {
    font-weight: 500;
    color: theme('colors.ink.900');
  }
  .badge {
    display: inline-block;
    padding: 0.125rem 0.5rem;
    border-radius: 999px;
    background: theme('colors.ink.100');
    color: theme('colors.ink.700');
    font-size: 0.75rem;
    font-family: theme('fontFamily.mono');
  }
  .badge--neutral {
    background: theme('colors.ink.50');
  }
  .license-pill {
    display: inline-block;
    padding: 0.125rem 0.5rem;
    border-radius: 999px;
    background: theme('colors.accent.500 / 8%');
    border: 1px solid theme('colors.accent.500 / 20%');
    color: theme('colors.accent.600');
    font-size: 0.8125rem;
    font-family: theme('fontFamily.mono');
    cursor: pointer;
  }
  .license-pill:hover {
    background: theme('colors.accent.500 / 15%');
  }
  .license-pill--active {
    background: theme('colors.accent.500');
    color: white;
    border-color: theme('colors.accent.500');
  }
  .muted {
    color: theme('colors.ink.400');
  }
  .empty {
    padding: 3rem 1rem;
    text-align: center;
    color: theme('colors.ink.500');
  }
</style>
