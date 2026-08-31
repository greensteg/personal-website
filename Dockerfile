FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY astro.config.mjs tsconfig.json ./
COPY src/ ./src/
COPY content/ ./content/
COPY public/ ./public/

RUN ASTRO_TELEMETRY_DISABLED=1 npm run build

FROM caddy:2-alpine

COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist/ /srv/
