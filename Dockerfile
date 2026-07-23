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
# serving image. Build this one with `--target report`.
FROM node:26-alpine@sha256:e88a35be04478413b7c71c455cd9865de9b9360e1f43456be5951032d7ac1a66 AS report
# The template the generator embeds into; overridable with --template.
ENV BLITSBOM_TEMPLATE=/opt/blitsbom/index.html
COPY --from=build /app/dist/index.html /opt/blitsbom/index.html
COPY --from=build /app/dist-generator/blitsbom-report.mjs /opt/blitsbom/blitsbom-report.mjs
# Reports are written relative to this working directory; mount your SBOM here.
WORKDIR /work
ENTRYPOINT ["node", "/opt/blitsbom/blitsbom-report.mjs"]
CMD ["--help"]

# Stage 3 (default) — serve the built dist/ from BusyBox httpd.
# Image is ~150 KB, runs on port 3000 as the unprivileged `static` user.
FROM lipanski/docker-static-website:2.6.0@sha256:66a530684a934a9b94f65a90f286cba291a7daf4dd7d55dcc17f217915056cd5 AS serve
COPY --from=build /app/dist .
