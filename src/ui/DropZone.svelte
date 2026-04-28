<script lang="ts">
  import { loadSbomFile } from '../parse/load';
  import { store } from '../state/store.svelte';

  let dragging = $state(false);

  async function handleFile(file: File) {
    store.setIngestReading(0, file.size);
    const result = await loadSbomFile(file, {
      onReadProgress: (loaded, total) => store.setIngestReading(loaded, total),
      onParseStart: () => store.setIngestParsing(),
    });
    if (result.ok) {
      store.setLoaded(result.sbom);
    } else {
      store.setError(result.error);
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

  const busy = $derived(
    store.ingestState === 'reading' || store.ingestState === 'parsing',
  );

  function formatMb(bytes: number): string {
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }
</script>

<label
  class="drop-zone"
  class:drop-zone--active={dragging}
  class:drop-zone--busy={busy}
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
    {#if store.ingestState === 'reading'}
      <p class="text-lg font-medium text-ink-800">Reading file…</p>
      <p class="mt-2 text-sm text-ink-500">
        {formatMb(store.ingestBytesLoaded)} / {formatMb(store.ingestBytesTotal)}
      </p>
      {#if store.ingestBytesTotal > 0}
        <div class="progress" aria-hidden="true">
          <div
            class="progress__bar"
            style={`width: ${Math.min(100, (store.ingestBytesLoaded / store.ingestBytesTotal) * 100)}%`}
          ></div>
        </div>
      {/if}
    {:else if store.ingestState === 'parsing'}
      <p class="text-lg font-medium text-ink-800">Parsing…</p>
      <p class="mt-2 text-sm text-ink-500">
        Building component model — large SBOMs may take a moment.
      </p>
    {:else}
      <p class="text-lg font-medium text-ink-800">
        Drop your SBOM here
      </p>
      <p class="mt-2 text-sm text-ink-500">
        CycloneDX or SPDX JSON · click to browse · files never leave your browser
      </p>
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
  .drop-zone--busy {
    cursor: wait;
    border-color: var(--color-accent-500);
    background: color-mix(in srgb, var(--color-accent-500) 3%, transparent);
  }
  .progress {
    margin: 0.75rem auto 0;
    width: 18rem;
    max-width: 80%;
    height: 0.5rem;
    background: var(--color-ink-100);
    border-radius: 4px;
    overflow: hidden;
  }
  .progress__bar {
    height: 100%;
    background: var(--color-accent-500);
    transition: width 80ms linear;
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
