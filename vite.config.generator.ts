/*
 * Copyright 2026 Ronny Trommer <ronny@no42.org>
 * SPDX-License-Identifier: MIT
 */
import { defineConfig } from 'vite';
import { builtinModules } from 'node:module';

// Second build, separate from the app: bundle the report generator (which
// imports the real parser from src/parse) into one Node ESM file. Building it
// this way — rather than reimplementing a parser — is what guarantees a
// generated report can never disagree with what the browser's drag-and-drop
// path would show.
//
// Node built-ins stay external; everything under src/ is bundled in so the
// image needs only the single output file.
const externals = new Set([
  ...builtinModules,
  ...builtinModules.map((m) => `node:${m}`),
]);

export default defineConfig({
  build: {
    outDir: 'dist-generator',
    emptyOutDir: true,
    target: 'node20',
    minify: false,
    lib: {
      entry: 'src/generator/cli.ts',
      formats: ['es'],
      fileName: () => 'blitsbom-report.mjs',
    },
    rollupOptions: {
      external: (id) => externals.has(id),
      output: {
        banner: '#!/usr/bin/env node',
      },
    },
  },
});
