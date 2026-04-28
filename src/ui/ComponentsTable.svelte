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
  // Purl column starts collapsed (just an icon per row); clicking the header
  // toggles full text rendering for every row at once.
  let purlExpanded = $state(false);

  type PageSize = 20 | 50 | 100 | 200 | 'all';
  const PAGE_SIZE_OPTIONS: readonly PageSize[] = [20, 50, 100, 200, 'all'];
  let pageSize = $state<PageSize>(20);

  // PERF: visibleRows MUST be $state.raw populated from $effect, not $derived.
  // A $derived array passed to {#each} causes Svelte 5 to wrap each accessed
  // property in reactive proxies; for thousands of source components plus
  // {#each} reading c.name, c.version, c.licenses, etc., this freezes the
  // browser. $state.raw side-steps the proxy machinery on the array elements.
  let visibleRows = $state.raw<Component[]>([]);
  let totalCount = $state(0);

  $effect(() => {
    // Capture reactive deps explicitly, then defer the heavy sort to a
    // setTimeout(0) so it doesn't block Svelte's other DOM updates (donut,
    // drilldown) — they get to paint first, then the table updates.
    const list = components;
    const key = sortKey;
    const dir = sortDir;
    const ps = pageSize;

    const handle = setTimeout(() => {
      const cap = ps === 'all' ? list.length : Math.min(ps, list.length);
      const keys = new Array<string>(list.length);
      for (let i = 0; i < list.length; i++) {
        keys[i] = sortValue(list[i]!, key);
      }
      const order = new Array<number>(list.length);
      for (let i = 0; i < list.length; i++) order[i] = i;
      order.sort((a, b) => {
        const va = keys[a]!;
        const vb = keys[b]!;
        const cmp = va < vb ? -1 : va > vb ? 1 : 0;
        return dir === 'asc' ? cmp : -cmp;
      });
      const sortedArr = new Array<Component>(list.length);
      for (let i = 0; i < list.length; i++) sortedArr[i] = list[order[i]!]!;

      visibleRows = sortedArr.slice(0, cap);
      totalCount = list.length;
    }, 0);

    return () => clearTimeout(handle);
  });

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
        <th scope="col">
          <button
            type="button"
            class="sort"
            onclick={() => (purlExpanded = !purlExpanded)}
            aria-expanded={purlExpanded}
            aria-controls="purl-cells"
            title={purlExpanded ? 'Collapse purls' : 'Expand purls'}
          >
            purl
            <span class="sort__arrow" aria-hidden="true">
              {purlExpanded ? '▾' : '▸'}
            </span>
          </button>
        </th>
      </tr>
    </thead>
    <tbody>
      {#if totalCount === 0}
        <tr>
          <td class="empty" colspan="6">
            No components match the current filters.
          </td>
        </tr>
      {:else}
        {#each visibleRows as c, idx (idx)}
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
            <td
              class="purl"
              class:purl--collapsed={!purlExpanded}
              title={c.purl ?? ''}
            >
              {#if !c.purl}
                <span class="muted">—</span>
              {:else if purlExpanded}
                <span class="mono purl__text">{c.purl}</span>
              {:else}
                <span class="purl__icon" aria-label="package URL">
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                    <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                    <line x1="12" y1="22.08" x2="12" y2="12" />
                  </svg>
                </span>
              {/if}
            </td>
          </tr>
        {/each}
      {/if}
    </tbody>
  </table>
  {#if totalCount > 0}
    <div class="more">
      <span class="more__count">
        Showing {visibleRows.length.toLocaleString()} of {totalCount.toLocaleString()} components
      </span>
      <label class="more__pagesize">
        <span>Rows per page:</span>
        <select
          class="more__select"
          bind:value={pageSize}
          aria-label="Rows per page"
        >
          {#each PAGE_SIZE_OPTIONS as opt (opt)}
            <option value={opt}>
              {opt === 'all' ? 'Show all' : opt}
            </option>
          {/each}
        </select>
      </label>
    </div>
  {/if}
</div>

<style>
  .table-wrap {
    background: white;
    border: 1px solid var(--color-ink-200);
    border-radius: 12px;
    overflow-x: auto;
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
    max-width: 24rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .purl--collapsed {
    width: 3rem;
    text-align: center;
    padding-left: 0.5rem;
    padding-right: 0.5rem;
  }
  .purl__icon {
    display: inline-flex;
    color: var(--color-ink-500);
    cursor: help;
  }
  .purl__icon:hover {
    color: var(--color-ink-800);
  }
  .purl__text {
    display: inline-block;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    vertical-align: bottom;
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
  .more__pagesize {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    color: var(--color-ink-600);
  }
  .more__select {
    appearance: none;
    border: 1px solid var(--color-ink-200);
    background: white;
    border-radius: 6px;
    padding: 0.25rem 1.75rem 0.25rem 0.5rem;
    font: inherit;
    font-size: 0.8125rem;
    color: var(--color-ink-800);
    cursor: pointer;
    background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'><path d='M1 1l4 4 4-4' fill='none' stroke='%2394a3b8' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/></svg>");
    background-repeat: no-repeat;
    background-position: right 0.5rem center;
  }
  .more__select:hover {
    background-color: var(--color-ink-100);
  }
</style>
