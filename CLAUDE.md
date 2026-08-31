# Personal Website

## Overview

Wentong Zhang's minimalist personal website, built with Astro and deployed as a static Caddy site. Astro generates the About, Thoughts, Contact, and individual post pages at build time. There is no production Node server.

## Stack

- Astro, static output
- TypeScript
- Plain global CSS
- Markdown content collections
- `marked` for trusted build-time Markdown rendering
- Caddy in Docker for production hosting

## Project structure

```text
src/
  components/Nav.astro
  layouts/BaseLayout.astro
  lib/content.ts
  pages/
    index.astro
    contact/index.astro
    thoughts/index.astro
    thoughts/[slug].astro
  styles/global.css
content/
  about.md
  contact.md
  posts/*.md
public/
  assets/
  scripts/mtg.js
Dockerfile
Caddyfile
```

The root-level HTML and `shared/` files are the pre-Astro implementation. They are retained temporarily for comparison during migration, but are not included in the production image.

## Development

```sh
npm install
npm run dev
npm run check
npm run build
```

`just serve 4173` starts the development server on port 4173. `just preview 4173` serves the production build locally.

## Content

Posts live in `content/posts/*.md` and are discovered automatically by the content collection configured in `src/content.config.ts`. Do not manually register posts in `content/posts/index.json`; it is part of the retired static implementation.

Post frontmatter:

```yaml
---
title: "Post title"
date: "Month D, YYYY"
id: 4
display: true
tags: "Category, Another Category"
---
```

`display: false` excludes a post from both the listing and generated routes. Clean post slugs are derived from titles.

### Magic card syntax

- `[[Card Name]]` creates a Scryfall-backed card link and preview.
- `[[Card Name|Custom label]]` uses custom visible text.
- Fenced `deck` blocks create interactive deck lists.

Build-time preprocessing is in `src/lib/content.ts`. Browser-side card lookup and deck enhancement are in `public/scripts/mtg.js`.

## Routes

- `/` — About
- `/thoughts/` — Posts
- `/thoughts/<slug>/` — Generated post
- `/contact/` — Contact

Static compatibility pages preserve `/thoughts.html`, `/contact.html`, and `/post.html?slug=...` by redirecting them to the clean routes.

## Deployment

The Dockerfile uses a Node build stage to run `npm ci` and `npm run build`, then copies `dist/` into the existing Caddy image. The host only needs Docker; Astro is not installed globally and does not run in production.

- `just deploy` — build and start the container
- `just redeploy` — rebuild after changes
- `just stop` — stop the container
- `just logs` — view logs
- `just status` — inspect container status

The existing cron deployment pulls `main` and rebuilds the Docker image.
