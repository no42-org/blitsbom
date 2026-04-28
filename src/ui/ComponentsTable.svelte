<script lang="ts">
  import type { Component, Severity } from '../types';
  import { store } from '../state/store.svelte';
  import { isLive } from '../parse/vex';

  function severityCount(c: Component, sev: Severity): number {
    let n = 0;
    for (const v of c.vulnerabilities) {
      if (!store.showSuppressed && !isLive(v)) continue;
      if (v.severity === sev) n += 1;
    }
    return n;
  }

  interface Props {
    components: Component[];
  }

  let { components }: Props = $props();

  type SortKey =
    | 'name'
    | 'version'
    | 'license'
    | 'scope'
    | 'type'
    | 'vulns-critical'
    | 'vulns-high'
    | 'vulns-medium'
    | 'vulns-low';
  type SortDir = 'asc' | 'desc';
  type SeverityColumn = 'critical' | 'high' | 'medium' | 'low';
  const SEVERITY_COLUMNS: readonly SeverityColumn[] = [
    'critical',
    'high',
    'medium',
    'low',
  ];
  const SEVERITY_COLUMN_LABEL: Record<SeverityColumn, string> = {
    critical: 'Crit',
    high: 'High',
    medium: 'Med',
    low: 'Low',
  };

  let sortKey = $state<SortKey>('name');
  let sortDir = $state<SortDir>('asc');
  // Purl column starts collapsed (just an icon per row); clicking the header
  // toggles full text rendering for every row at once.
  let purlExpanded = $state(false);

  type PageSize = 20 | 50 | 100 | 200 | 'all';
  const PAGE_SIZE_OPTIONS: readonly PageSize[] = [20, 50, 100, 200, 'all'];
  let pageSize = $state<PageSize>(20);
  let currentPage = $state(1);

  // PERF: sortedRows and visibleRows MUST be $state.raw populated from
  // $effect, not $derived. A $derived array passed to {#each} causes
  // Svelte 5 to wrap each accessed property in reactive proxies; for
  // thousands of source components plus {#each} reading c.name, c.version,
  // c.licenses, etc., this freezes the browser.
  let sortedRows = $state.raw<Component[]>([]);
  let visibleRows = $state.raw<Component[]>([]);
  let totalCount = $state(0);

  $effect(() => {
    // Capture reactive deps explicitly, then defer the heavy sort to a
    // setTimeout(0) so it doesn't block Svelte's other DOM updates (donut,
    // drilldown) — they get to paint first, then the table updates.
    const list = components;
    const key = sortKey;
    const dir = sortDir;
    // Sorting by 'vulns' depends on liveCount(c), which reads
    // store.showSuppressed. Touch it here so the effect re-runs when the
    // toggle flips. Cheap (one boolean), and a no-op for other sort keys.
    void store.showSuppressed;

    const handle = setTimeout(() => {
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

      sortedRows = sortedArr;
      totalCount = list.length;
    }, 0);

    return () => clearTimeout(handle);
  });

  // When the underlying list changes (filters etc.) or the page size
  // changes, jump back to page 1. Sort changes are handled in setSort.
  $effect(() => {
    components;
    pageSize;
    currentPage = 1;
  });

  // Visible slice — derived from sortedRows + page + pageSize. Cheap, but
  // still kept in $state.raw to avoid the proxy-on-iterate trap above.
  $effect(() => {
    const arr = sortedRows;
    const ps = pageSize;
    const cp = currentPage;
    if (ps === 'all') {
      visibleRows = arr;
      return;
    }
    const start = (cp - 1) * ps;
    visibleRows = arr.slice(start, start + ps);
  });

  const totalPages = $derived(
    pageSize === 'all' ? 1 : Math.max(1, Math.ceil(totalCount / pageSize)),
  );
  const pageStart = $derived(
    totalCount === 0
      ? 0
      : pageSize === 'all'
        ? 1
        : (currentPage - 1) * pageSize + 1,
  );
  const pageEnd = $derived(
    pageSize === 'all'
      ? totalCount
      : Math.min(currentPage * pageSize, totalCount),
  );

  function goToPage(n: number): void {
    currentPage = Math.max(1, Math.min(totalPages, n));
  }

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
      case 'vulns-critical':
      case 'vulns-high':
      case 'vulns-medium':
      case 'vulns-low': {
        // Zero-pad so lexicographic comparison matches numeric order;
        // tie-break by lowercase name so equal-count rows are stable.
        const sev = key.slice('vulns-'.length) as Severity;
        return (
          String(severityCount(c, sev)).padStart(10, '0') +
          ':' +
          c.name.toLowerCase()
        );
      }
    }
  }

  function setSort(key: SortKey) {
    if (sortKey === key) {
      sortDir = sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      sortKey = key;
      sortDir = 'asc';
    }
    currentPage = 1;
  }

  function arrow(key: SortKey): string {
    if (sortKey !== key) return '';
    return sortDir === 'asc' ? '↑' : '↓';
  }

  // Short display for SHA-style versions ("sha256:abc…") so the column
  // doesn't blow out horizontally. Non-SHA versions render unchanged.
  // The full value is preserved separately and copied to the clipboard
  // when the user hits the icon.
  const SHA_RE = /^(sha(?:1|224|256|384|512))[:-]([0-9a-f]+)$/i;
  function displayVersion(v: string): string {
    const m = v.match(SHA_RE);
    if (!m) return v;
    const algo = m[1]!.toLowerCase();
    const digest = m[2]!;
    if (digest.length <= 12) return `${algo}:${digest}`;
    return `${algo}:${digest.slice(0, 12)}…`;
  }

  // Briefly swap the clipboard icon to a checkmark on the row that was
  // just copied, so the action gives a visible confirmation. Tracked by
  // visibleRows index; cleared after 1.5s.
  let copiedIdx = $state<number | null>(null);
  async function copyVersion(idx: number, value: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(value);
      copiedIdx = idx;
      setTimeout(() => {
        if (copiedIdx === idx) copiedIdx = null;
      }, 1500);
    } catch {
      // Clipboard API unavailable (insecure context, etc.) — silently
      // skip rather than throwing into the user's face.
    }
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
        {#if store.hasVex}
          {#each SEVERITY_COLUMNS as sev (sev)}
            {@const k = `vulns-${sev}` as SortKey}
            <th
              scope="col"
              class="th-sev"
              aria-sort={sortKey === k
                ? sortDir === 'asc'
                  ? 'ascending'
                  : 'descending'
                : 'none'}
            >
              <button
                type="button"
                class="sort sort--sev sort--sev-{sev}"
                onclick={() => setSort(k)}
                title={`Sort by ${sev} vulnerabilities`}
              >
                {SEVERITY_COLUMN_LABEL[sev]}
                <span class="sort__arrow" aria-hidden="true">{arrow(k)}</span>
              </button>
            </th>
          {/each}
        {/if}
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
          <td class="empty" colspan={store.hasVex ? 10 : 6}>
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
            <td class="cell-version">
              {#if c.version}
                <button
                  type="button"
                  class="copy-btn"
                  onclick={() => copyVersion(idx, c.version!)}
                  aria-label={`Copy ${c.version} to clipboard`}
                  title={copiedIdx === idx ? 'Copied!' : 'Copy version'}
                >
                  {#if copiedIdx === idx}
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2.5"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      aria-hidden="true"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  {:else}
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
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                  {/if}
                </button>
                <span class="mono" title={c.version}>
                  {displayVersion(c.version)}
                </span>
              {:else}
                <span class="muted">—</span>
              {/if}
            </td>
            <td>
              {#if c.licenses.length === 0}
                <span class="muted">—</span>
              {:else}
                {#each c.licenses as lic, i (lic.value + i)}
                  {#if i > 0}, {/if}
                  <span class="license-cell">
                    {#if lic.url}
                      <a
                        class="license-link"
                        href={lic.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`Open ${lic.value} license text in a new tab`}
                        title={lic.url}
                      >
                        <svg
                          width="12"
                          height="12"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="2"
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          aria-hidden="true"
                        >
                          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                        </svg>
                      </a>
                    {/if}
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
                  </span>
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
            {#if store.hasVex}
              {#each SEVERITY_COLUMNS as sev (sev)}
                {@const cnt = severityCount(c, sev)}
                <td class="cell-sev">
                  {#if cnt === 0}
                    <span class="muted">—</span>
                  {:else}
                    <button
                      type="button"
                      class="sev-count sev-count--{sev}"
                      onclick={() => store.toggleVexDrilldown(c, sev)}
                      aria-pressed={store.vexDrilldownComponent === c &&
                        store.vexDrilldownSeverity === sev}
                      title={`${cnt} ${sev} ${cnt === 1 ? 'vulnerability' : 'vulnerabilities'}`}
                    >
                      {cnt}
                    </button>
                  {/if}
                </td>
              {/each}
            {/if}
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
          {#if store.hasVex && store.vexDrilldownComponent === c}
            {@const baseVulns = store.showSuppressed
              ? c.vulnerabilities
              : c.vulnerabilities.filter(isLive)}
            {@const visibleVulns = store.vexDrilldownSeverity === null
              ? baseVulns
              : baseVulns.filter(
                  (v) => v.severity === store.vexDrilldownSeverity,
                )}
            <tr class="vuln-expansion">
              <td colspan="10">
                {#if visibleVulns.length === 0}
                  <p class="vuln-expansion__empty">No vulnerabilities to show.</p>
                {:else}
                  <ul class="vuln-list">
                    {#each visibleVulns as v (v.id + ':' + v.source)}
                      <li
                        class="vuln-row"
                        class:vuln-row--suppressed={v.status && !isLive(v)}
                      >
                        <span class="vuln-row__sev vuln-row__sev--{v.severity}">{v.severity}</span>
                        <span class="vuln-row__id">
                          {#if v.url}
                            <a href={v.url} target="_blank" rel="noopener noreferrer">{v.id}</a>
                          {:else}
                            {v.id}
                          {/if}
                        </span>
                        <span class="vuln-row__source">{v.source}</span>
                        {#if v.cvssScore !== undefined}
                          <span class="vuln-row__cvss" title={v.cvssVector ?? undefined}>
                            CVSS {v.cvssScore.toFixed(1)}
                          </span>
                        {/if}
                        {#if v.status}
                          <span class="vuln-row__status" title={v.justification ?? ''}>{v.status}</span>
                        {/if}
                        {#if v.description}
                          <p class="vuln-row__description">{v.description}</p>
                        {/if}
                      </li>
                    {/each}
                  </ul>
                {/if}
              </td>
            </tr>
          {/if}
        {/each}
      {/if}
    </tbody>
  </table>
  {#if totalCount > 0}
    <div class="more">
      <span class="more__count">
        Showing {pageStart.toLocaleString()}–{pageEnd.toLocaleString()} of {totalCount.toLocaleString()} components
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
      {#if pageSize !== 'all' && totalPages > 1}
        <nav class="pager" aria-label="Table pagination">
          <button
            type="button"
            class="pager__btn"
            onclick={() => goToPage(currentPage - 1)}
            disabled={currentPage <= 1}
            aria-label="Previous page"
          >‹ Prev</button>
          <span class="pager__indicator" aria-live="polite">
            Page {currentPage.toLocaleString()} of {totalPages.toLocaleString()}
          </span>
          <button
            type="button"
            class="pager__btn"
            onclick={() => goToPage(currentPage + 1)}
            disabled={currentPage >= totalPages}
            aria-label="Next page"
          >Next ›</button>
        </nav>
      {/if}
    </div>
  {/if}
</div>

<style>
  .table-wrap {
    background: var(--color-surface);
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
  .cell-version {
    white-space: nowrap;
  }
  .copy-btn {
    appearance: none;
    background: transparent;
    border: 0;
    padding: 0;
    margin-right: 0.375rem;
    color: var(--color-ink-400);
    cursor: pointer;
    line-height: 0;
    vertical-align: middle;
  }
  .copy-btn:hover {
    color: var(--color-accent-600);
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
  .license-cell {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    vertical-align: middle;
  }
  .license-link {
    display: inline-flex;
    align-items: center;
    color: var(--color-ink-400);
    text-decoration: none;
    line-height: 0;
  }
  .license-link:hover {
    color: var(--color-accent-600);
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
    background: var(--color-surface);
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
  .pager {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
  }
  .pager__btn {
    appearance: none;
    border: 1px solid var(--color-ink-200);
    background: var(--color-surface);
    border-radius: 6px;
    padding: 0.25rem 0.625rem;
    font: inherit;
    font-size: 0.8125rem;
    color: var(--color-ink-800);
    cursor: pointer;
    font-variant-numeric: tabular-nums;
  }
  .pager__btn:hover:not(:disabled) {
    background-color: var(--color-ink-100);
  }
  .pager__btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
  .pager__indicator {
    font-variant-numeric: tabular-nums;
    color: var(--color-ink-600);
    min-width: 8rem;
    text-align: center;
  }
  .th-sev {
    text-align: center;
    /* Narrow severity columns — content is at most a 4-digit count. */
    width: 4rem;
    min-width: 3.5rem;
  }
  .cell-sev {
    text-align: center;
    white-space: nowrap;
  }
  .sort--sev {
    margin: 0 auto;
  }
  .sort--sev-critical { color: var(--color-severity-critical); }
  .sort--sev-high { color: var(--color-severity-high); }
  .sort--sev-medium { color: var(--color-severity-medium); }
  .sort--sev-low { color: var(--color-severity-low); }
  .sev-count {
    appearance: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--badge-border, var(--color-ink-200));
    background: var(--badge-bg, transparent);
    color: var(--badge-fg, var(--color-ink-800));
    border-radius: 999px;
    min-width: 1.875rem;
    padding: 0.0625rem 0.5rem;
    font: inherit;
    font-size: 0.8125rem;
    font-family: var(--font-mono);
    font-variant-numeric: tabular-nums;
    font-weight: 600;
    cursor: pointer;
  }
  .sev-count--low {
    --badge-bg: color-mix(in srgb, var(--color-severity-low) 8%, transparent);
    --badge-border: color-mix(in srgb, var(--color-severity-low) 25%, transparent);
    --badge-fg: var(--color-severity-low);
  }
  .sev-count--medium {
    --badge-bg: color-mix(in srgb, var(--color-severity-medium) 10%, transparent);
    --badge-border: color-mix(in srgb, var(--color-severity-medium) 30%, transparent);
    --badge-fg: var(--color-severity-medium);
  }
  .sev-count--high {
    --badge-bg: color-mix(in srgb, var(--color-severity-high) 10%, transparent);
    --badge-border: color-mix(in srgb, var(--color-severity-high) 30%, transparent);
    --badge-fg: var(--color-severity-high);
  }
  .sev-count--critical {
    --badge-bg: color-mix(in srgb, var(--color-severity-critical) 12%, transparent);
    --badge-border: color-mix(in srgb, var(--color-severity-critical) 35%, transparent);
    --badge-fg: var(--color-severity-critical);
  }
  .sev-count[aria-pressed='true'] {
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-accent-500) 30%, transparent);
  }

  /* Inline expansion row that appears immediately under a row whose vuln
     badge is active. Visually nested under the parent via inset background
     + left rule so the table reads as parent → expanded children. */
  .vuln-expansion > td {
    padding: 0.75rem 1rem 1rem 2.25rem;
    background: var(--color-ink-50);
    border-bottom: 1px solid var(--color-ink-200);
    border-left: 3px solid color-mix(in srgb, var(--color-accent-500) 50%, transparent);
  }
  .vuln-expansion__empty {
    margin: 0;
    color: var(--color-ink-500);
    font-size: 0.8125rem;
  }
  .vuln-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }
  .vuln-row {
    display: grid;
    grid-template-columns: 5rem 1fr auto auto auto;
    gap: 0.625rem;
    align-items: baseline;
    padding: 0.5rem 0.625rem;
    border: 1px solid var(--color-ink-200);
    border-radius: 6px;
    background: var(--color-surface);
  }
  .vuln-row--suppressed {
    opacity: 0.65;
  }
  .vuln-row__sev {
    font-size: 0.6875rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-weight: 600;
    text-align: center;
    padding: 0.125rem 0.375rem;
    border-radius: 4px;
    color: white;
  }
  .vuln-row__sev--low { background: var(--color-severity-low); }
  .vuln-row__sev--medium { background: var(--color-severity-medium); color: var(--color-ink-900); }
  .vuln-row__sev--high { background: var(--color-severity-high); }
  .vuln-row__sev--critical { background: var(--color-severity-critical); }
  .vuln-row__sev--none,
  .vuln-row__sev--unknown { background: var(--color-severity-unknown); }
  .vuln-row__id {
    font-family: var(--font-mono);
    font-size: 0.875rem;
    color: var(--color-ink-900);
  }
  .vuln-row__id a {
    color: var(--color-accent-600);
    text-decoration: none;
  }
  .vuln-row__id a:hover {
    text-decoration: underline;
  }
  .vuln-row__source {
    font-size: 0.8125rem;
    color: var(--color-ink-600);
  }
  .vuln-row__cvss {
    font-family: var(--font-mono);
    font-size: 0.8125rem;
    color: var(--color-ink-700);
    cursor: help;
  }
  .vuln-row__status {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--color-ink-500);
    cursor: help;
  }
  .vuln-row__description {
    grid-column: 1 / -1;
    margin: 0.25rem 0 0;
    font-size: 0.8125rem;
    color: var(--color-ink-600);
  }
  @media (max-width: 720px) {
    .vuln-row {
      grid-template-columns: 5rem 1fr auto;
    }
    .vuln-row__cvss,
    .vuln-row__status {
      grid-column: 2 / -1;
    }
  }
</style>
