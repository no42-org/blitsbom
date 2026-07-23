# AGENTS.md

Guidance for AI coding agents working in this repo. Human contributors: see [CONTRIBUTING.md](./CONTRIBUTING.md).

## Commands

Always go through `make` — CI runs the same targets.

```bash
make install      # npm ci
make ci           # what CI runs: build + verify + size-check + smoke + e2e
make verify       # lint + test + purity-check
make test         # vitest run
make dev          # Vite dev server
make report SBOM=bom.json [VERSION=x OUT=report.html VEX=vex.json]  # CI HTML report
```

The **CI report generator** (`src/generator/`) is a second Vite build
(`make build-generator` → `dist-generator/blitsbom-report.mjs`) that imports the
app's own parser from `src/parse` so a report can never disagree with the
drag-and-drop view. It embeds the SBOM into `dist/index.html` and the app
hydrates from that payload (`src/parse/payload.ts`). Keep the generator free of
DOM assumptions; keep the payload reader free of Node assumptions.

Single test file: `npx vitest run src/parse/spdx.test.ts`. Single test: add `-t 'name fragment'`.

## Architecture

A Svelte 5 SPA that compiles to **one self-contained `index.html`** (`vite-plugin-singlefile` inlines JS and CSS), so it must run from a `file://` URL with no server and no network.

Data flows one way:

```
DropZone → parse/load.ts → parse/format-detect.ts → parse/{cyclonedx,spdx}.ts
        → LoadedSbom → state/store.svelte.ts → state/filters.ts (derived)
        → ui/*.svelte
```

- `state/store.svelte.ts` is the single source of truth; `state/filters.ts` holds the pure derivation functions (breakdowns, filtering) it calls.
- `parse/vex.ts` overlays an optional VEX file onto loaded components; `isLive()` decides whether a suppressed entry counts.
- `state/url.ts` mirrors filter state into the query string, so a filtered view is linkable.

## Gotchas

These are the ones that bite:

- **`$state.raw`, not `$state`, for loaded SBOM data.** Svelte 5 deep-proxies every object lazily on read; across the derived chain that freezes the browser on SBOMs with thousands of components. The `opennms-core` fixture (~29 MB, 2839 components) exists to catch this — it is a performance test disguised as a fixture.
- **No network calls, ever.** `make purity-check` fails the build on `fetch`, `XMLHttpRequest`, `sendBeacon` or any analytics SDK in `src/`. The no-phone-home promise is the product, not a preference.
- **Bundle budget: 60 KB gzipped JS**, enforced by `make size-check`. A new dependency usually is not worth it.
- **Both CycloneDX and SPDX** are supported inputs despite the project's framing — check `parse/format-detect.ts` before assuming a shape.

## Conventions

- Conventional Commits, and every commit needs both trailers — `Assisted-by: <Agent>:<model>` and a human `Signed-off-by` via `git commit -s`. See [CONTRIBUTING.md](./CONTRIBUTING.md#dco-sign-off).
- Work starts from an issue; PRs reference it with `Closes #<n>`.
- `main` is protected: land changes via PR, never a direct push.
