<script lang="ts">
  import type { LoadedSbom } from '../types';

  interface Props {
    sbom: LoadedSbom;
    componentCount: number;
    licenseCount: number;
    typeCount: number;
    vulnCount: number;
  }

  let { sbom, componentCount, licenseCount, typeCount, vulnCount }: Props =
    $props();

  const formattedTimestamp = $derived(formatTimestamp(sbom.metadata.timestamp));

  function formatTimestamp(iso: string | null): string | null {
    if (!iso) return null;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC');
  }
</script>

<header class="summary-header">
  <div class="summary-header__title">
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

  <dl class="summary-header__stats">
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
      <dd class="stat__value">{vulnCount}</dd>
      <dt class="stat__label">Vulnerabilities</dt>
    </div>
  </dl>
</header>

<style>
  .summary-header {
    display: grid;
    gap: 1.5rem;
    padding: 2rem;
    background: white;
    border: 1px solid var(--color-ink-200);
    border-radius: 12px;
  }
  .summary-header__stats {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 1rem;
    margin: 0;
  }
  .stat {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    padding: 1rem;
    background: var(--color-ink-50);
    border-radius: 8px;
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
  @media (max-width: 640px) {
    .summary-header__stats {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
</style>
