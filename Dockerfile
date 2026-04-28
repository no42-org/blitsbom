# syntax=docker/dockerfile:1

# Stage 1 — build the static bundle.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2 — serve the built dist/ from nginx-alpine.
# Image is ~50 MB, runs on port 80, no runtime dependencies.
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
