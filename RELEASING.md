# Releasing blitsbom

This document captures the release workflow. Cutting a release is a single command — pushing a `vX.Y.Z` Git tag — after which three GitHub Actions workflows do everything else.

## Versioning

We follow [Semantic Versioning 2.0.0](https://semver.org/):

- **Major** — breaking changes to the input formats supported, the URL state schema, or the public surface of self-hosted dist bundles.
- **Minor** — new features (parsers, charts, exports) that don't break existing behavior.
- **Patch** — bug fixes, parser robustness improvements, dependency bumps.

Pre-`1.0.0` we keep the `0.x.y` line and treat **minor** bumps as the breaking-change channel — a `0.2.0` may break things that worked under `0.1.x`. Bump to `1.0.0` once the input/format contract stabilizes.

## What gets published

| Artifact                                  | Source                          | Pushed by                      |
|-------------------------------------------|---------------------------------|--------------------------------|
| `dist.zip` + `dist.zip.sha512` attached to GitHub Release | the `vX.Y.Z` Git tag            | `.github/workflows/release.yml`|
| `ghcr.io/no42-org/blitsbom:rc` / `:main-<sha>` | every push to `main`           | `.github/workflows/docker.yml` |
| `ghcr.io/no42-org/blitsbom:latest` / `:X.Y.Z` / `:X.Y` | the `vX.Y.Z` Git tag           | `.github/workflows/docker.yml` |

Notes:

- GHCR's `:rc` tag is overwritten on every push to `main`. Use `:main-<sha>` if you need to pin to a specific commit.
- GHCR's `:latest` is moved on every release; use `:X.Y.Z` to pin to a specific version.

## Cutting a release

Pre-flight (manual, on `main`):

```bash
git checkout main
git pull --ff-only
make verify       # lint + tests + purity check
make size-check   # gzipped JS budget (60 KB)
make e2e          # full file:// UX check across all sample SBOMs
```

If everything is green, decide on the next version (`MAJOR.MINOR.PATCH`) based on what's landed since the last tag. Then:

```bash
# Bump package.json (recorded in the bundle for diagnostics).
npm version --no-git-tag-version 0.2.0   # adjust to the chosen version

# Commit the version bump using the conventional-commits style.
git add package.json package-lock.json
git commit -m "chore(release): v0.2.0"

# Create the annotated tag and push everything.
git tag -a v0.2.0 -m "v0.2.0"
git push origin main
git push origin v0.2.0
```

Pushing the tag fires both `release.yml` (GitHub Release + `dist.zip` + checksum) and `docker.yml` (`:latest`, `:0.2.0`, `:0.2` in GHCR). The corresponding push to `main` fires `docker.yml` separately for the `:rc` tag.

## Verifying the release

After the workflows turn green:

1. **GitHub Release** — open <https://github.com/no42-org/blitsbom/releases/latest>; verify both `dist.zip` and `dist.zip.sha512` are attached and the auto-generated release notes look reasonable. Spot-check the checksum:
   ```bash
   gh release download --pattern 'dist.zip*'
   sha512sum -c dist.zip.sha512
   ```
2. **GHCR images** — pull and run, sanity-check it loads:
   ```bash
   docker run --rm -p 8080:80 ghcr.io/no42-org/blitsbom:0.2.0
   open http://localhost:8080
   ```
   Then load one of the sample SBOMs end-to-end and confirm the donut + table render.

## Hotfixes

For a patch release off the latest tag (e.g. `v0.2.0` is broken; we want `v0.2.1`):

```bash
git checkout -b hotfix/0.2.1 v0.2.0
# fix the bug, commit
git checkout main
git merge --no-ff hotfix/0.2.1
git push origin main
# then cut v0.2.1 the normal way (npm version + tag + push)
```

If you need to abandon a broken tag entirely, **delete it** rather than re-pointing — moving an already-fetched tag is unkind to anyone who pinned to it:

```bash
git push origin :refs/tags/v0.2.0
gh release delete v0.2.0 --yes --cleanup-tag
# Optionally clean up the GHCR tag manually via the package settings.
```

Then cut a new patch version.

## Troubleshooting

- **`docker.yml` fails on first run with "denied: permission_denied"** — the GHCR package didn't exist yet and is private by default. After the first successful publish, set the package visibility to `public` under **Repository → Packages → blitsbom → Package settings**, or grant the workflow `packages: write` (already configured here).
- **`size-check` fails locally but passes in CI** — local `node_modules` may be stale. Run `make clean && make install && make size-check`.
- **Sample-SBOM e2e times out** — the `opennms-core` fixture (~29 MB, 2839 components) is intentionally aggressive. If it regresses, look at recent changes to the parser or the store's `$state.raw` patterns.

## Commit conventions for release commits

Per the project's [Conventional Commits](https://www.conventionalcommits.org/) policy, release plumbing uses these scopes:

- `chore(release): vX.Y.Z` — the version-bump commit before the tag.
- `ci: …` — workflow or pipeline changes.
- `docs(releasing): …` — updates to this file.

Every Claude-assisted commit must include the `Assisted-by:` trailer; **never** include `Signed-off-by` for AI-generated changes (only humans certify the DCO).
