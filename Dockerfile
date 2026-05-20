# syntax=docker/dockerfile:1

# Stage 1 — build the static bundle.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-fund --no-audit
COPY . .
RUN npm run build

# Stage 2 — serve the built dist/ from BusyBox httpd.
# Image is ~150 KB, runs on port 3000 as the unprivileged `static` user.
FROM lipanski/docker-static-website:2.6.0
COPY --from=build /app/dist .
