<script lang="ts">
  import { loadSbomFile } from '../parse/load';
  import { store } from '../state/store.svelte';

  let dragging = $state(false);
  let busy = $state(false);

  async function handleFile(file: File) {
    busy = true;
    try {
      const result = await loadSbomFile(file);
      if (result.ok) {
        store.setLoaded(result.sbom);
      } else {
        store.setError(result.error);
      }
    } finally {
      busy = false;
    }
  }

  function onPick(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (file) void handleFile(file);
    input.value = '';
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    dragging = false;
    const file = event.dataTransfer?.files?.[0];
    if (file) void handleFile(file);
  }

  function onDragOver(event: DragEvent) {
    event.preventDefault();
    dragging = true;
  }

  function onDragLeave() {
    dragging = false;
  }
</script>

<label
  class="drop-zone"
  class:drop-zone--active={dragging}
  ondragover={onDragOver}
  ondragleave={onDragLeave}
  ondrop={onDrop}
>
  <input
    type="file"
    accept="application/json,.json"
    class="sr-only"
    onchange={onPick}
    disabled={busy}
  />
  <div class="text-center">
    <p class="text-lg font-medium text-ink-800">
      Drop your <code class="font-mono text-base">bom.json</code> here
    </p>
    <p class="mt-2 text-sm text-ink-500">
      or click to browse — files never leave your browser
    </p>
    {#if busy}
      <p class="mt-3 text-sm text-accent-600">Reading…</p>
    {/if}
  </div>
</label>

<style>
  .drop-zone {
    display: flex;
    align-items: center;
    justify-content: center;
    border: 2px dashed var(--color-ink-300);
    border-radius: 12px;
    padding: 4rem 2rem;
    background: white;
    cursor: pointer;
    transition: border-color 120ms ease, background-color 120ms ease;
  }
  .drop-zone:hover {
    border-color: var(--color-ink-400);
  }
  .drop-zone--active {
    border-color: var(--color-accent-500);
    background: color-mix(in srgb, var(--color-accent-500) 4%, transparent);
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
</style>
