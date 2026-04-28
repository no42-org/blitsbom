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

## Two install paths

### 1. Self-host (drop into any static server)

Each tagged release publishes a `dist.zip` of the built static files plus a `dist.zip.sha512` checksum.

```bash
# Grab the latest release artifact + checksum
gh release download --pattern 'dist.zip*'

# Verify integrity (exits non-zero if the bundle was tampered with)
sha512sum -c dist.zip.sha512

# Extract into a webroot
unzip dist.zip -d /var/www/blitsbom
```

Any static server works: nginx, Apache, S3 + CloudFront, Caddy, `python -m http.server`. blitsbom uses relative asset paths, so it runs from any subdirectory.

### 2. Air-gapped (double-click `index.html`)

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

## Vulnerabilities (VEX)

After loading an SBOM, you can optionally drop a [CycloneDX VEX](https://cyclonedx.org/capabilities/vex/) file (or any CycloneDX document with a populated `vulnerabilities[]` array) on top to overlay vulnerability data on the components. **VEX is purely additive — the SBOM-only flow stays exactly the same when no VEX is loaded.**

Generate a compatible VEX from any SBOM:

```bash
# Anchore Grype — input: any SBOM; output: CycloneDX with vulnerabilities[]
grype sbom:./bom.json -o cyclonedx-json > vex.json

# Aqua Trivy
trivy sbom ./bom.json --format cyclonedx --output vex.json

# Google OSV-Scanner
osv-scanner --sbom=./bom.json --format=cyclonedx > vex.json
```

Drop the file via the **Load vulnerabilities (VEX)…** button next to the summary header. blitsbom joins each vulnerability to a component by canonical purl (with `bom-ref` as a fallback) and surfaces:

- A fifth summary tile with the live vulnerability count.
- A severity-coloured badge column in the components table — click any badge to drill down to per-component CVE detail.
- A severity facet in the filter bar (`critical / high / medium / low / unknown / none`), URL-encoded as `?severity=…`.
- Provenance info (VEX filename + timestamp) above the summary tiles, plus an "N unmatched" hint when a VEX entry's `affects[].ref` doesn't resolve to any component.

VEX `analysis.state` is honored: entries marked `not_affected`, `false_positive`, or `resolved` are hidden by default. A "Show suppressed (N)" toggle reveals them when present.

Everything stays offline — no network call, no online lookup against OSV.dev or NVD. The existing `purity-check` build guard still enforces this.

## Features

- Drag-and-drop or pick a `bom.json` / `sbom.json` (CycloneDX or SPDX)
- Reading-progress indicator for large SBOMs (`Reading X.X MB / Y.Y MB` → `Parsing…`)
- Summary header: total components, distinct licenses, distinct types, vulnerability count
- License **donut** chart with FSF-classified categories (Permissive / Copyleft / Strong Copyleft / Public Domain / Proprietary / Undeclared)
- Click a donut segment → filter the table to that category, drill down to individual licenses inside it
- Sortable component table with name / version / license / scope / type / purl, paginated for large SBOMs (500 rows visible by default with show-more)
- Free-text search across name, version, license, scope, type, group, publisher, description, purl
- Click-to-toggle filter chips (category, license, scope, type, severity)
- Optional VEX overlay: drop a CycloneDX VEX file to attach CVE data to components, with severity badges, drilldown, and severity filter (see Vulnerabilities (VEX) above)
- Filter state encoded in the URL — copy the address to share a view (`?category=permissive&license=Apache-2.0&severity=high`)
- CSV export of the filtered view (RFC 4180, Excel-compatible)

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

- Pushing to `main` triggers `.github/workflows/docker.yml`, which builds and pushes `ghcr.io/no42-org/blitsbom:rc` (and `:main-<short-sha>`).
- Pushing a tag matching `v*` triggers `.github/workflows/release.yml` (produces `dist.zip` + `dist.zip.sha512` and attaches them to the GitHub Release) and `.github/workflows/docker.yml` (publishes `:latest`, `:X.Y.Z`, `:X.Y` to GHCR).

All third-party Actions are pinned to immutable commit SHAs and kept current by Dependabot.

See **[RELEASING.md](./RELEASING.md)** for the full release workflow — versioning policy, cutting a release, hotfixes, and troubleshooting.

## Project layout

```
src/
  parse/      CycloneDX + SPDX parsers, format detection, LicenseRef resolution,
              VEX merge + purl canonicalization
  license/    FSF-sourced classification table
  state/      Svelte store, filter combinator (incl. category facet), URL state
  ui/         Svelte components (AppShell, DropZone, SummaryHeader,
              LicenseDonut, LicenseDrilldown, ComponentsTable, ...)
  export/     CSV writer
  styles/     Tailwind v4 CSS entry (@theme static design tokens)
scripts/      size-check, purity-check, file-smoke, e2e
samples/      Real-world SBOMs used as test corpus (not bundled into dist/)
```

## License

MIT — see [LICENSE](./LICENSE).
