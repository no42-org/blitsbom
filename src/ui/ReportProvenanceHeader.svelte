<script lang="ts">
  import { store } from '../state/store.svelte';

  // Release provenance for a CI-generated report. Everything here is either
  // supplied by the pipeline (which the SBOM cannot know) or derived from the
  // embedded source. Absent fields are omitted, never shown as placeholders.
  const p = $derived(store.reportProvenance);
  const meta = $derived(store.loadedSbom?.metadata ?? null);

  const project = $derived(p?.project ?? meta?.projectName ?? null);
  const version = $derived(p?.version ?? meta?.productVersion ?? null);

  const formatLabel = $derived(
    meta
      ? meta.sbomFormat === 'CycloneDX-1.x'
        ? `CycloneDX ${meta.specVersion}`
        : meta.specVersion
      : null,
  );

  function formatTimestamp(iso: string | null | undefined): string | null {
    if (!iso) return null;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC');
  }

  const sbomTimestamp = $derived(formatTimestamp(meta?.timestamp));
  const builtAt = $derived(formatTimestamp(p?.builtAt));
</script>

{#if p}
  <section class="provenance" aria-label="Release provenance">
    <div class="provenance__head">
      <span class="provenance__badge">Release SBOM report</span>
      {#if project}
        <span class="provenance__title">
          {project}
          {#if version}<span class="provenance__version">{version}</span>{/if}
        </span>
      {/if}
    </div>

    <dl class="provenance__grid">
      {#if formatLabel}
        <div class="provenance__item">
          <dt>SBOM</dt>
          <dd>
            {formatLabel}{#if meta?.sbomTool} · {meta.sbomTool}{/if}{#if sbomTimestamp}
              · <time datetime={meta?.timestamp ?? ''}>{sbomTimestamp}</time>
            {/if}
          </dd>
        </div>
      {/if}

      <div class="provenance__item">
        <dt>Source digest</dt>
        <dd>
          <code
            class="provenance__digest"
            title={p.sourceFilename
              ? `SHA-256 of ${p.sourceFilename}`
              : 'SHA-256 of the source SBOM'}>{p.sourceDigest}</code
          >
          {#if p.sourceFilename}
            <span class="provenance__file">({p.sourceFilename})</span>
          {/if}
        </dd>
      </div>

      {#if p.vexDigest}
        <div class="provenance__item">
          <dt>VEX digest</dt>
          <dd>
            <code class="provenance__digest">{p.vexDigest}</code>
            {#if p.vexFilename}
              <span class="provenance__file">({p.vexFilename})</span>
            {/if}
          </dd>
        </div>
      {/if}

      {#if p.commit}
        <div class="provenance__item">
          <dt>Commit</dt>
          <dd><code>{p.commit}</code></dd>
        </div>
      {/if}

      {#if builtAt}
        <div class="provenance__item">
          <dt>Built</dt>
          <dd><time datetime={p.builtAt ?? ''}>{builtAt}</time></dd>
        </div>
      {/if}

      {#if p.buildUrl}
        <div class="provenance__item">
          <dt>CI run</dt>
          <dd>
            <a href={p.buildUrl} target="_blank" rel="noopener noreferrer"
              >{p.buildUrl}</a
            >
          </dd>
        </div>
      {/if}
    </dl>

    <p class="provenance__note">
      Generated in CI. This file makes no network requests — open it offline.
    </p>
  </section>
{/if}

<style>
  .provenance {
    display: grid;
    gap: 1rem;
    padding: 1.5rem 2rem;
    background: color-mix(in srgb, var(--color-accent-500) 5%, var(--color-surface));
    border: 1px solid color-mix(in srgb, var(--color-accent-500) 25%, transparent);
    border-radius: 12px;
  }
  .provenance__head {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex-wrap: wrap;
  }
  .provenance__badge {
    font-size: 0.6875rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--color-accent-600);
    background: color-mix(in srgb, var(--color-accent-500) 12%, transparent);
    padding: 0.25rem 0.5rem;
    border-radius: 6px;
    white-space: nowrap;
  }
  .provenance__title {
    font-size: 1rem;
    font-weight: 600;
    color: var(--color-ink-900);
  }
  .provenance__version {
    font-weight: 500;
    color: var(--color-ink-500);
  }
  .provenance__grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 22rem), 1fr));
    gap: 0.75rem 2rem;
    margin: 0;
  }
  .provenance__item {
    display: grid;
    gap: 0.125rem;
    min-width: 0;
  }
  .provenance__item dt {
    font-size: 0.6875rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--color-ink-500);
  }
  .provenance__item dd {
    margin: 0;
    font-size: 0.8125rem;
    color: var(--color-ink-800);
    overflow-wrap: anywhere;
  }
  .provenance__digest,
  .provenance__item code {
    font-family: var(--font-mono);
    font-size: 0.78125rem;
    color: var(--color-ink-700);
  }
  .provenance__file {
    color: var(--color-ink-500);
  }
  .provenance__grid a {
    color: var(--color-accent-600);
    text-decoration: none;
    overflow-wrap: anywhere;
  }
  .provenance__grid a:hover {
    text-decoration: underline;
  }
  .provenance__note {
    margin: 0;
    font-size: 0.75rem;
    color: var(--color-ink-500);
  }
</style>
