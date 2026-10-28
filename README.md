# 📦 Hoard

**Hoard** is a self-hosted, multi-user media tracker for the chronically backlogged.
Track everything you mean to read, watch, and play across **seven domains** — and let
the app gently roast you for it.

> Built with Next.js 14 (App Router) + TypeScript, Prisma + PostgreSQL, Tailwind +
> shadcn/ui. Designed to build and run natively on a Raspberry Pi (arm64).

---

## ✨ Features

- **Seven media domains**, each with its own first-class catalogue and metadata:
  - 📖 **Books** (OpenLibrary)
  - 🎬 **Movies** (TMDB)
  - 📺 **TV** (TMDB)
  - ✨ **Anime** (AniList)
  - 📚 **Manga** (AniList)
  - 🎮 **Games** (IGDB)
  - 💿 **Music** (Last.fm)
- **List & grid views** — flip between a dense table and a poster wall, filter by
  status, search your collection, and sort by recency, rating, title, or ranking.
- **Gloriously unhinged statuses** — under the hood every item is just `PLANNED`,
  `CONSUMING`, `COMPLETED`, `DROPPED`, or `ON_HOLD`. On screen those become things
  like *"Hoarding for the Apocalypse"*, *"Actively Hyperfixating"*, *"Conquered &
  Digested"*, or *"Banished to the Shadow Realm"*. Each item's label is randomly
  chosen but **stable** (seeded by its id) so it never flickers between renders.
- **1–10 ratings** plus a **hidden Elo Arena**. Give two items the *same* 1–10
  score, then head to the **Arena** to settle ties head-to-head ("Which is
  better?"). Each duel updates a hidden Elo rating that powers a dynamic 1..N
  **ranking** of your taste.
- **AI critic (Gemini)** — hit **Roast my taste** to have an AI savagely (but
  PG-13) review your top picks, or **Recommend a gem** to get a single tasteful,
  hidden-gem suggestion based on what you've ranked highest.
- **Multi-user** — cookie-based sessions, bcrypt-hashed passwords; everyone's
  hoard is their own.

---

## 🧱 Tech stack

| Layer        | Choice                                                        |
| ------------ | ------------------------------------------------------------- |
| Framework    | Next.js 14.2 (App Router, React Server Components)            |
| Language     | TypeScript (strict)                                           |
| UI           | Tailwind CSS + shadcn/ui (zinc dark theme), lucide-react      |
| Toasts       | sonner                                                        |
| ORM / DB     | Prisma 5 + PostgreSQL 16                                       |
| Auth         | Custom cookie sessions + bcryptjs                             |
| AI           | Google Gemini (`@google/genai`)                               |
| Validation   | zod                                                           |
| Container    | Docker (multi-stage) + docker-compose                         |

---

## 🚀 Quick start with Docker (recommended)

This is the easiest way to run Hoard — including on a Raspberry Pi.

```bash
# 1. Get the env file and fill in your API keys (see "API keys" below).
cp .env.example .env
$EDITOR .env

# 2. Create the backup folder (owned by you, so the backup service can write).
mkdir -p ../backups/hoard

# 3. Build and start the database, app and nightly backups.
docker compose up -d --build

# 4. Open the app.
#    Local:        http://localhost:3000
#    On a Pi/LAN:  http://<pi-ip>:3000

# 5. Register a user from the login screen and start hoarding.
#    The first account is the owner (it gets backup warnings).
```

The `app` container runs `prisma db push` on startup, which **idempotently syncs
the schema** to the Postgres database before the server boots — so there are no
manual migration steps. Data lives in the named `pgdata` volume and survives
restarts.

> **Raspberry Pi / ARM64:** both the Postgres and app images build and run
> natively as `arm64` on a Pi — no emulation. The Prisma schema already declares
> the `linux-arm64-openssl-3.0.x` engine target, and the Dockerfile installs
> `openssl` (which the Prisma engine needs at runtime).

A demo account can be seeded for kicking the tyres — see [Seeding](#-seeding-a-demo-user).

---

## 💾 Backups

The `backup` service (the `postgres:16-alpine` image running
[`scripts/backup.sh`](scripts/backup.sh)) dumps the database once a night.

- **Where:** `${HOARD_BACKUP_DIR:-../backups/hoard}` on the host, i.e. a
  `backups/hoard` folder next to this checkout. Inside it:
  - `daily/hoard-YYYY-MM-DD.dump`: one `pg_dump --format=custom` per day;
  - `weekly/hoard-YYYY-MM-DD.dump`: a copy of each Sunday's dump;
  - `status.json`: `{lastSuccess, lastAttempt, lastError, file, bytes}`.
- **When:** at `BACKUP_HOUR` (default 3, i.e. 03:00) in `TZ` (default
  `Europe/Berlin`). If the service starts after that hour and today's dump is
  missing, it makes one straight away.
- **Retention:** the newest 14 daily and 8 weekly dumps; older ones are deleted.
- **Safety:** each dump is written to a temp file and only renamed into place if
  it is non-empty and `pg_restore --list` can read it.
- **Ownership:** the service runs as `${HOARD_BACKUP_UID:-1000}:${HOARD_BACKUP_GID:-1000}`,
  so the files belong to you. Create the folder yourself before the first
  `docker compose up` (`mkdir -p ../backups/hoard`); a folder Docker creates is
  owned by root and the service can't write to it.
- **Monitoring:** Settings → System shows the last backup. The `backup-watch`
  job (09:00) sends the owner (the first registered account) a notification when
  the newest backup is older than 26 hours (or, once the app has been up for
  26 hours, when there is no backup at all).

Make a backup right now (for example before an upgrade):

```bash
docker compose exec backup sh /backup.sh --once
```

### Restoring

`pg_restore` into the running `db` service. `--clean --if-exists` drops and
recreates every object in the dump, so this **replaces the current data**. Stop
the app first so nothing writes during the restore:

```bash
docker compose stop app

# Pick a dump (newest daily shown here) and stream it into the db container.
docker compose exec -T db sh -c 'pg_restore --clean --if-exists --no-owner \
  -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < ../backups/hoard/daily/hoard-2026-10-28.dump

docker compose start app
```

To try a dump without touching live data, restore it into a scratch database
instead (`createdb -U "$POSTGRES_USER" hoard_restore_test` inside the `db`
container, then `-d hoard_restore_test`), and drop it afterwards.

---

## ⏰ Scheduled jobs

There is no separate jobs container. The app starts an in-process scheduler
(`src/instrumentation.ts` → `src/lib/jobs/`) that ticks every minute and runs
each job at its time in the server's `TZ`:

| Job            | When              | What it does                                         |
| -------------- | ----------------- | ---------------------------------------------------- |
| `migration`    | at every startup  | Idempotent data backfills that need new columns      |
| `backup-watch` | 09:00             | Warns the owner if the newest backup is over 26 h old |

- A run missed while the server was down runs **once** on the next start, not
  once per missed day.
- A Postgres advisory lock per job stops two app instances running the same job.
- Each job's last run time, status, error and duration are kept in the `JobRun`
  table and shown in Settings → System.
- Set `HOARD_SCHEDULER=off` to disable it when running outside Docker.
- A job seen for the first time (fresh deploy, newly added job) does not run
  straight away: it is recorded as "seeded" and first runs at its next slot.
- While a job runs, the scheduler holds one database connection for its lock.
  If you set `connection_limit` in `DATABASE_URL`, keep it at **3 or more**.
- Settings → System (backups and job runs) is shown to the owner only.

### Notifications

Notifications appear under the bell in the header. Each user can also push them
to their own [ntfy](https://ntfy.sh) topic URL and/or a Discord channel webhook
(Settings → Notifications, public https URLs only (no localhost or private
IP addresses), with a "Send test" button). Pushes
time out after 5 seconds; failures are recorded on the notification, never
thrown.

---

## 🛠️ Local development

You'll need Node 20+ and a PostgreSQL instance.

```bash
# 1. Install dependencies (this also runs `prisma generate`).
npm install

# 2. Point at a database. Either run a local Postgres, or reuse the compose db:
#    Set DATABASE_URL in your environment / .env, e.g.
#    DATABASE_URL=postgresql://hoard:password@localhost:5432/hoard?schema=public

# 3. Sync the schema to the database.
npm run db:push

# 4. Run the dev server.
npm run dev
# → http://localhost:3000
```

Other handy scripts:

| Script               | Purpose                                  |
| -------------------- | ---------------------------------------- |
| `npm run build`      | `prisma generate` + production build     |
| `npm run start`      | Start the production server              |
| `npm run db:push`    | Push the Prisma schema to the DB         |
| `npm run db:studio`  | Open Prisma Studio                       |
| `npm run lint`       | Lint with Next's ESLint config           |

---

## 🔑 API keys

Hoard talks to several free public APIs. Fill these into your `.env` (copied from
`.env.example`). The app degrades gracefully — a category whose key is missing
simply reports a friendly error when you search it.

| Service              | Env var(s)                              | Where to get it                                                            |
| -------------------- | --------------------------------------- | -------------------------------------------------------------------------- |
| **TMDB** (movies/TV) | `TMDB_API_KEY`                          | <https://www.themoviedb.org/settings/api> (use the **API Key v3 auth**)    |
| **IGDB** (games)     | `IGDB_CLIENT_ID`, `IGDB_CLIENT_SECRET`  | Register a Twitch app: <https://dev.twitch.tv/console/apps>                 |
| **Last.fm** (music)  | `LASTFM_API_KEY`                        | <https://www.last.fm/api/account/create>                                   |
| **Gemini** (AI)      | `GEMINI_API_KEY` (`GEMINI_MODEL` opt.)  | <https://aistudio.google.com/app/apikey>                                   |
| **Google Books**     | `GOOGLE_BOOKS_API_KEY` (optional)       | <https://console.cloud.google.com/apis/library/books.googleapis.com>       |

**No key required:**

- **Anime & Manga** use the [AniList GraphQL API](https://anilist.co) — no key, nothing to configure.
- **Books** default to [OpenLibrary](https://openlibrary.org), which needs no key.
  (`GOOGLE_BOOKS_API_KEY` is optional and only relevant if you switch the books
  provider to Google Books.)

The AI roast/recommend feature is the only one that's fully optional: without
`GEMINI_API_KEY`, the rest of the app works fine and the AI critic simply tells
you it isn't configured.

---

## 🌱 Seeding a demo user

A tiny, idempotent seed creates a demo account so you can log in without
registering, plus a small demo library (books, movies and anime with scores,
tiers and an Up next queue) so every page has content and `npm run smoke` is
reproducible. It only inserts rows that don't exist yet; catalogue rows use
`demo-` external ids.

```bash
# Local (uses tsx via the prisma seed hook):
npx prisma db seed
```

Default seeded credentials:

```
username: demo
password: demo1234
```

---

## 📂 How it's modelled

Media is **not** crammed into one polymorphic table. Each category gets its own
first-class table (`Book`, `Movie`, `TvShow`, `Anime`, `Manga`, `VideoGame`,
`MusicAlbum`) sharing a common display core (title, image, description, year)
plus category-specific extras. `UserMediaActivity` is the join layer that ties a
user to exactly one media row and carries the per-user state: status, 1–10
rating, the hidden Elo score, favourite flag, and notes.

---

## 📜 License

Personal project — use it, fork it, hoard responsibly.
