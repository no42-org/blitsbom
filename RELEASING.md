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
| `dist.zip` + `dist.zip.sha512` + `dist.zip.sigstore` attached to a **draft** GitHub Release | the `vX.Y.Z` Git tag            | `.github/workflows/release.yml`|
| The same three files on the rolling `preview` prerelease | every green push to `main`      | `.github/workflows/preview.yml` |
| `ghcr.io/no42-org/blitsbom:rc` / `:main-<sha>` (cosign-signed, SBOM-attested) | every push to `main`           | `.github/workflows/docker.yml` |
| `ghcr.io/no42-org/blitsbom:X.Y.Z` / `:X.Y` (cosign-signed, SBOM-attested) | the `vX.Y.Z` Git tag            | `.github/workflows/docker.yml` (`build-and-push` job) |
| `ghcr.io/no42-org/blitsbom:latest` (re-tag of the released `:X.Y.Z`, same digest, same signature) | **publishing** the draft release | `.github/workflows/release.yml` (`promote-latest` job) dispatches `.github/workflows/docker.yml` |

Notes:

- **A tag push does not publish anything user-visible.** It creates a *draft* release with the artifacts attached. The release becomes public only when you curate the notes and publish it — see [Cutting a release](#cutting-a-release).
- GHCR's `:rc` tag is overwritten on every push to `main`. Use `:main-<sha>` if you need to pin to a specific commit.
- The `preview` release is deleted and recreated on every green push to `main`, so its tag moves. It is always a prerelease, so it never becomes "Latest". Use it to test an unreleased fix; never pin to it.
- GHCR's `:latest` moves when you **publish** the release, not when you push the tag. `release.yml` subscribes to `release: [released]` and dispatches docker.yml's `promote-latest` job. Two consequences worth knowing:
  - Only `released` is subscribed, and publishing a *prerelease* fires `prereleased` instead — so prereleases never move `:latest`, with no explicit check needed.
  - GitHub suppresses release events raised by `GITHUB_TOKEN`, but you publishing via the UI or your own token is not `GITHUB_TOKEN`, so the event fires normally. If it ever fails to, promote manually: `gh workflow run docker.yml --ref v0.2.8 -f promote_tag=0.2.8`. That same entry point is the emergency-repromote path.
  - `promote-latest` in docker.yml is serialized via a `concurrency: promote-latest` group, so two promotions (e.g. a hotfix racing a main release) cannot finish out of order and leave `:latest` on the older version.
- `make_latest: legacy` (passed to `softprops/action-gh-release`) defers the "Latest release" decision to GitHub's own algorithm rather than forcing this release to be Latest — so a hotfix on an older minor line will not clobber the Latest badge of a newer tag. Note that `:latest` in GHCR is promoted for **any** published non-prerelease, so if you publish an older-line hotfix, GHCR's `:latest` will point at it even where GitHub's Latest badge does not. Check the Releases UI before relying on `:latest` meaning "newest version".
- **Cosign signing is keyless via Sigstore OIDC** — no private keys are stored in the repo or as secrets. Each signature carries a Fulcio short-lived cert whose subject is the GitHub Actions workflow identity (`https://github.com/no42-org/blitsbom/.github/workflows/<workflow>.yml@refs/tags/vX.Y.Z`), and the signing event is recorded in the Rekor public transparency log. The `promote-latest` re-tag does not re-sign — cosign signatures bind to the image digest, which is unchanged, so `cosign verify ghcr.io/no42-org/blitsbom:latest` resolves to the same signed digest as `:X.Y.Z`. (Tag-listing tools such as `crane ls` will not show a `.sig` companion next to `:latest` itself; verification works because cosign resolves the tag to its digest first.) Verification commands are in [Verifying the release](#verifying-the-release).

## Cutting a release

Pre-flight (manual, on `main`):

```bash
git checkout main
git pull --ff-only
make verify       # lint + tests + purity check
make size-check   # gzipped JS budget (60 KB)
make e2e          # full file:// UX check across all sample SBOMs
```

If everything is green, decide on the next version (`MAJOR.MINOR.PATCH`) based on what's landed since the last tag.

`main` is protected and requires the `gates / verify` and `gates / lint-workflows` checks, so the version bump lands via a PR — it cannot be pushed directly. **Tag the merged bump commit, not your local one**: squash-merging creates a new commit, so a tag made before the merge points at a commit that is not on `main`.

```bash
# Bump package.json (recorded in the bundle for diagnostics) on a branch.
git checkout -b chore/release-v0.2.0
npm version --no-git-tag-version 0.2.0   # adjust to the chosen version

# Commit the version bump using the conventional-commits style.
git add package.json package-lock.json
git commit -s -m "chore(release): v0.2.0"
git push -u origin chore/release-v0.2.0
gh pr create --fill
```

Once the checks are green, merge it and tag what actually landed:

```bash
gh pr merge --squash --delete-branch
git checkout main
git pull --ff-only            # fast-forward onto the squashed bump commit

# Create the annotated tag on the merged commit and push it.
git tag -a v0.2.0 -m "v0.2.0"
git push origin v0.2.0
```

Pushing the tag fires `release.yml` (which builds, signs, and creates a **draft** release with `dist.zip` + checksum + Sigstore bundle attached) and `docker.yml` (`:0.2.0`, `:0.2` in GHCR — note: not yet `:latest`). The tag matching glob is `v*.*.*`, so a malformed tag like `v0.3` or `vNEXT` starts nothing at all.

Nothing is public yet. **The draft is the point at which you write the release notes.**

### Writing the notes

Do not ship the auto-generated commit dump. It is there as raw material — read it, then write for someone deciding whether to upgrade:

- `## Highlights` — 1–5 bullets of user-facing impact in plain sentences, linking the PR or issue (`#123`).
- `## Breaking changes` — only if any, and always with the migration path.
- `## Fixes` — one line each.

Leave out CI churn, refactors, and dependency bumps (collapse those to a single line if any of them mattered). If a user cannot act on it, it does not belong in the notes.

### Publishing

```bash
gh release view v0.2.0                                   # check the artifacts are attached
gh release edit v0.2.0 --notes-file notes.md --draft=false
```

Publishing fires the `released` event, which runs `release.yml`'s `promote-latest` job. That dispatches docker.yml's `promote-latest`, re-tagging the already-built `:0.2.0` image as `:latest` via `docker buildx imagetools create` — no rebuild, same digest, same cosign signature.

For a prerelease (`v0.2.0-rc.1`), publish with `--prerelease` instead. That fires `prereleased` rather than `released`, so `:latest` is left alone.

The version-bump commit's own push to `main` separately fires `docker.yml` for the `:rc` tag and `preview.yml` for the rolling `preview` prerelease.

## Verifying the release

After the workflows turn green:

1. **GitHub Release** — open <https://github.com/no42-org/blitsbom/releases/latest>; verify `dist.zip`, `dist.zip.sha512`, and `dist.zip.sigstore` are all attached and the auto-generated release notes look reasonable. Spot-check the checksum and the Sigstore signature:
   ```bash
   gh release download --pattern 'dist.zip*'
   sha512sum -c dist.zip.sha512
   cosign verify-blob dist.zip \
     --bundle dist.zip.sigstore \
     --certificate-identity-regexp '^https://github\.com/no42-org/blitsbom/\.github/workflows/release\.yml@refs/tags/v' \
     --certificate-oidc-issuer https://token.actions.githubusercontent.com
   ```
2. **GHCR images** — pull and run, sanity-check it loads:
   ```bash
   docker run --rm -p 8080:80 ghcr.io/no42-org/blitsbom:0.2.0
   open http://localhost:8080
   ```
   Then load one of the sample SBOMs end-to-end and confirm the donut + table render.
3. **Container signature + SBOM attestation** — verify the image is signed by this repo's release workflow, and pull the attached CycloneDX SBOM:
   ```bash
   IMAGE=ghcr.io/no42-org/blitsbom:0.2.0
   cosign verify "$IMAGE" \
     --certificate-identity-regexp '^https://github\.com/no42-org/blitsbom/\.github/workflows/docker\.yml@refs/tags/v' \
     --certificate-oidc-issuer https://token.actions.githubusercontent.com
   cosign verify-attestation "$IMAGE" \
     --type cyclonedx \
     --certificate-identity-regexp '^https://github\.com/no42-org/blitsbom/\.github/workflows/docker\.yml@refs/tags/v' \
     --certificate-oidc-issuer https://token.actions.githubusercontent.com \
     | jq -r '.payload | @base64d | fromjson | .predicate' > sbom.cdx.json
   ```
   The `:rc` and `:main-<sha>` images carry the same signature shape but with `@refs/heads/main` instead of `@refs/tags/v…` — adjust the `--certificate-identity-regexp` accordingly when verifying those.

## Hotfixes

For a patch release off the latest tag (e.g. `v0.2.0` is broken; we want `v0.2.1`):

```bash
git checkout -b hotfix/0.2.1 v0.2.0
# fix the bug, commit with -s
git push -u origin hotfix/0.2.1
gh pr create --fill
gh pr merge --squash --delete-branch   # once gates are green
# then cut v0.2.1 the normal way (bump PR + tag the merged commit)
```

`git merge --no-ff` into `main` is no longer possible: `main` requires linear history and the repo is squash-merge only, so the fix reaches `main` as a single squashed commit via PR like anything else.

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

Every commit carries two trailers, in this order:

```
Assisted-by: ClaudeCode:claude-opus-4-8
Signed-off-by: Ronny Trommer <ronny@no42.org>
```

- `Assisted-by:` names the agent and model for AI-assisted changes. Omit it for changes written entirely by hand.
- `Signed-off-by:` is added by `git commit -s` and always carries the **human** committer's identity, never an AI name.

An AI-assisted commit still gets a human sign-off — that is the point of the DCO. The signer is certifying that they reviewed the change and vouch for its provenance and license compliance, which is a statement only a person can make. Dropping the sign-off would not make the claim more honest, it would just leave the commit uncertified.
