# syntax=docker/dockerfile:1

# Stage 1 — build the static bundle.
# vitest@4.x declares a peer on vite >= 6 while the project still pins
# vite ^5.4.8. npm 11 tolerates the drift; the npm 10.x bundled with
# node:22-alpine doesn't, so `npm ci` fails alone. Mirror the Makefile's
# `npm install` fallback to handle either case without changing the
# image's bundled npm.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-fund --no-audit || npm install --no-fund --no-audit
COPY . .
RUN npm run build

# Stage 2 — serve the built dist/ from nginx-alpine.
# Image is ~50 MB, runs on port 80, no runtime dependencies.
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
