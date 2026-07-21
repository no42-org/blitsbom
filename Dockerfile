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
RUN npm run build

# Stage 2 — serve the built dist/ from BusyBox httpd.
# Image is ~150 KB, runs on port 3000 as the unprivileged `static` user.
FROM lipanski/docker-static-website:2.6.0@sha256:66a530684a934a9b94f65a90f286cba291a7daf4dd7d55dcc17f217915056cd5
COPY --from=build /app/dist .
