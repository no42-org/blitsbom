<script lang="ts">
  import { store } from '../state/store.svelte';
  import { downloadCsv } from '../export/csv';
  import { downloadOriginalSbom } from '../export/sbom';

  function onCsv() {
    if (!store.loadedSbom) return;
    downloadCsv(store.filteredComponents, store.loadedSbom.metadata);
  }

  function onDownloadSbom() {
    if (!store.reportSourceText) return;
    downloadOriginalSbom(
      store.reportSourceText,
      store.reportProvenance,
      store.loadedSbom?.metadata ?? null,
    );
  }

  function onReset() {
    if (confirm('Discard the loaded SBOM and start over?')) {
      store.reset();
    }
  }
</script>

<div class="toolbar">
  <!-- A report has no "other file" to go back to; the reset affordance is
       only meaningful for the drop-zone flow. -->
  {#if !store.reportMode}
    <button type="button" class="btn btn--ghost" onclick={onReset}>
      Load another file
    </button>
  {:else}
    <span></span>
  {/if}
  <div class="toolbar__exports">
    {#if store.reportMode && store.reportSourceText}
      <button type="button" class="btn" onclick={onDownloadSbom}>
        Download original SBOM
      </button>
    {/if}
    <button type="button" class="btn btn--primary" onclick={onCsv}>
      Export CSV
    </button>
  </div>
</div>

<style>
  .toolbar {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    justify-content: space-between;
    align-items: center;
  }
  .toolbar__exports {
    display: flex;
    gap: 0.5rem;
  }
  .btn {
    appearance: none;
    border: 1px solid var(--color-ink-200);
    background: var(--color-surface);
    border-radius: 8px;
    padding: 0.5rem 0.875rem;
    font-size: 0.875rem;
    color: var(--color-ink-800);
    cursor: pointer;
  }
  .btn:hover {
    background: var(--color-ink-50);
  }
  .btn--ghost {
    background: transparent;
    border-color: transparent;
    color: var(--color-ink-600);
  }
  .btn--ghost:hover {
    background: var(--color-ink-100);
    color: var(--color-ink-900);
  }
  .btn--primary {
    background: var(--color-accent-500);
    border-color: var(--color-accent-500);
    color: white;
  }
  .btn--primary:hover {
    background: var(--color-accent-600);
    border-color: var(--color-accent-600);
  }
</style>
