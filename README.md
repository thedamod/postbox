# postbox

A full-stack email client monorepo with a web app, React Native mobile app, and shared packages.

## Apps

- **`apps/web`** — Next.js web email client with Gmail OAuth, IMAP/SMTP, threads, folders, tagging rules, search, and sync.
- **`apps/mobile`** — Expo React Native mobile email client with the same features for Android/iOS.

## Packages

- **`packages/email-client`** — Shared email library: Gmail provider (IMAP/SMTP), message/thread/folder operations, compose/reply/forward, attachments, tagging engine (rules + auto-tag), and search.
- **`packages/ui`** — Shared UI component library with design tokens.

## Tech Stack

- **Monorepo**: pnpm workspaces + Turborepo
- **Web**: Next.js (App Router) + SQLite
- **Mobile**: Expo / React Native
- **Email**: Gmail IMAP & SMTP

## Getting Started

Requirements: Node 20+, pnpm.

```bash
pnpm install
pnpm dev:web      # start the web app
pnpm dev:mobile   # start the mobile app
pnpm build        # build all apps and packages
pnpm typecheck    # typecheck everything
```

## Projects

- **`apps/web`** — Next.js web app
- **`apps/mobile`** — Expo React Native app
- **`packages/email-client`** — shared email client library
- **`packages/ui`** — shared UI components
