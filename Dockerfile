# syntax=docker/dockerfile:1

# Base images are pinned by digest, for the same reason GitHub Actions are
# pinned by SHA: a tag is mutable, so `node:22-alpine` can silently become a
# different image between two builds of the same commit. The tag is kept
# alongside the digest so the version stays readable and Dependabot can
# propose updates to both.
#
# These are manifest-list (index) digests, not per-platform ones — the release
# build is multi-arch, and pinning a single platform's manifest would break the
# linux/arm64 build.

# Stage 1 — build the static bundle.
FROM node:26-alpine@sha256:e88a35be04478413b7c71c455cd9865de9b9360e1f43456be5951032d7ac1a66 AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-fund --no-audit
COPY . .
# Build both the app bundle and the CI report generator (a single Node ESM
# file that imports the app's own parser).
RUN npm run build && npm run build:generator

# Stage 2 — the CI report generator. A separate target from the serving image
# (which is a shell-less ~150 KB static-website base and cannot host a Node
# runtime). It carries the app bundle as the embed template plus the built
# generator, and turns an SBOM into a self-contained HTML report. Digest kept
# in sync with the build stage above via Dependabot.
#
# Not the default build target: it is defined BEFORE the serving stage so a
# plain `docker build .` (make docker-build, docker.yml) still produces the
# serving image. Build this one with `--target report`. The syft stage below
# is ordered for the same reason.
FROM node:26-alpine@sha256:e88a35be04478413b7c71c455cd9865de9b9360e1f43456be5951032d7ac1a66 AS report
# The template the generator embeds into; overridable with --template.
ENV BLITSBOM_TEMPLATE=/opt/blitsbom/index.html
COPY --from=build /app/dist/index.html /opt/blitsbom/index.html
COPY --from=build /app/dist-generator/blitsbom-report.mjs /opt/blitsbom/blitsbom-report.mjs
# Reports are written relative to this working directory; mount your SBOM here.
WORKDIR /work
ENTRYPOINT ["node", "/opt/blitsbom/blitsbom-report.mjs"]
CMD ["--help"]

# Stage 3 — the SBOM generator used by `make sbom` and the release workflow.
#
# It exists here, rather than as a version string in the Makefile or a
# `syft-version:` input on `anchore/sbom-action`, so the pin is watched: the
# `docker` Dependabot ecosystem already covers this file, while Dependabot does
# not parse action inputs, workflow `container:` images, or `docker://` refs.
# That makes this the only place a syft pin is both explicit and tracked. (#172)
#
# Pinned to v1.42.3 — the version `anchore/sbom-action@v0.24.0` shipped when
# this landed, chosen so the switch to `make sbom` changed how the SBOM is
# produced and not what it contains.
#
# That correspondence is a starting condition, not an invariant. Dependabot
# will bump this pin, and `docker.yml` bumps the action independently, so the
# two drift apart by design. Once this moves, `make sbom` no longer reproduces
# SBOMs published before the bump — see RELEASING.md, "Reproducing the release
# SBOM". Upgrading is an ordinary reviewed dependency change.
#
# Same ordering constraint as the report stage above: defined BEFORE the
# serving stage so a plain `docker build .` still produces the serving image.
# Build this one with `--target syft`.
FROM ghcr.io/anchore/syft:v1.51.0@sha256:678bfa565b60f747aac0f8e964fe5588a24445b8d0a480e91f6efd70020dfbb0 AS syft

# Stage 4 (default) — serve the built dist/ from BusyBox httpd.
# Image is ~150 KB, runs on port 3000 as the unprivileged `static` user.
FROM lipanski/docker-static-website:2.6.0@sha256:66a530684a934a9b94f65a90f286cba291a7daf4dd7d55dcc17f217915056cd5 AS serve
COPY --from=build /app/dist .
