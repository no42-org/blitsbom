# Contributing to blitsbom

Thanks for taking the time. This project has a narrow promise — a zero-install SBOM viewer that never touches the network — and the guidelines below mostly exist to protect it.

## Before you write code

**Open an issue first.** Work starts from an issue, not a drive-by PR, so we can agree on the approach before you spend an evening on it. Bug reports and enhancement requests both have [templates](https://github.com/no42-org/blitsbom/issues/new/choose).

Small, obvious fixes (a typo, a broken link) can skip straight to a PR.

## Development

```bash
make install      # install dependencies
make dev          # Vite dev server with HMR
make verify       # lint + tests + network-purity check
make ci           # everything CI runs — do this before pushing
```

`make ci` is the same target CI runs, so a green `make ci` locally is a strong predictor of a green PR.

Three constraints are enforced mechanically and will fail your build:

- **No network calls.** `make purity-check` rejects `fetch`, `XMLHttpRequest`, `sendBeacon` and analytics SDKs anywhere in `src/`. Everything happens in the browser, offline, or it does not happen.
- **60 KB gzipped JS budget**, enforced by `make size-check`. New dependencies are a hard sell.
- **Workflow hygiene.** `actionlint` and `zizmor` run on every PR; GitHub Actions must be pinned to a commit SHA with the full version in a trailing comment.

Architecture notes and the non-obvious gotchas live in [AGENTS.md](./AGENTS.md) — worth a read even if you are not an AI.

## Commits

We use [Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`, `docs:`, `ci:`, `chore:`, and so on. Breaking changes get a `!` or a `BREAKING CHANGE:` footer. The version number is derived from these, so the prefix matters.

### DCO sign-off

Every commit must carry a `Signed-off-by` trailer from a real human identity:

```bash
git commit -s -m "fix: handle SPDX documents with no packages"
```

This certifies the [Developer Certificate of Origin](https://developercertificate.org/) — in short, that you wrote the change or otherwise have the right to submit it under the project's MIT license.

### AI-assisted contributions

AI assistance is welcome. It must be disclosed, and it does not transfer responsibility.

Add an `Assisted-by:` trailer naming the agent and model, above your sign-off:

```
fix: handle SPDX documents with no packages

Assisted-by: ClaudeCode:claude-opus-4-8
Signed-off-by: Your Name <you@example.com>
```

The human signer remains fully responsible for the change: for reviewing it, for its correctness, and for its license compliance. An AI cannot certify the DCO, which is precisely why an AI-assisted commit still needs your sign-off rather than being exempt from it. Do not put an agent's name in `Signed-off-by`.

Please do not open PRs consisting of unreviewed generated output. A patch you cannot explain is a patch we cannot merge.

## Pull requests

- Reference the issue with a closing keyword: `Closes #123`.
- Keep it to one logical change. Two unrelated fixes are two PRs.
- `main` is protected — the `gates / verify` and `gates / lint-workflows` checks must pass before merge.
- PRs are squash-merged, so your branch history stays yours; write the PR description for the reader of `git log`.

## Reporting security issues

Do **not** open a public issue. See [SECURITY.md](./SECURITY.md).

## Code of conduct

Participation is governed by our [Code of Conduct](./CODE_OF_CONDUCT.md).
