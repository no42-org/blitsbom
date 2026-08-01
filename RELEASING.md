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
| `dist.zip` + `dist.zip.sha512` + `dist.zip.sigstore` + `dist.zip.cdx.json` (CycloneDX SBOM) + `dist.zip.cdx.html` (its blitsbom-rendered HTML report) attached to a **draft** GitHub Release | the `vX.Y.Z` Git tag            | `.github/workflows/release.yml`|
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

If everything is green, decide on the next version (`MAJOR.MINOR.PATCH`) based on what's landed since the last release:

```bash
# The last released version. NOT `git describe --tags --abbrev=0`: that
# returns the rolling `preview` tag (refreshed on every push to main), which
# sorts ahead of the version tags. Filter to `v*` and sort by version.
git tag -l 'v*' --sort=-v:refname | head -1
git log "$(git tag -l 'v*' --sort=-v:refname | head -1)"..HEAD --oneline
```

`main` is protected and requires the `gates / verify` and `gates / lint-workflows` checks, so the version bump lands via a PR — it cannot be pushed directly. **Tag the merged bump commit, not your local one**: squash-merging creates a new commit, so a tag made before the merge points at a commit that is not on `main`.

The README's usage examples move in the **same** PR. It doubles as the
Marketplace listing body, so leaving them behind advertises a superseded release
to anyone copy-pasting from the listing — which is how v0.6.0's examples outlived
the release that fixed v0.6.0's own defects ([#165](https://github.com/no42-org/blitsbom/issues/165)).
`make marketplace-check` compares them against `package.json` and fails the bump
PR until they match, so this is enforced rather than remembered. Version
references inside a blockquote are exempt: those are migration notes about the
past and must not be rewritten.

```bash
# Bump package.json (recorded in the bundle for diagnostics) on a branch.
git checkout -b chore/release-v0.2.0
npm version --no-git-tag-version 0.2.0   # adjust to the chosen version

# Move the README's examples to match. marketplace-check names every line that
# is still stale, so run it, fix what it lists, and run it again.
make marketplace-check

# Commit the version bump using the conventional-commits style.
git add package.json package-lock.json README.md
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

**The draft is not created until the tagged image exists.** `release.yml` has an `images` job that waits for `ghcr.io/no42-org/blitsbom:X.Y.Z` to appear in GHCR carrying *both* `linux/amd64` and `linux/arm64`, and the release job depends on it. Two reasons for the strictness:

- `docker.yml` is a separate workflow triggered by the same tag push, so nothing else connects them. In [#93](https://github.com/no42-org/blitsbom/issues/93) that push never produced a `docker.yml` run at all — `v0.3.7` published with no container images and `:latest` sat a version behind for a week, the only symptom being a red run nobody read.
- buildx pushes a multi-arch tag non-atomically, so the tag resolves while only `linux/amd64` has uploaded. Requiring both platforms avoids blessing a release whose arm64 image does not exist yet.

If the image never arrives the release run fails and **no draft appears**, so there is nothing to publish by mistake. The job fails fast when the latest `docker.yml` run for that commit has already failed, and otherwise waits up to ~40 minutes. If it times out with no `docker.yml` run at all, that is the #93 signature — re-run the build against the tag:

```bash
gh workflow run docker.yml --ref v0.2.0
```

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

> [!IMPORTANT]
> **Use cosign v3.0.0 or newer.** The pipeline signs with cosign v3, which no
> longer writes the legacy `sha256-<digest>.sig` tag that cosign v2 looks for.
> Running these commands under cosign v2 reports
>
> ```
> Error: no signatures found
> ```
>
> on a perfectly good signature. That is a version mismatch, not evidence of
> tampering — check `cosign version` before concluding anything. If you have a
> genuine verification failure, report it privately: see [SECURITY.md](./SECURITY.md).

After the workflows turn green:

1. **GitHub Release** — open <https://github.com/no42-org/blitsbom/releases/latest>; verify `dist.zip`, `dist.zip.sha512`, `dist.zip.sigstore`, `dist.zip.cdx.json` and `dist.zip.cdx.html` are all attached, and that you have curated the notes. The `.cdx.html` file is the release SBOM rendered by this release's own report action and `:report-X.Y.Z` generator image — open it in a browser and confirm it shows the npm tree. Spot-check the checksum and the Sigstore signature:
   ```bash
   gh release download --pattern 'dist.zip*'
   sha512sum -c dist.zip.sha512
   cosign verify-blob dist.zip \
     --bundle dist.zip.sigstore \
     --certificate-identity-regexp '^https://github\.com/no42-org/blitsbom/\.github/workflows/release\.yml@refs/tags/v' \
     --certificate-oidc-issuer https://token.actions.githubusercontent.com
   ```
2. **Build provenance** — proves the artifact was built by this repo's workflow from this commit, not assembled elsewhere. The SBOM and its HTML report are covered by the same attestation:
   ```bash
   gh attestation verify dist.zip --repo no42-org/blitsbom
   gh attestation verify dist.zip.cdx.json --repo no42-org/blitsbom
   gh attestation verify dist.zip.cdx.html --repo no42-org/blitsbom
   ```
3. **GHCR images** — pull and run, sanity-check it loads. The image serves on **port 3000** (BusyBox httpd as the unprivileged `static` user), so map to that, not 80:
   ```bash
   docker run --rm -p 8080:3000 ghcr.io/no42-org/blitsbom:0.2.0
   open http://localhost:8080
   ```
   Then load one of the sample SBOMs end-to-end and confirm the donut + table render.
4. **Container signature, SBOM attestation and provenance** — verify the image is signed by this repo's release workflow, pull the attached CycloneDX SBOM, and check its provenance:
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

   gh attestation verify "oci://${IMAGE}" --repo no42-org/blitsbom
   ```
   The `:rc` and `:main-<sha>` images carry the same signature shape but with `@refs/heads/main` instead of `@refs/tags/v…` — adjust the `--certificate-identity-regexp` accordingly when verifying those. The `preview` artifact uses `@refs/heads/main` on `preview.yml`.

   Signatures and attestations bind to the image **digest**, so `:latest` and `:X.Y` verify as the digest they point at — a re-tag never invalidates them.

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

## Reproducing the release SBOM

`dist.zip.cdx.json` is generated by `make sbom`, which `release.yml` calls. To reproduce the artifact published with a release, check out its tag and run:

```bash
make sbom          # writes dist.zip.cdx.json; needs Docker
```

The result matches the published SBOM in component set, purl set and per-component licence set, differing only in `serialNumber` and `metadata.timestamp`, which are per-run by construction. Verified for v0.6.1 from a clean checkout with no `npm ci` — syft's directory scan reads `package-lock.json`, not `node_modules/`, so an unbuilt tree gives the same inventory.

**This holds only while the syft pin matches the one the release was cut with.** Once Dependabot bumps the `syft` stage, reproducing an older release means checking out that release's `Dockerfile` too — which `git checkout <tag>` does anyway. Nothing gates this claim, so treat a mismatch in `metadata.tools` as the explanation before assuming a real difference.

The syft version is pinned by digest in the `syft` stage of the `Dockerfile`, so it is explicit and Dependabot proposes updates to it. Upgrading syft is therefore an ordinary reviewed dependency change; nothing about it is implicit in a third-party action's release cadence.

Two caveats worth knowing:

- **The image SBOM is produced differently.** `docker.yml` still uses `anchore/sbom-action` to attest the pushed container image, because that path needs registry authentication the action already handles. The source SBOM and the image SBOM can therefore be generated by different syft versions. They describe different things and are never compared, so this is accepted rather than overlooked.
- **`make sbom` requires Docker.** It fails with a clear message when Docker is unavailable rather than silently producing nothing.

## Verifying a new CycloneDX minor

The version gate accepts any CycloneDX `1.x` at or above 1.4, so a new minor loads without a code change.
What it does *not* do is claim the minor was checked: `CDX_HIGHEST_VERIFIED_MINOR` in `src/types.ts` records how far verification actually got, and anything above it renders as "newer than this build" in the header.

When a new CycloneDX minor ships, bump it like this:

1. Diff the schemas for the fields the parser reads:
   ```bash
   for v in 1.7 1.8; do
     curl -sSL -o "bom-$v.json" \
       "https://raw.githubusercontent.com/CycloneDX/specification/master/schema/bom-$v.schema.json"
   done
   ```
   Compare `definitions.component.properties` (`type`, `group`, `name`, `version`, `description`, `publisher`, `supplier`, `manufacturer`, `authors`, `author`, `scope`, `purl`, `bom-ref`, `licenses`), `definitions.metadata.properties` (`component`, `timestamp`, `tools`), and `definitions.{license,licenses,vulnerability}`.
2. If any of those changed shape or meaning, that is a parser change, not a constant bump. Stop and open an issue.
3. Add a fixture produced by a real generator, not a hand-edited `specVersion`. See `samples/syft/blitsbom-cdx-1.7.json`.
4. Wire it into `scripts/e2e.mjs` so it loads in a real browser.
5. Bump `CDX_HIGHEST_VERIFIED_MINOR` and update the "Supported input" table in `README.md`.

Leaving the constant stale is safe. It costs a caveat on a document that would parse correctly anyway, never a refusal.

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
