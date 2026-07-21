# VATUSA Visiting Compliance Checker

A web app that helps controllers check compliance with the VATUSA visiting
controller requirements. You sign in with Discord; the app then matches your
Discord account to your VATSIM CID and pulls your VATUSA profile.

## Stack

- **Next.js 15** (App Router) + **TypeScript**
- **MUI** for UI
- **Better Auth** for authentication (Discord social login), backed by SQLite

## How it works

1. User signs in with **Discord** (Better Auth handles the OAuth flow).
2. We read the Discord user id and call
   `GET https://api.vatsim.net/v2/members/discord/:discord_user_id`.
   - `200 { user_id }` → that `user_id` is the VATSIM **CID**.
   - `404 { detail: "Not Found" }` → the app shows _"Your Discord account is not
     linked to VATSIM. Please sign into community.vatsim.net."_
3. We call `GET https://api.vatusa.net/v2/user/:cid` and display the user's
   **name**, **rating** (mapped from the VATSIM rating table), and **home
   subdivision** (VATUSA `facility`).

All external API calls run server-side.

## Getting started

### 1. Install dependencies

```bash
npm install
```

> `better-sqlite3` is a native module. If your npm blocks install scripts, run
> `npm approve-scripts better-sqlite3 && npm rebuild better-sqlite3`.

### 2. Create a Discord OAuth application

1. Go to https://discord.com/developers/applications and create an app.
2. Under **OAuth2**, add a redirect URL:
   `http://localhost:3000/api/auth/callback/discord`
3. Copy the **Client ID** and **Client Secret**.

### 3. Configure environment

Copy `.env.example` to `.env.local` and fill in the values:

```bash
cp .env.example .env.local
```

Generate a secret with `npx @better-auth/cli secret` (or `openssl rand -base64 32`).

### 4. Create the database schema

```bash
npm run auth:migrate
```

This creates `sqlite.db` with the Better Auth tables (including the `discordId`
field on the user record).

### 5. Run

```bash
npm run dev
```

Open http://localhost:3000.

## Project layout

| Path                                | Purpose                                          |
| ----------------------------------- | ------------------------------------------------ |
| `src/lib/auth.ts`                   | Better Auth server config (Discord + SQLite)     |
| `src/lib/auth-client.ts`            | Better Auth React client                         |
| `src/app/api/auth/[...all]/route.ts`| Auth route handler                               |
| `src/lib/vatsim.ts`                 | VATSIM/VATUSA lookups + rating table             |
| `src/app/page.tsx`                  | Login page                                       |
| `src/app/dashboard/page.tsx`        | Profile view (name, rating, home subdivision)    |

## Deploying to Railway

The app is configured for [Railway](https://railway.com) using the **Railpack**
builder ([`railway.json`](railway.json)). SQLite is the datastore; it lives on a
persistent volume so data survives deploys.

### 1. Create the service

Create a new Railway project from this repo. Railpack auto-detects Next.js,
installs dependencies (building the native `better-sqlite3` module), and runs
`next build`.

### 2. Add a volume (required for SQLite persistence)

Add a **Volume** to the service and mount it at `/data`. Without this, the
SQLite file lives on the container's ephemeral disk and is wiped on every
deploy.

> Keep the service at **1 replica** (already set in `railway.json`). SQLite is a
> single-writer, single-node database — it can't be shared across replicas.

### 3. Set environment variables

| Variable | Value |
| --- | --- |
| `BETTER_AUTH_SECRET` | a random secret (`openssl rand -base64 32`) |
| `DATABASE_PATH` | `/data/sqlite.db` (the mounted volume) |
| `DISCORD_CLIENT_ID` | from your Discord OAuth app |
| `DISCORD_CLIENT_SECRET` | from your Discord OAuth app |
| `BETTER_AUTH_URL` | _optional_ — defaults to `https://$RAILWAY_PUBLIC_DOMAIN` |

`PORT` is provided by Railway automatically; `next start` respects it.

### 4. Update the Discord redirect URL

In the Discord developer portal, add the production callback:
`https://<your-domain>/api/auth/callback/discord`

### 5. Deploy

On deploy, the start command runs `npm run auth:migrate` (creates/updates the
Better Auth tables on the volume) and then `npm run start`. The migration is
idempotent, so it's safe to run on every boot.

## Roadmap

This is the foundation. Next up: encode the actual VATUSA visiting rule
requirements and evaluate the user's profile against them.
