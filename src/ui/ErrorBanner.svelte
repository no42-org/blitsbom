<script lang="ts">
  import { store } from '../state/store.svelte';

  interface Props {
    message: string;
  }
  let { message }: Props = $props();
</script>

<div class="banner" role="alert">
  <div class="banner__body">
    <p class="banner__title">Could not load that file</p>
    <p class="banner__detail">{message}</p>
  </div>
  <button type="button" class="banner__action" onclick={() => store.setError('')}>
    Dismiss
  </button>
</div>

<style>
  .banner {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
    padding: 1rem 1.25rem;
    background: #fef2f2;
    border: 1px solid #fecaca;
    border-radius: 12px;
    color: #7f1d1d;
  }
  .banner__title {
    margin: 0;
    font-weight: 600;
  }
  .banner__detail {
    margin: 0.25rem 0 0;
    font-size: 0.875rem;
  }
  .banner__action {
    appearance: none;
    background: transparent;
    border: 1px solid #fecaca;
    border-radius: 8px;
    padding: 0.375rem 0.75rem;
    color: inherit;
    font-size: 0.875rem;
    cursor: pointer;
  }
  .banner__action:hover {
    background: #fee2e2;
  }
</style>
