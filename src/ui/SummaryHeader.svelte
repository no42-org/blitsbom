<script lang="ts">
  import type { LoadedSbom } from '../types';
  import { store } from '../state/store.svelte';
  import LoadVexButton from './LoadVexButton.svelte';

  interface Props {
    sbom: LoadedSbom;
    componentCount: number;
    licenseCount: number;
    typeCount: number;
    originatorCount: number;
  }

  let { sbom, componentCount, licenseCount, typeCount, originatorCount }: Props =
    $props();

  const formattedTimestamp = $derived(formatTimestamp(sbom.metadata.timestamp));
  const formattedVexTimestamp = $derived(
    formatTimestamp(sbom.vexMetadata?.timestamp ?? null),
  );

  function formatTimestamp(iso: string | null): string | null {
    if (!iso) return null;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC');
  }
</script>

<header class="summary-header">
  <div class="summary-header__title">
    <div class="summary-header__title-row">
      <div class="summary-header__title-text">
        {#if sbom.metadata.projectName}
          <h1 class="text-2xl font-semibold text-ink-900">
            {sbom.metadata.projectName}
          </h1>
        {/if}
        <p class="mt-1 text-sm text-ink-500">
          {sbom.metadata.sbomFormat === 'CycloneDX-1.x'
            ? `CycloneDX ${sbom.metadata.specVersion}`
            : sbom.metadata.specVersion}
          {#if formattedTimestamp}
            <span aria-hidden="true">·</span>
            <time datetime={sbom.metadata.timestamp ?? ''}>
              {formattedTimestamp}
            </time>
          {/if}
        </p>
      </div>
      <div class="summary-header__title-actions">
        <LoadVexButton />
        {#if store.hasVex && store.suppressedVulnCount > 0}
          <button
            type="button"
            class="suppressed-toggle"
            class:suppressed-toggle--active={store.showSuppressed}
            onclick={() => store.toggleSuppressed()}
            aria-pressed={store.showSuppressed}
            title="Toggle visibility of vulnerabilities suppressed by VEX status (not_affected, false_positive, resolved)"
          >
            {store.showSuppressed ? 'Hide' : 'Show'} suppressed ({store.suppressedVulnCount})
          </button>
        {/if}
      </div>
    </div>
    {#if sbom.vexMetadata}
      <p class="vex-provenance">
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
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
        VEX: <code>{sbom.vexMetadata.sourceFilename}</code>
        {#if formattedVexTimestamp}
          · <time datetime={sbom.vexMetadata.timestamp ?? ''}>
            {formattedVexTimestamp}
          </time>
        {/if}
        {#if sbom.vexMetadata.unmatched > 0}
          <span
            class="vex-provenance__hint"
            title="VEX entries whose `affects[].ref` did not match any component."
          >
            · {sbom.vexMetadata.unmatched.toLocaleString()} unmatched
          </span>
        {/if}
      </p>
    {/if}
  </div>

  <div class="summary-header__row">
    <dl
      class="summary-header__stats"
      class:summary-header__stats--five={store.hasVex}
    >
      <div class="stat">
        <dd class="stat__value">{componentCount}</dd>
        <dt class="stat__label">Components</dt>
      </div>
      <div class="stat">
        <dd class="stat__value">{licenseCount}</dd>
        <dt class="stat__label">Licenses</dt>
      </div>
      <div class="stat">
        <dd class="stat__value">{typeCount}</dd>
        <dt class="stat__label">Types</dt>
      </div>
      <div class="stat">
        <dd class="stat__value">{originatorCount}</dd>
        <dt class="stat__label">Originators</dt>
      </div>
      {#if store.hasVex}
        <div class="stat stat--vuln">
          <dd class="stat__value">{store.liveVulnCount.toLocaleString()}</dd>
          <dt class="stat__label">Vulnerabilities</dt>
        </div>
      {/if}
    </dl>
  </div>
</header>

<style>
  .summary-header {
    display: grid;
    gap: 1.5rem;
    padding: 2rem;
    background: var(--color-surface);
    border: 1px solid var(--color-ink-200);
    border-radius: 12px;
  }
  .summary-header__title-row {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
    flex-wrap: wrap;
  }
  .summary-header__title-text {
    min-width: 0;
    flex: 1 1 auto;
  }
  .summary-header__title-actions {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
    justify-content: flex-end;
  }
  .summary-header__row {
    display: block;
  }
  .summary-header__stats {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 1rem;
    margin: 0;
  }
  .summary-header__stats--five {
    grid-template-columns: repeat(5, minmax(0, 1fr));
  }
  .stat {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    padding: 1rem;
    background: var(--color-ink-50);
    border-radius: 8px;
  }
  .stat--vuln .stat__value {
    color: var(--color-license-proprietary);
  }
  .stat__value {
    margin: 0;
    font-size: 1.875rem;
    font-weight: 600;
    color: var(--color-ink-900);
    font-variant-numeric: tabular-nums;
  }
  .stat__label {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--color-ink-500);
  }
  .vex-provenance {
    margin: 0.375rem 0 0;
    font-size: 0.8125rem;
    color: var(--color-ink-500);
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    flex-wrap: wrap;
  }
  .vex-provenance code {
    font-family: var(--font-mono);
    font-size: 0.78125rem;
    color: var(--color-ink-700);
  }
  .vex-provenance__hint {
    cursor: help;
  }
  .suppressed-toggle {
    appearance: none;
    border: 1px solid var(--color-ink-200);
    background: var(--color-surface);
    border-radius: 8px;
    padding: 0.4rem 0.75rem;
    font-size: 0.8125rem;
    color: var(--color-ink-700);
    cursor: pointer;
    transition: background-color 80ms ease, color 80ms ease;
  }
  .suppressed-toggle:hover {
    background: var(--color-ink-100);
    color: var(--color-ink-900);
  }
  .suppressed-toggle--active {
    background: color-mix(in srgb, var(--color-accent-500) 8%, transparent);
    border-color: color-mix(in srgb, var(--color-accent-500) 35%, transparent);
    color: var(--color-accent-600);
  }
  @media (max-width: 640px) {
    .summary-header__stats,
    .summary-header__stats--five {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
</style>
