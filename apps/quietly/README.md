# quietly

A private wall for notes and photos. The author password opens the editor. The reader password opens a read-only timeline of published notes. Drafts stay private. A published note can be edited, moved back to drafts, or deleted.

The app sends no notifications and keeps no reader history. It has no replies, reactions, or analytics. Anyone with the reader password can see the published notes, so share it only with your intended reader. Change the reader password and recreate the service to revoke existing access.

## Preview locally

Use Node.js 24 or later. Copy `.env.example` to `.env` in this directory and set two distinct passphrases of at least 12 characters. Keep `.env` private.

```sh
HOST=127.0.0.1 QUIET_SECURE_COOKIE=false QUIET_ORIGIN=http://127.0.0.1:8080 \
  node --env-file=.env server.mjs
```

Open [the local preview](http://127.0.0.1:8080). Try each password in a different browser profile or sign out between them. The local SQLite database is stored under `data/`.

## Deploy to the personal server

In the production checkout, create `apps/quietly/.env` with the two passphrases and restrict the file to your account. From the checkout root, preview the launch and apply it when you're ready.

```sh
just app launch quietly
just app launch quietly apply
```

Caddy serves the app at `https://quietly.wentongzhang.com` after launch. Notes and photos live in the Compose project's named SQLite volume. Keep a private backup of that volume. Local preview data and the production volume are separate. Retiring the app through `just app retire quietly apply` preserves the production volume.
