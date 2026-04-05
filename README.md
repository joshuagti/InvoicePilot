# InvoicePilot

InvoicePilot is a **human-in-the-loop** web app for triaging supplier emails: it connects to IMAP mailboxes, pulls messages that look like statements or invoices, uses **OpenAI** to extract structured fields, applies **supplier rules** to decide what counts toward payables, and routes uncertain items to a **review queue**. The dashboard covers review, payables, statements, suppliers (including per-supplier spend), and settings for batch AI reprocessing.

## Features

- **IMAP ingestion** — Poll configured mailboxes, parse bodies and attachments (including PDF text extraction where applicable), dedupe by mailbox + IMAP UID, and store normalized content for AI and rules.
- **AI-assisted extraction** — Classifies document type (statement, invoice, credit note, etc.), guesses payment model, extracts dates, amounts, currency, and supplier cues; conservative defaults with explicit review when confidence is low.
- **Suppliers and rules** — Suppliers keyed by normalized name and email domains; rules can steer classification and “should count” decisions; the system can learn from review decisions over time.
- **Review workflow** — Queue for items that need a human decision; audit events record important actions.
- **Payables and statements** — Views aligned with monthly vs pay-per-order workflows; mark documents paid with optional notes.
- **Settings** — Save the OpenAI API key (encrypted) and re-run AI on stored emails without re-fetching mail—useful after prompt/model or rule changes.

## Tech stack

| Area | Choice |
|------|--------|
| Framework | [Next.js](https://nextjs.org/) 15 (App Router), React 19 |
| Language | TypeScript |
| Database | MySQL 8 via [Prisma](https://www.prisma.io/) |
| Styling | Tailwind CSS 4 |
| Email | [imapflow](https://github.com/postalsys/imapflow), [mailparser](https://nodemailer.com/extras/mailparser/) |
| AI | [OpenAI](https://platform.openai.com/) API (default model configurable) |
| PDF text | [pdf-parse](https://www.npmjs.com/package/pdf-parse) |
| Logging | [pino](https://getpino.io/) |

Production builds use Next.js **standalone** output and the included `Dockerfile`.

## Prerequisites

- **Node.js** 20+ (matches the Docker image)
- **MySQL** 8.x (local install or Docker)
- An **OpenAI API key** (entered in **Dashboard → Settings** after login, not in `.env`)
- Optional: a host or cron runner to call the mail poll HTTP endpoint on a schedule

## Quick start (local development)

1. **Clone and install**

   ```bash
   git clone <repository-url>
   cd InvoicePilot
   npm install
   ```

2. **Start MySQL** (example using the repo’s Compose file — database only):

   ```bash
   docker compose up -d db
   ```

   Default credentials in `docker-compose.yml` are `user` / `password`, database `invoice_pilot`, port `3306`.

3. **Configure environment**

   ```bash
   cp .env.example .env
   ```

   Edit `.env`: set `DATABASE_URL`, `ENCRYPTION_KEY` (32-byte hex), `APP_PASSWORD`, and `SESSION_SECRET` (see [Environment variables](#environment-variables)). After you sign in, open **Settings** and paste your OpenAI API key (stored encrypted in the database).

4. **Apply the schema**

   ```bash
   npm run db:migrate
   ```

   For a throwaway local DB you can use `npm run db:push` instead of migrations, but the project ships Prisma migrations for repeatable deploys.

5. **Run the app**

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000), sign in with `APP_PASSWORD`, then add mailboxes under the dashboard/API and trigger a poll (UI or API).

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | MySQL connection string for Prisma. |
| `ENCRYPTION_KEY` | Yes | 32-byte key as **64 hex characters**; encrypts stored IMAP passwords and the OpenAI API key saved in Settings. Generate: `openssl rand -hex 32`. |
| `APP_PASSWORD` | Yes | Single shared password for dashboard login (see [Authentication](#authentication)). |
| `SESSION_SECRET` | Yes | Secret for signing the session cookie; **minimum 16 characters**. |
| `OPENAI_MODEL` | No | Model id (default in code favors a small/cheap model; example in `.env.example`: `gpt-4o-mini`). |
| `CRON_SECRET` | No | If set, `POST /api/mail/poll` accepts `Authorization: Bearer <CRON_SECRET>` without a browser session (for schedulers). |

Copy `.env.example` and fill in values; never commit real secrets.

## Database

- **Develop:** `npm run db:migrate` creates/updates the schema from `prisma/migrations`.
- **Generate client only:** `npm run db:generate` (also runs on `postinstall`).
- **Production:** run `npx prisma migrate deploy` against your `DATABASE_URL` before or as part of deployment. The provided `Dockerfile` builds the app but does not run migrations automatically—you should run them in your pipeline or entrypoint.

## Docker (app + database)

The `web` service is behind a Compose **profile** so you can run only MySQL by default.

- **Database only:** `docker compose up -d db`
- **App + DB:** `docker compose --profile app up -d --build`

The `web` service expects `DATABASE_URL` pointing at host `db` (see `docker-compose.yml`). Build arguments and runtime env should include the same variables as `.env.example` where applicable.

## Mail polling and automation

Ingestion is driven by **`POST /api/mail/poll`**, which runs the mailbox poller (IMAP fetch, parse, AI, rules, persistence).

- **From the browser:** calls are allowed when you are logged in (session cookie).
- **From cron / CI:** set `CRON_SECRET` and call:

  ```bash
  curl -X POST -H "Authorization: Bearer YOUR_CRON_SECRET" https://your-host/api/mail/poll
  ```

  The middleware allows this path with the bearer token even without a session.

Optional: **`POST /api/mail/reprocess`** (authenticated) re-runs AI on emails already in the database—body JSON `{ "limit": 100 }` or `{ "emailId": "<id>" }` for a single message (max limit 500).

## Authentication

InvoicePilot uses a **single application password** (`APP_PASSWORD`) and an **HTTP-only signed cookie** (`ip_session`) valid for seven days. This is suitable for small teams or single-operator setups; it is not multi-user identity management.

Protected areas (see `src/middleware.ts`):

- `/dashboard/*`
- `/api/mail/*`, `/api/statements/*`, `/api/suppliers/*`, `/api/mailboxes/*`, `/api/settings/*`

Public routes include `/`, `/login`, and `/api/auth/login` / `/api/auth/logout`.

## Project layout (high level)

```text
prisma/                 Schema and migrations
src/app/                Next.js App Router pages and API routes
src/components/         React UI (dashboard, review, suppliers, etc.)
src/lib/
  ai/                   OpenAI extraction and JSON schemas
  auth/                 Session cookie helpers
  crypto/               Secret encryption for mailbox passwords and settings secrets
  db/                   Prisma client
  email/                IMAP, parsing, attachments, normalization
  ingestion/            Poll mail + reprocess pipelines
  rules/                Decision engine, patterns, learning
  audit/                Audit logging
public/                 Static assets (logo, favicon)
```

## NPM scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | Dev server (Turbopack) |
| `npm run build` | Production build |
| `npm run start` | Start production server (after `build`) |
| `npm run lint` | ESLint (Next.js config) |
| `npm run db:generate` | Regenerate Prisma Client |
| `npm run db:push` | Push schema to DB (prototyping) |
| `npm run db:migrate` | Create/apply dev migrations |

## Security notes

- Rotate `ENCRYPTION_KEY` only with a deliberate migration plan: existing mailbox passwords and the saved OpenAI API key cannot be decrypted if the key changes.
- Use strong `APP_PASSWORD` and `SESSION_SECRET` in production; serve the app over HTTPS so the session cookie can be marked `secure` in production.
- Treat `CRON_SECRET` like an API key; scope network access to `/api/mail/poll` if possible.

## License

This project is private (`"private": true` in `package.json`). Add a `LICENSE` file if you intend to distribute it.
