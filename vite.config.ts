import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  base: './',
  plugins: [svelte()],
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
