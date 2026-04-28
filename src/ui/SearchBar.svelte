<script lang="ts">
  import { store } from '../state/store.svelte';
</script>

<div class="search">
  <input
    type="search"
    placeholder="Search components, versions, licenses…"
    value={store.query}
    oninput={(e) => {
      store.query = (e.currentTarget as HTMLInputElement).value;
      store.syncToUrl();
    }}
    class="search__input"
    autocomplete="off"
    spellcheck="false"
  />
  {#if store.query.length > 0}
    <button
      type="button"
      class="search__clear"
      onclick={() => {
        store.query = '';
        store.syncToUrl();
      }}
      aria-label="Clear search"
    >
      Clear
    </button>
  {/if}
</div>

<style>
  .search {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex: 1 1 20rem;
    min-width: 14rem;
  }
  .search__input {
    flex: 1;
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--color-ink-200);
    border-radius: 8px;
    background: white;
    font-size: 0.9375rem;
    color: var(--color-ink-900);
  }
  .search__input::placeholder {
    color: var(--color-ink-400);
  }
  .search__clear {
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--color-ink-200);
    border-radius: 8px;
    background: white;
    font-size: 0.875rem;
    color: var(--color-ink-600);
    cursor: pointer;
  }
  .search__clear:hover {
    background: var(--color-ink-50);
  }
</style>
