<script lang="ts">
  import { onMount } from 'svelte';
  import { parseAsVex, readFileAsText } from '../parse/load';
  import { store } from '../state/store.svelte';

  let busy = $state(false);
  let error = $state<string | null>(null);
  let unmatched = $state(0);

  type OsTab = 'macos' | 'linux' | 'windows';
  let helpDialog = $state<HTMLDialogElement | undefined>();
  let activeOs = $state<OsTab>('macos');

  onMount(() => {
    // Pick the most likely OS for the visitor as the default tab.
    if (typeof navigator !== 'undefined') {
      const ua = navigator.userAgent.toLowerCase();
      if (ua.includes('windows')) activeOs = 'windows';
      else if (ua.includes('mac')) activeOs = 'macos';
      else activeOs = 'linux';
    }
  });

  async function handleFile(file: File): Promise<void> {
    if (!store.loadedSbom) {
      error = 'Load an SBOM first, then add a VEX file.';
      return;
    }
    busy = true;
    error = null;
    try {
      const text = await readFileAsText(file);
      // Force-VEX path — the user explicitly signaled "merge vulns into the
      // loaded SBOM" by clicking this button. The dropped file's
      // components[] (if any) are ignored; only vulnerabilities[] is used.
      const result = parseAsVex(text, store.loadedSbom, file.name);
      if (result.kind === 'vex') {
        store.applyVex(result.sbom);
        unmatched = result.unmatched;
      } else {
        error = result.error;
      }
    } catch (err) {
      error = `Could not read file: ${(err as Error).message}`;
    } finally {
      busy = false;
    }
  }

  function onPick(event: Event): void {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (file) void handleFile(file);
    input.value = '';
  }

  function openHelp(): void {
    helpDialog?.showModal();
  }
  function closeHelp(): void {
    helpDialog?.close();
  }
</script>

<div class="vex-load">
  <label class="vex-load__btn" class:vex-load__btn--busy={busy}>
    <input
      type="file"
      accept="application/json,.json"
      class="sr-only"
      onchange={onPick}
      disabled={busy}
    />
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
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
    {#if store.hasVex}
      Replace VEX file
    {:else}
      Load VEX file
    {/if}
  </label>
  <button
    type="button"
    class="vex-help-btn"
    onclick={openHelp}
    aria-label="About VEX files"
    title="What is a VEX file?"
  >
    ?
  </button>
  {#if error}
    <p class="vex-load__error">{error}</p>
  {:else if unmatched > 0}
    <p
      class="vex-load__hint"
      title="VEX entries whose `affects[].ref` did not match any component in the loaded SBOM."
    >
      {unmatched.toLocaleString()} unmatched
    </p>
  {/if}
</div>

<dialog
  bind:this={helpDialog}
  class="help-dialog"
  aria-labelledby="vex-help-title"
>
  <header class="help-dialog__header">
    <h2 id="vex-help-title">About VEX files</h2>
    <button
      type="button"
      class="help-dialog__close"
      onclick={closeHelp}
      aria-label="Close"
    >×</button>
  </header>

  <section class="help-dialog__section">
    <p>
      <strong>VEX</strong> (Vulnerability Exploitability eXchange) is a
      companion to your SBOM that lists which CVEs actually apply to your
      software and each one's exploitability status — beyond just listing
      dependencies. blitsbom merges that data into the loaded SBOM
      <strong>locally in your browser</strong> — no upload, no network
      calls.
    </p>
  </section>

  <section class="help-dialog__section">
    <h3>What we accept</h3>
    <ul>
      <li>CycloneDX VEX (CDX 1.4 / 1.5 / 1.6)</li>
      <li>A CycloneDX SBOM with a populated <code>vulnerabilities[]</code> array</li>
    </ul>
    <p class="help-dialog__muted">
      Not yet supported: OpenVEX, CSAF VEX, native Grype/Trivy JSON, SPDX VEX.
    </p>
  </section>

  <section class="help-dialog__section">
    <h3>Generate a VEX from your SBOM</h3>
    <p>
      Run any of the scanners below against your SBOM. Each one reads
      the SBOM and writes a CycloneDX-format VEX you can drop into
      blitsbom.
    </p>

    <div class="tabs" role="tablist" aria-label="Operating system">
      {#each [['macos', 'macOS'], ['linux', 'Linux'], ['windows', 'Windows']] as [id, label] (id)}
        <button
          type="button"
          role="tab"
          class="tabs__tab"
          class:tabs__tab--active={activeOs === id}
          aria-selected={activeOs === id}
          onclick={() => (activeOs = id as OsTab)}
        >{label}</button>
      {/each}
    </div>

    {#if activeOs === 'macos'}
      <p class="help-dialog__step">Install one of these via Homebrew:</p>
      <pre><code>brew install anchore/grype/grype
brew install aquasecurity/trivy/trivy
brew install osv-scanner</code></pre>
    {:else if activeOs === 'linux'}
      <p class="help-dialog__step">Install one of these (Debian/Ubuntu shown):</p>
      <pre><code># Anchore Grype
curl -sSfL https://raw.githubusercontent.com/anchore/grype/main/install.sh \
  | sh -s -- -b /usr/local/bin

# Aqua Trivy (apt repo)
sudo apt install -y trivy

# Google OSV-Scanner (Go toolchain)
go install github.com/google/osv-scanner/cmd/osv-scanner@latest</code></pre>
    {:else}
      <p class="help-dialog__step">Install one of these via Scoop or winget:</p>
      <pre><code>scoop install grype
scoop install trivy
winget install Google.OSVScanner</code></pre>
    {/if}

    <p class="help-dialog__step">
      Generate the VEX (the same command works on all platforms):
    </p>
    <pre><code># Pick whichever scanner you installed
grype sbom:./bom.json -o cyclonedx-json &gt; vex.json
trivy sbom ./bom.json --format cyclonedx --output vex.json
osv-scanner --sbom=./bom.json --format=cyclonedx &gt; vex.json</code></pre>

    <p class="help-dialog__muted">
      Then click <strong>Load VEX file</strong> and pick the
      <code>vex.json</code> you just produced.
    </p>
  </section>
</dialog>

<style>
  .vex-load {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
  .vex-load__btn {
    appearance: none;
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    border: 1px solid var(--color-ink-200);
    background: var(--color-surface);
    border-radius: 8px;
    padding: 0.4rem 0.75rem;
    font-size: 0.8125rem;
    color: var(--color-ink-800);
    cursor: pointer;
    transition: background-color 80ms ease, border-color 80ms ease;
  }
  .vex-load__btn:hover {
    background: var(--color-ink-100);
    border-color: var(--color-ink-300);
  }
  .vex-load__btn--busy {
    opacity: 0.6;
    cursor: wait;
  }
  .vex-help-btn {
    appearance: none;
    width: 1.5rem;
    height: 1.5rem;
    border: 1px solid var(--color-ink-200);
    background: var(--color-surface);
    border-radius: 999px;
    color: var(--color-ink-600);
    cursor: pointer;
    font-size: 0.8125rem;
    font-weight: 600;
    line-height: 1;
    padding: 0;
    transition: background-color 80ms ease, color 80ms ease, border-color 80ms ease;
  }
  .vex-help-btn:hover {
    background: var(--color-ink-100);
    color: var(--color-ink-900);
    border-color: var(--color-ink-300);
  }
  .vex-load__error {
    margin: 0;
    font-size: 0.8125rem;
    color: var(--color-license-proprietary);
  }
  .vex-load__hint {
    margin: 0;
    font-size: 0.8125rem;
    color: var(--color-ink-500);
    cursor: help;
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

  /* ---------- Help dialog ---------- */
  .help-dialog {
    /* Explicit viewport centering — relying on the UA default "margin:
       auto" leaves it top-left in some engines once any other rule sets
       margin or inset on `dialog`. */
    position: fixed;
    inset: 0;
    margin: auto;
    width: min(46rem, 92vw);
    max-height: 85vh;
    padding: 0;
    border: 1px solid var(--color-ink-200);
    border-radius: 12px;
    background: var(--color-surface);
    color: var(--color-ink-800);
    box-shadow: 0 24px 48px -12px rgb(0 0 0 / 0.25);
  }
  .help-dialog::backdrop {
    background: rgb(0 0 0 / 0.5);
  }
  .help-dialog__header {
    position: sticky;
    top: 0;
    background: var(--color-surface);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 1.25rem 1.5rem;
    border-bottom: 1px solid var(--color-ink-100);
    z-index: 1;
  }
  .help-dialog__header h2 {
    margin: 0;
    font-size: 1.0625rem;
    font-weight: 600;
    color: var(--color-ink-900);
  }
  .help-dialog__close {
    appearance: none;
    border: 0;
    background: transparent;
    color: var(--color-ink-500);
    font-size: 1.5rem;
    line-height: 1;
    padding: 0 0.25rem;
    cursor: pointer;
  }
  .help-dialog__close:hover {
    color: var(--color-ink-900);
  }
  .help-dialog__section {
    padding: 1rem 1.5rem;
    border-bottom: 1px solid var(--color-ink-100);
  }
  .help-dialog__section:last-of-type {
    border-bottom: 0;
  }
  .help-dialog__section h3 {
    margin: 0 0 0.5rem;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--color-ink-500);
  }
  .help-dialog__section p {
    margin: 0 0 0.75rem;
    line-height: 1.55;
    font-size: 0.875rem;
    color: var(--color-ink-700);
  }
  .help-dialog__section ul {
    margin: 0 0 0.75rem;
    padding-left: 1.25rem;
    font-size: 0.875rem;
    color: var(--color-ink-700);
    line-height: 1.55;
  }
  .help-dialog__section code {
    font-family: var(--font-mono);
    font-size: 0.85em;
    color: var(--color-ink-900);
  }
  .help-dialog__muted {
    color: var(--color-ink-500) !important;
    font-size: 0.8125rem !important;
  }
  .help-dialog__step {
    margin-top: 0.875rem !important;
    margin-bottom: 0.375rem !important;
  }
  .help-dialog pre {
    margin: 0 0 0.75rem;
    padding: 0.875rem 1rem;
    background: var(--color-ink-50);
    border: 1px solid var(--color-ink-100);
    border-radius: 8px;
    overflow-x: auto;
    font-size: 0.8125rem;
    line-height: 1.5;
  }
  .help-dialog pre code {
    background: transparent;
    padding: 0;
    color: var(--color-ink-800);
  }

  /* OS tabs */
  .tabs {
    display: inline-flex;
    border: 1px solid var(--color-ink-200);
    border-radius: 8px;
    overflow: hidden;
    margin: 0 0 0.625rem;
  }
  .tabs__tab {
    appearance: none;
    border: 0;
    background: transparent;
    padding: 0.4rem 0.875rem;
    font-size: 0.8125rem;
    color: var(--color-ink-700);
    cursor: pointer;
    border-right: 1px solid var(--color-ink-200);
  }
  .tabs__tab:last-child {
    border-right: 0;
  }
  .tabs__tab:hover {
    background: var(--color-ink-100);
  }
  .tabs__tab--active {
    background: color-mix(in srgb, var(--color-accent-500) 12%, transparent);
    color: var(--color-accent-600);
    font-weight: 600;
  }
</style>
