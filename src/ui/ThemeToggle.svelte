<script lang="ts">
  import { onMount } from 'svelte';

  // Three states with cycle order: system → light → dark → system.
  // - "system": no `data-theme` attribute → CSS falls back to the
  //   `prefers-color-scheme: dark` media query.
  // - "light" / "dark": stamps `data-theme` on <html> so the explicit
  //   override blocks in app.css take precedence.
  // Persisted to localStorage so the choice survives reloads. The initial
  // value is also pre-applied by an inline script in index.html to avoid
  // a flash of the wrong theme before this component mounts.
  type Theme = 'system' | 'light' | 'dark';
  const STORAGE_KEY = 'blitsbom-theme';

  let theme = $state<Theme>('system');

  function readStored(): Theme {
    try {
      const v = localStorage.getItem(STORAGE_KEY);
      if (v === 'light' || v === 'dark') return v;
    } catch {
      // localStorage unavailable (file:// in some browsers, private mode)
    }
    return 'system';
  }

  function apply(t: Theme): void {
    if (typeof document === 'undefined') return;
    if (t === 'system') {
      document.documentElement.removeAttribute('data-theme');
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {
        // ignore
      }
    } else {
      document.documentElement.dataset.theme = t;
      try {
        localStorage.setItem(STORAGE_KEY, t);
      } catch {
        // ignore
      }
    }
  }

  onMount(() => {
    theme = readStored();
    apply(theme);
  });

  function cycle(): void {
    theme = theme === 'system' ? 'light' : theme === 'light' ? 'dark' : 'system';
    apply(theme);
  }

  const labels: Record<Theme, string> = {
    system: 'System (auto)',
    light: 'Light',
    dark: 'Dark',
  };
</script>

<button
  type="button"
  class="theme-toggle"
  onclick={cycle}
  aria-label={`Theme: ${labels[theme]}. Click to cycle.`}
  title={`Theme: ${labels[theme]} — click to cycle`}
>
  {#if theme === 'light'}
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2" />
      <path d="M12 20v2" />
      <path d="m4.93 4.93 1.41 1.41" />
      <path d="m17.66 17.66 1.41 1.41" />
      <path d="M2 12h2" />
      <path d="M20 12h2" />
      <path d="m6.34 17.66-1.41 1.41" />
      <path d="m19.07 4.93-1.41 1.41" />
    </svg>
  {:else if theme === 'dark'}
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  {:else}
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
    </svg>
  {/if}
</button>

<style>
  .theme-toggle {
    appearance: none;
    border: 1px solid var(--color-ink-200);
    background: var(--color-surface);
    color: var(--color-ink-600);
    border-radius: 8px;
    padding: 0.4rem 0.5rem;
    cursor: pointer;
    line-height: 0;
    transition:
      background-color 80ms ease,
      color 80ms ease,
      border-color 80ms ease;
  }
  .theme-toggle:hover {
    background: var(--color-ink-100);
    color: var(--color-ink-900);
    border-color: var(--color-ink-300);
  }
</style>
