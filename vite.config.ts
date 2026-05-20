import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { viteSingleFile } from 'vite-plugin-singlefile';
import pkg from './package.json' with { type: 'json' };

export default defineConfig({
  base: './',
  // viteSingleFile inlines the built JS and CSS into index.html so the
  // air-gapped "double-click index.html via file://" path works in every
  // browser — including Safari, which refuses to load sibling file:// assets
  // for cross-origin reasons under its strict null-origin policy.
  plugins: [svelte(), viteSingleFile()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  build: {
    target: 'es2022',
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        manualChunks: undefined,
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
  },
});
