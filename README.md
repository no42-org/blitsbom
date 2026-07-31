# <img src="https://raw.githubusercontent.com/no42-org/blitsbom/main/assets/logo-wordmark.svg" alt="blitsbom" width="192" height="44">

[![CI](https://github.com/no42-org/blitsbom/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/no42-org/blitsbom/actions/workflows/ci.yml) [![Latest release](https://img.shields.io/github/v/release/no42-org/blitsbom?sort=semver&logo=github)](https://github.com/no42-org/blitsbom/releases/latest) [![License: MIT](https://img.shields.io/badge/license-MIT-blue)](./LICENSE)

A zero-install viewer for [CycloneDX](https://cyclonedx.org/) and [SPDX](https://spdx.dev/) SBOM files. Drop a `bom.json`, get a clean searchable view of your dependencies, hand it to legal as a CSV or PDF.

**Looking for the GitHub Action?** It turns an SBOM into a single self-contained HTML report you can attach to a release — jump to [Release reports (CI)](#release-reports-ci).

> **Privacy:** every byte stays in your browser. No upload, no phone-home, no telemetry. The page works with the network cable unplugged.

## Quick start

### Just run it locally

The fastest way to run blitsbom in your own environment.

```plain
# Grab the latest release artifact + checksum
mkdir blitsbom && cd blitsbom
curl -fLO https://github.com/no42-org/blitsbom/releases/latest/download/dist.zip
curl -fLO https://github.com/no42-org/blitsbom/releases/latest/download/dist.zip.sha512

# Verify integrity (exits non-zero if the bundle was tampered with)
sha512sum -c dist.zip.sha512
```

```plain
unzip dist.zip
open index.html      # macOS
xdg-open index.html  # Linux
```

It runs straight from a `file://` URL with no server. The bundle includes everything it needs — no CDNs, no fetched fonts, no external resources.

### Run in a container

```bash
# Stable release
docker run --rm -p 8080:3000 ghcr.io/no42-org/blitsbom:latest

# A specific version
docker run --rm -p 8080:3000 ghcr.io/no42-org/blitsbom:0.6.1

# Bleeding-edge build from main (release-candidate)
docker run --rm -p 8080:3000 ghcr.io/no42-org/blitsbom:rc
```

Then open <http://localhost:8080> and drop your `bom.json` / `sbom.json` onto the page.

## Build it yourself

```bash
make docker-build   # build the local image
make docker-run     # serve it on http://localhost:8080
```

Equivalent without Make:

```bash
docker build -t blitsbom:latest .
docker run --rm -p 8080:3000 blitsbom:latest
```

## Release reports (CI)

Turn an SBOM into a **single self-contained HTML file** you can attach to a release or hand to an auditor, supplier, or vendor for a quick license review. It is the full blitsbom app with the SBOM already loaded, plus a provenance header identifying the release — and it works offline, from a `file://` URL, with no server and no network.

### In a GitHub Actions workflow

```yaml
- uses: no42-org/blitsbom@v0.6.1
  id: sbom-report
  with:
    sbom: bom.json          # path to your CycloneDX or SPDX SBOM
    # image defaults to :report-0.6.1, matching the action tag
    # version/project/commit/build-url default from the workflow context
- uses: actions/upload-artifact@v4
  with:
    name: sbom-report
    path: ${{ steps.sbom-report.outputs.report }}
```

Pin the action however your policy requires — `image` defaults to the generator matching whatever the action itself came from, so the two cannot drift:

| Action ref | Generator image |
|---|---|
| `@v0.6.1` — a release tag | `:report-0.6.1` |
| a commit SHA, e.g. Dependabot's pin | `:report-<that commit's version>` |
| `@main` or another branch | `:report-rc`, the generator built from `main` — the matching pair for a ref that tracks `main` |
| anything else, or a version that cannot be read | `:report-rc` |

When it derives the image, the action logs which one and why; passing `image` explicitly skips that. Set `image` to override — to pin a digest, or to run a branch ref against a released generator.

Two limits worth knowing. A SHA pinned to a commit *between* releases resolves that commit's `package.json` version, which is the last release — so the generator is a little older than the action. And a fork's SHA resolves against `ghcr.io/no42-org/blitsbom`, not the fork's own registry; pass `image` if you publish your own.

> **Moved in v0.6.0.** The action was `no42-org/blitsbom/report@v0.5.0` and is now at the repository root, `no42-org/blitsbom`, so it can be listed on the GitHub Marketplace.
>
> Pins to `@v0.5.0` or any earlier tag keep working — tags are immutable. What breaks is a ref that follows `main`: `no42-org/blitsbom/report@main`, or a SHA pin updated to a commit after the move. Those need the `/report` suffix dropped.

### With the container image directly (any CI, or a laptop)

```bash
# A specific release (reproducible)
docker run --rm -v "$PWD:/work" ghcr.io/no42-org/blitsbom:report-0.6.1 \
  /work/bom.json --project acme-platform --version 2.4.1 \
  --output /work/acme-platform-2.4.1-sbom.html

# Bleeding-edge build from main
# ghcr.io/no42-org/blitsbom:report-rc
```

The generator exits non-zero (and writes nothing) if the SBOM does not parse, so a broken SBOM fails the pipeline instead of shipping a report that greets the recipient with an error. It applies **no** policy judgment — no license or severity gate; that is deliberately left to tools like grype or osv-scanner.

A CycloneDX VEX can be merged in at generation time with `--vex vex.json`; the report then shows the vulnerability data, while the embedded SBOM stays byte-identical to your source.

### What recipients get, and how they verify it

The report offers **Download original SBOM** (the verbatim source, machine-readable) alongside **Export CSV** (for legal). The provenance header shows the `sha256:` digest of the source SBOM — a recipient confirms the report matches the SBOM they were given with:

```bash
sha256sum bom.json   # compare against the digest shown in the report header
```

> **The report embeds your SBOM verbatim** — every component, internal registry URL, and publisher field goes with it. Remove anything that must not leave your organization *before* generating the report; blitsbom does not redact.

> Reports over ~2 MB are gzip-compressed inside the file and need a browser with `DecompressionStream` (Chrome/Edge 80+, Firefox 113+, Safari 16.4+ — all 2023 or earlier). Smaller reports embed the SBOM as raw JSON and open anywhere.

## Supported input

| Format | Versions | Status |
|--------|----------|--------|
| CycloneDX JSON | 1.4 – 1.7 | Verified — schema-checked against the fields blitsbom reads, with fixtures from real generators |
| CycloneDX JSON | 1.8+ | Accepted — CycloneDX minors are additive, so newer ones load; the header marks them "newer than this build" until verified |
| SPDX JSON | 2.x (2.2 / 2.3) | Supported |
| CycloneDX 1.0 – 1.3 | — | Rejected with a clear error (open an issue if you need it) |
| CycloneDX 2.x | — | Rejected — a major version is a spec break, not a minor addition |
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

SPDX documents can use `LicenseRef-*` identifiers backed by the document's `hasExtractedLicensingInfos` block. blitsbom resolves these by matching the actual extracted text against signature regexes for ~13 common licenses (Apache-2.0, MIT, `BSD-*`, `GPL-*`, `LGPL-*`, AGPL-3.0, MPL-2.0, `EPL-*`, CDDL-1.0, ISC), falling back to canonical license URLs in `seeAlsos` and to encoded ids in the LicenseRef name itself. Anything that can't be recognized stays as a verbatim name and classifies as Proprietary.

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
make report SBOM=bom.json VERSION=2.4.1 OUT=report.html  # generate a CI report
make test        # vitest
make verify      # lint + tests + network-purity check
make size-check  # fail if gzipped JS exceeds 60 KB
make smoke       # headless Chromium loading dist/index.html via file://
make dist-zip    # build and zip dist/ as dist.zip for self-hosters
```

CI invokes `make` targets, never the underlying npm scripts directly, so the developer and CI commands stay in sync.

## Deployment

- Pushing to `main` triggers `.github/workflows/docker.yml`, which builds and pushes `ghcr.io/no42-org/blitsbom:rc` (and `:main-<short-sha>`).
- Pushing a tag matching `v*` triggers `.github/workflows/release.yml` (produces `dist.zip` + `dist.zip.sha512` and attaches them to the GitHub Release) and `.github/workflows/docker.yml` (publishes `:X.Y.Z` and `:X.Y` to GHCR — not yet `:latest`).
- `release.yml` is triggered by the `v*` tag push: in a single job it builds the bundle, attaches `dist.zip` + checksum + Sigstore bundle to a freshly-created GitHub Release (`make_latest: legacy` defers to GitHub's Latest-release algorithm), and — when the tag is not a prerelease — its final step calls `gh workflow run docker.yml --ref <tag> -f promote_tag=X.Y.Z` to dispatch the `promote-latest` job. That job re-tags the already-pushed `:X.Y.Z` image as `:latest` — no rebuild, same digest, same cosign signature. (We use `workflow_dispatch` rather than the `release: [released]` event because GitHub suppresses downstream events triggered by GITHUB_TOKEN; `workflow_dispatch` is the documented exception.)

All third-party Actions are pinned to immutable commit SHAs and kept current by Dependabot.

See **[RELEASING.md](./RELEASING.md)** for the full release workflow — versioning policy, cutting a release, hotfixes, and troubleshooting.

## Legal pages (operator-supplied)

`public/imprint.html` and `public/privacy.html` ship as **anonymised templates with `[PLACEHOLDER]` fields and a visible "Placeholder — replace before deploying" banner.** They are not legally valid as-is.

Before serving blitsbom publicly, the operator of the deployment must:

1. Replace every `[PLACEHOLDER]` in both files with the operator's own details (name, address, contact, hosting provider, log retention period, certificate authority, applicable legal basis, etc.).
2. Adapt the section structure to the applicable jurisdiction. The templates follow the structure typically required by German law (§ 5 TMG, § 18 (2) MStV, GDPR); operators elsewhere should add, remove, or rename sections as needed.
3. Remove the yellow "Placeholder" banner once the content has been verified.

The footer links in the app (`src/ui/AppShell.svelte`) point at `/imprint.html` and `/privacy.html`, so no code change is needed — just edit the two HTML files.

Operators who want to keep their personal version out of source control can override the files at runtime — for example with a Docker bind mount:

```bash
docker run --rm -p 8080:3000 \
  -v ./my-imprint.html:/home/static/imprint.html:ro \
  -v ./my-privacy.html:/home/static/privacy.html:ro \
  ghcr.io/no42-org/blitsbom:latest
```

## Project layout

```
src/
  parse/      CycloneDX + SPDX parsers, format detection, LicenseRef resolution,
              VEX merge + purl canonicalization
  license/    FSF-sourced classification table
  state/      Svelte store, filter combinator (incl. category facet), URL state
  ui/         Svelte components (AppShell, DropZone, SummaryHeader,
              LicenseDonut, LicenseDrilldown, ComponentsTable, ...)
  export/     CSV writer, original-SBOM download
  generator/  CI report generator (reuses parse/; built to a Node ESM CLI)
  styles/     Tailwind v4 CSS entry (@theme static design tokens)
action.yml    Composite GitHub Action wrapping the report generator image
scripts/      size-check, purity-check, file-smoke, e2e
samples/      Real-world SBOMs used as test corpus (not bundled into dist/)
```

## Contributing and support

- [CONTRIBUTING.md](./CONTRIBUTING.md) — development setup, commit conventions, DCO sign-off and the AI-assistance policy.
- [SUPPORT.md](./SUPPORT.md) — where to ask a question, and what to include so it gets answered.
- [SECURITY.md](./SECURITY.md) — how to report a vulnerability privately. Please do not open a public issue for one.
- [RELEASING.md](./RELEASING.md) — how releases are cut and how to verify the signatures.
- [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md) — Contributor Covenant 2.1.

## Support

blitsbom is free and open source under the **MIT** license — a zero-install, no-cloud
SBOM viewer that keeps every byte in your browser. If it saved you a spreadsheet or a
subscription, a one-time donation helps keep it maintained: releases, dependency upkeep,
and staying genuinely local-first.

- **GitHub Sponsors:** https://github.com/sponsors/indigo423
- **Ko-fi:** https://ko-fi.com/indigo423

No paid tiers or perks — the tool stays free for everyone. A ⭐ or a good bug report
helps just as much, and there's a spot on [SPONSORS.md](./SPONSORS.md) if you'd like one. ❤️

## License

MIT — see [LICENSE](./LICENSE).
