# syntax=docker/dockerfile:1

# Stage 1 — build the static bundle.
# node:22-alpine ships npm 10.x; vitest@4.x declares a peer on vite >= 6
# while the project still pins vite ^5.4.8. npm 11 tolerates that drift,
# npm 10 doesn't and `npm ci` fails complaining about missing esbuild
# entries. Pin npm 11 explicitly so install behavior matches local + CI.
FROM node:22-alpine AS build
WORKDIR /app
RUN npm install -g npm@11
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2 — serve the built dist/ from nginx-alpine.
# Image is ~50 MB, runs on port 80, no runtime dependencies.
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
