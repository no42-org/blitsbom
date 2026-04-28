# blitsbom

A zero-install, browser-only viewer for [CycloneDX](https://cyclonedx.org/) SBOM files. Drop a `bom.json`, get a clean searchable view of your dependencies, hand it to legal as a CSV or PDF.

> **Privacy:** every byte stays in your browser. No upload, no phone-home, no telemetry. The page works with the network cable unplugged.

## Quick start (Docker)

The fastest way to run blitsbom in your own environment — Alpine-based image, ~50 MB, no runtime dependencies.

### Pull a published image from GHCR

```bash
# Stable release
docker run --rm -p 8080:80 ghcr.io/no42-org/blitsbom:latest

# A specific version
docker run --rm -p 8080:80 ghcr.io/no42-org/blitsbom:0.1.0

# Bleeding-edge build from main (release-candidate)
docker run --rm -p 8080:80 ghcr.io/no42-org/blitsbom:rc
```

Then open <http://localhost:8080> and drop your `bom.json` / `sbom.json` onto the page.

### Build it yourself

```bash
make docker-build   # build the local image
make docker-run     # serve it on http://localhost:8080
```

Equivalent without Make:

```bash
docker build -t blitsbom:latest .
docker run --rm -p 8080:80 blitsbom:latest
```

The image is a static nginx serving the built bundle — no telemetry, no outbound calls, safe behind air-gapped firewalls.

### Image tags

| Tag                    | Source                        | When pushed                 |
|------------------------|-------------------------------|-----------------------------|
| `:latest`              | latest tagged release         | on `vX.Y.Z` tag             |
| `:X.Y.Z`, `:X.Y`       | the same release, semver pins | on `vX.Y.Z` tag             |
| `:rc`                  | tip of `main`                 | on every push to `main`     |
| `:main-<short-sha>`    | a specific main commit        | on every push to `main`     |

## Three install paths

### 1. Hosted (zero install)

Open the GitHub Pages site for this repository — drop your `bom.json` onto the page. Done.

### 2. Self-host (drop into any static server)

Each tagged release publishes a `dist.zip` of the built static files.

```bash
# Grab the latest release artifact
gh release download --pattern dist.zip

# Or extract into a webroot
unzip dist.zip -d /var/www/blitsbom
```

Any static server works: nginx, Apache, S3 + CloudFront, Caddy, `python -m http.server`, GitHub Pages on your own repo. blitsbom uses relative asset paths, so it runs from any subdirectory.

### 3. Air-gapped (double-click `index.html`)

For regulated or offline environments:

```bash
unzip dist.zip
open dist/index.html   # macOS
xdg-open dist/index.html  # Linux
```

It runs straight from a `file://` URL with no server. The bundle includes everything it needs — no CDNs, no fetched fonts, no external resources.

## Supported input

| Format | Versions | Status |
|--------|----------|--------|
| CycloneDX JSON | 1.4 / 1.5 / 1.6 | Supported |
| SPDX JSON | 2.x (2.2 / 2.3) | Supported |
| CycloneDX 1.0 – 1.3 | — | Rejected with a clear error (open an issue if you need it) |
| CycloneDX XML | — | Not yet — open an issue |
| SPDX 3.x | — | Not yet — open an issue |

Format is auto-detected from the document's top-level keys (`bomFormat: "CycloneDX"` vs `spdxVersion: "SPDX-2.x"`); no format selector required.

### License classification

The donut chart classifies each component's primary license into one of six categories, sourced from the **[Free Software Foundation's license list](https://www.gnu.org/licenses/license-list.html)**:

| Category | Color | Examples |
|----------|-------|----------|
| Public Domain | light green | CC0-1.0, Unlicense, WTFPL |
| Permissive | green | Apache-2.0, MIT, BSD-2/3-Clause, ISC, Zlib |
| Copyleft | yellow | LGPL-2.1/3.0, MPL-2.0, EPL-2.0, CDDL-1.0 |
| Strong Copyleft | orange | GPL-2.0/3.0, AGPL-3.0 |
| Proprietary | red | unknown licenses, free-form names, SPDX expressions |
| Undeclared | grey | NOASSERTION, missing, empty |

Click a donut segment (or a legend row) to filter the table to that category, then drill down to individual licenses inside the category. Disputes about a placement are resolved by linking the FSF page for that license — see `src/license/classify.ts` for the source.

### License expression handling

CycloneDX and SPDX both accept compound expressions like `(MIT OR Apache-2.0)` as license entries. **In v1, blitsbom shows expressions verbatim and classifies them as `Proprietary`** (since they aren't single SPDX ids and can't be reliably bucketed). Single-id licenses work as you'd expect.

### LicenseRef-* resolution (SPDX)

SPDX documents can use `LicenseRef-*` identifiers backed by the document's `hasExtractedLicensingInfos` block. blitsbom resolves these by matching the actual extracted text against signature regexes for ~13 common licenses (Apache-2.0, MIT, BSD-*, GPL-*, LGPL-*, AGPL-3.0, MPL-2.0, EPL-*, CDDL-1.0, ISC), falling back to canonical license URLs in `seeAlsos` and to encoded ids in the LicenseRef name itself. Anything that can't be recognized stays as a verbatim name and classifies as Proprietary.

## Features

- Drag-and-drop or pick a `bom.json` / `sbom.json` (CycloneDX or SPDX)
- Reading-progress indicator for large SBOMs (`Reading X.X MB / Y.Y MB` → `Parsing…`)
- Summary header: total components, distinct licenses, distinct types, vulnerability count
- License **donut** chart with FSF-classified categories (Permissive / Copyleft / Strong Copyleft / Public Domain / Proprietary / Undeclared)
- Click a donut segment → filter the table to that category, drill down to individual licenses inside it
- Sortable component table with name / version / license / scope / type / purl, paginated for large SBOMs (500 rows visible by default with show-more)
- Free-text search across name, version, license, scope, type, group, publisher, description, purl
- Click-to-toggle filter chips (category, license, scope, type)
- Filter state encoded in the URL — copy the address to share a view (`?category=permissive&license=Apache-2.0`)
- CSV export of the filtered view (RFC 4180, Excel-compatible)
- PDF export via the browser's native print dialog (clean print stylesheet, summary header doubles as the cover page)

## Developer workflow

```bash
make install     # npm install
make dev         # vite dev server
make build       # build static dist/
make test        # vitest
make verify      # lint + tests + network-purity check
make size-check  # fail if gzipped JS exceeds 60 KB
make smoke       # headless Chromium loading dist/index.html via file://
make dist-zip    # build and zip dist/ as dist.zip for self-hosters
```

CI invokes `make` targets, never the underlying npm scripts directly, so the developer and CI commands stay in sync.

## Deployment

- Pushing to `main` triggers `.github/workflows/pages.yml`, which builds, runs `make verify`, runs the size and `file://` smoke checks, and publishes `dist/` to GitHub Pages.
- Pushing to `main` also triggers `.github/workflows/docker.yml`, which builds and pushes `ghcr.io/no42-org/blitsbom:rc` (and `:main-<short-sha>`).
- Pushing a tag matching `v*` triggers `.github/workflows/release.yml` (produces `dist.zip` and attaches it to the GitHub Release) and `.github/workflows/docker.yml` (publishes `:latest`, `:X.Y.Z`, `:X.Y` to GHCR).

All third-party Actions are pinned to immutable commit SHAs and kept current by Dependabot.

See **[RELEASING.md](./RELEASING.md)** for the full release workflow — versioning policy, cutting a release, hotfixes, and troubleshooting.

## Project layout

```
src/
  parse/      CycloneDX + SPDX parsers, format detection, LicenseRef resolution
  license/    FSF-sourced classification table
  state/      Svelte store, filter combinator (incl. category facet), URL state
  ui/         Svelte components (AppShell, DropZone, SummaryHeader,
              LicenseDonut, LicenseDrilldown, ComponentsTable, ...)
  export/     CSV writer, PDF print trigger
  styles/     Tailwind v4 CSS entry (@theme static design tokens) + print stylesheet
scripts/      size-check, purity-check, file-smoke, e2e
samples/      Real-world SBOMs used as test corpus (not bundled into dist/)
```

## License

MIT — see [LICENSE](./LICENSE).
