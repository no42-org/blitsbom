<script lang="ts">
  import { store } from '../state/store.svelte';
  import { downloadCsv } from '../export/csv';
  import { exportPdf } from '../export/pdf';

  function onCsv() {
    if (!store.loadedSbom) return;
    downloadCsv(store.filteredComponents, store.loadedSbom.metadata);
  }

  function onPdf() {
    exportPdf();
  }

  function onReset() {
    if (confirm('Discard the loaded SBOM and start over?')) {
      store.reset();
    }
  }
</script>

<div class="toolbar">
  <button type="button" class="btn btn--ghost" onclick={onReset}>
    Load another file
  </button>
  <div class="toolbar__exports">
    <button type="button" class="btn" onclick={onCsv}>Export CSV</button>
    <button type="button" class="btn btn--primary" onclick={onPdf}>
      Export PDF
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
    background: white;
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
