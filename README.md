# 📦 Hoard

**Hoard** is a self-hosted, multi-user media tracker for the chronically backlogged.
Track everything you mean to read, watch, and play across **seven domains** — and let
the app gently roast you for it.

> Built with Next.js 14 (App Router) + TypeScript, Prisma + PostgreSQL, Tailwind +
> shadcn/ui. Designed to build and run natively on a Raspberry Pi (arm64).

---

## ✨ Features

A short tour; [`FEATURES.md`](FEATURES.md) describes everything in detail.

- **Seven media domains**, each with its own catalogue, search source and details:
  📖 Books (OpenLibrary), 🎬 Movies and 📺 TV (TMDB), ✨ Anime and 📚 Manga (AniList),
  🎮 Games (IGDB) and 💿 Albums (Last.fm). Wording follows the medium (*Unread / Reading /
  Read*, *Unplayed / Playing / Beaten*…), across six statuses: Planned, Ongoing,
  Completed, Paused, Retired and Dropped.
- **Ranking is the heart of it:** scores from 0.0 to 10.0 (shown out of 10, as stars or
  out of 100), a hand-placed **S–F tier list** per section, and an **Arena** of
  head-to-head duels that orders titles within a tier, challenges tier borders and picks
  your best of the year. TV seasons get their own tier lists.
- **Getting titles in:** search, select several, add by link or barcode, Search
  everything (`/`), a Cmd/Ctrl+K palette, hand-made entries, and imports from Hoard CSV,
  AniList, Letterboxd, Goodreads, StoryGraph, MyAnimeList, Trakt, Steam, any CSV, or a
  pasted list read by AI.
- **Tracking:** progress counters, TV seasons and episodes, rewatches, a dated diary with
  reviews, per-title history, play sessions, owned platforms and formats, tags, linked
  notes (`[[Title]]`), franchises grouped across media with watch order.
- **Deciding what's next:** Up next queues, a "what should I start tonight?" picker,
  a release calendar with a private iCal feed, countdowns, new-season alerts and notifications (in-app, ntfy, Discord).
- **Stats:** charts, streaks, a year in review (PNG and share link), goals, taste trends,
  compare periods, people stats and a taste profile.
- **AI (Gemini, optional):** a roast of your taste, recommendations across media, list
  reading and a year verdict.
- **Lists and sharing:** custom lists shared with other users, reference checklists (top
  250 films and more), saved views, read-only share links, and opt-in compare, watch
  together and an activity feed between users of the same Hoard.
- **Your data:** CSV, full JSON and Markdown (Obsidian) exports, a read-only token API
  ([`docs/API.md`](docs/API.md)), Steam / AniList / Last.fm accounts, nightly backups.
- **Multi-user and private:** cookie sessions, bcrypt-hashed passwords; everyone's hoard
  is their own unless they opt in to sharing. Installable as an app on phones.

---

## 🧱 Tech stack

| Layer        | Choice                                                        |
| ------------ | ------------------------------------------------------------- |
| Framework    | Next.js 14.2 (App Router, React Server Components)            |
| Language     | TypeScript (strict)                                           |
| UI           | Tailwind CSS + shadcn/ui (zinc dark theme), lucide-react      |
| Toasts       | sonner                                                        |
| ORM / DB     | Prisma 5 + PostgreSQL 16                                      |
| Auth         | Custom cookie sessions + bcryptjs                             |
| AI           | Google Gemini (`@google/genai`)                               |
| Validation   | zod                                                           |
| Drag & drop  | @dnd-kit                                                      |
| Files        | fflate (zip import/export), html-to-image (PNG export)        |
| Barcodes     | BarcodeDetector, with @zxing/browser as a fallback            |
| Tests        | Vitest (unit), playwright-core + local Chrome (smoke)         |
| Container    | Docker (multi-stage) + docker-compose                         |

---

## 🚀 Quick start with Docker (recommended)

This is the easiest way to run Hoard — including on a Raspberry Pi.

```bash
# 1. Get the env file and fill in your API keys (see "Configuration" below).
cp .env.example .env
$EDITOR .env

# 2. Create the backup folder (owned by you; see "Backups" for who writes it).
mkdir -p ../backups/hoard

# 3. Build and start the database and app. Add `--profile backup` for the
#    built-in nightly backups if the host doesn't back up its databases itself.
docker compose up -d --build

# 4. Open the app.
#    Local:        http://localhost:3000
#    On a Pi/LAN:  http://<pi-ip>:3000

# 5. Register a user from the login screen and start hoarding.
#    The first account is the owner (it gets backup warnings).
```

On startup the `app` container ([`docker-entrypoint.sh`](docker-entrypoint.sh)) runs
the SQL files in `prisma/sql/` and then `prisma db push`, which **idempotently syncs
the schema** to the Postgres database before the server boots — so there are no
manual migration steps. Backfills that need new columns run once, as the `migration`
job, when the app starts (see [Scheduled jobs](#-scheduled-jobs)). Data lives in the
named `pgdata` volume and survives restarts.

> **Raspberry Pi / ARM64:** both the Postgres and app images build and run
> natively as `arm64` on a Pi — no emulation. The Prisma schema already declares
> the `linux-arm64-openssl-3.0.x` engine target, and the Dockerfile installs
> `openssl` (which the Prisma engine needs at runtime).

A demo account can be seeded for kicking the tyres — see [Seeding](#-seeding-a-demo-user).

---

## 💾 Backups

Hoard **only reads** the backup folder: the app mounts
`${HOARD_BACKUP_DIR:-../backups/hoard}` (a `backups/hoard` folder next to this
checkout) read-only at `/backups`, and Settings → System and the `backup-watch`
job report on what they find there. Something else has to write the dumps;
pick one of two options.

**Option A: a backup you already run on the host.** If a host cron already
dumps your databases into that folder (e.g. `pg_dump -Fc` per container into
`~/backups/<db>/<db>-YYYYMMDD.dump`), point `HOARD_BACKUP_DIR` at it and you're
done. Without a `status.json`, Hoard takes the **newest `*.dump` file** (by
modification time, in the folder itself or in `daily/` / `weekly/`; `*.tmp` is
ignored) as the last successful backup. Leave the `backup` profile off: such a
cron often dumps "every running `postgres:*` container" and would also exec
into the backup container, and its own retention may delete our dumps.

**Option B: the opt-in `backup` service.** For hosts without their own
backups, the `backup` service (the `postgres:16-alpine` image running
[`scripts/backup.sh`](scripts/backup.sh)) dumps the database once a night. It
sits behind a compose profile, so a plain `docker compose up -d --build` does
**not** start it:

```bash
mkdir -p ../backups/hoard          # create it yourself, see Ownership
docker compose --profile backup up -d --build
```

- **Where:** inside the backup folder:
  - `daily/hoard-YYYY-MM-DD.dump`: one `pg_dump --format=custom` per day;
  - `weekly/hoard-YYYY-MM-DD.dump`: a copy of each Sunday's dump;
  - `status.json`: `{lastSuccess, lastAttempt, lastError, file, bytes}` (when
    present, Hoard reads this instead of looking at the dump files).
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

Make a backup right now with the service (for example before an upgrade):

```bash
docker compose --profile backup exec backup sh /backup.sh --once
```

Without the service, dump through the `db` container instead:

```bash
docker compose exec -T db sh -c 'pg_dump --format=custom -U "$POSTGRES_USER" "$POSTGRES_DB"' \
  > ../backups/hoard/hoard-predeploy-$(date +%Y%m%d-%H%M).dump
```

**Monitoring (both options):** Settings → System shows the newest backup. The
`backup-watch` job (09:00) sends the owner (the first registered account) a
notification when the newest backup is older than 26 hours (or, once the app
has been up for 26 hours, when there is no backup at all).

### Restoring

Restore into an **emptied** schema: the app adds columns, tables and data on
start (`prisma db push`, `prisma/sql/*.sql`, the migration job), so restoring
over a live schema can leave objects the dump doesn't know about. This
**replaces all current data**. Stop the app first so nothing writes:

```bash
docker compose stop app

# 1. Empty the schema.
docker compose exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"'

# 2. Restore a dump into it (newest daily shown here).
docker compose exec -T db sh -c 'pg_restore --no-owner \
  -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < ../backups/hoard/daily/hoard-2026-10-28.dump
#    (or e.g. ../backups/hoard/hoard-20261028.dump from a host cron)

# 3. Start the app (it brings the schema up to date for its own version).
docker compose start app
```

To try a dump without touching live data, restore it into a scratch database
instead (`createdb -U "$POSTGRES_USER" hoard_restore_test` inside the `db`
container, then `-d hoard_restore_test`), and drop it afterwards.

### Before an upgrade, and rolling back

**Before deploying a new version**, take a manual dump through the `db`
container (this works on every version, with or without the `backup` service):

```bash
mkdir -p ../backups/hoard
docker compose exec -T db sh -c 'pg_dump --format=custom -U "$POSTGRES_USER" "$POSTGRES_DB"' \
  > ../backups/hoard/hoard-predeploy-$(date +%Y%m%d-%H%M).dump
```

(With the `backup` profile on, `docker compose --profile backup exec backup sh /backup.sh --once` works too.)

**A plain redeploy of an older version does not work after a schema
upgrade:** the newer schema has columns and tables the older code doesn't
expect, and the older container's `prisma db push` refuses to drop them, so
the app crash-loops. Roll back with the pre-deploy dump instead:

1. Stop the app: `docker compose stop app`.
2. Empty the schema (`DROP SCHEMA public CASCADE; CREATE SCHEMA public;`, as in
   step 1 above).
3. Restore the pre-deploy dump with `pg_restore --no-owner` (step 2 above).
4. Check out the previous commit: `git checkout <previous-commit>`.
5. Rebuild and start: `docker compose up -d --build`.

---

## ⏰ Scheduled jobs

There is no separate jobs container. The app starts an in-process scheduler
(`src/instrumentation.ts` → `src/lib/jobs/`) that ticks every minute and runs
each job at its time in the server's `TZ`:

| Job             | When          | What it does                                                    |
| --------------- | ------------- | --------------------------------------------------------------- |
| `migration`     | every startup | One-off backfills that need new columns; each step runs once    |
| `metadata`      | 03:30         | Refreshes title details older than 30 days (up to 1000 a night) |
| `new-seasons`   | 04:00         | Refreshes shows you watch, finds new seasons, caches sequels    |
| `steam`         | 04:30         | Updates Steam playtime of linked accounts                       |
| `lastfm`        | 05:00         | Suggests "Mark as Listened?" from Last.fm plays (300 a night)   |
| `anilist-sync`  | 05:30         | Pulls the AniList lists of users with an AniList username       |
| `taste-profile` | Sundays 05:45 | Rebuilds every user's taste profile                             |
| `releases`      | 06:00         | Notifies about titles out today and new episodes                |
| `airing`        | 06:30         | Refreshes anime's next airing episode (after `releases`)        |
| `backup-watch`  | 09:00         | Warns the owner if the newest backup is over 26 h old           |

The times live in [`src/lib/jobs/times.ts`](src/lib/jobs/times.ts). A job whose key is
missing does nothing (`steam` without `STEAM_API_KEY`, `lastfm` without `LASTFM_API_KEY`)
or skips that provider (`metadata` and `new-seasons` without TMDB, IGDB or Last.fm keys),
and records a normal run. Users can sync their own Steam, Last.fm and AniList accounts
at any time from Settings → Accounts.

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

Notifications appear under the bell in the header: releases and new episodes
(the `releases` job), new seasons (`new-seasons`), Last.fm "Mark as Listened?"
suggestions (`lastfm`), AniList sync errors, lists shared with you and, for the owner
only, backup problems (`backup-watch`).

Each user can also push them to their own [ntfy](https://ntfy.sh) topic URL and/or a
Discord channel webhook (Settings → Notifications: public https URLs only, no
localhost or private IP addresses, with a "Send test" button) and pick which kinds are
pushed; the bell always shows all of them. Pushes time out after 5 seconds; failures
are recorded on the notification, never thrown.

---

## 🛠️ Local development

You'll need Node 20+ and a PostgreSQL instance.

```bash
# 1. Install dependencies (this also runs `prisma generate`).
npm install

# 2. Point at a database. Either run a local Postgres, or reuse the compose db:
#    Set DATABASE_URL in your environment / .env, e.g.
#    DATABASE_URL=postgresql://hoard:password@localhost:5432/hoard?schema=public

# 3. Sync the schema to the database. (A database from before the roadmap
#    build needs the prisma/sql files first, as the container does:
#    for f in prisma/sql/*.sql; do npx prisma db execute --file "$f" --schema prisma/schema.prisma; done)
npm run db:push

# 4. Optional: the demo users and library (see "Seeding" below).
npx prisma db seed

# 5. Run the dev server.
npm run dev
# → http://localhost:3000
```

The scheduler starts with the server. Set `HOARD_SCHEDULER=off` if you don't want
nightly jobs or the startup backfills while debugging.

Other handy scripts:

| Script                | Purpose                                                                  |
| --------------------- | ------------------------------------------------------------------------ |
| `npm run build`       | `prisma generate` + production build                                     |
| `npm run start`       | Start the production server                                              |
| `npm test`            | Run the Vitest unit tests                                                |
| `npm run smoke`       | Log in as `demo` and visit every page in Chrome (needs a running server) |
| `npm run lint`        | Lint with Next's ESLint config                                           |
| `npm run db:push`     | Push the Prisma schema to the DB                                         |
| `npm run db:generate` | Regenerate the Prisma client                                             |
| `npm run db:studio`   | Open Prisma Studio                                                       |

---

## 🔑 Configuration

Everything is set in `.env` (copied from [`.env.example`](.env.example), which has
the same notes); `docker-compose.yml` passes each variable to the container that needs
it. Only the database settings are required. Every other variable is optional: a
feature whose key is missing shows a friendly "not configured" message and the rest of
the app keeps working.

### Database and server

| Variable                                            | Default                         | What it does                                                                                                 |
| --------------------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | required                        | The `db` container's database; the opt-in backup service logs in with them too                                  |
| `DATABASE_URL`                                      | required                        | How the app reaches Postgres; must agree with the three above. With `connection_limit`, keep it at 3 or more |
| `HOARD_PUBLISH`                                     | `3000:3000`                     | Host port binding for the app. Behind a tunnel use a localhost port, e.g. `127.0.0.1:3010:3000`              |
| `HOARD_PUBLIC_URL`                                  | `https://hoard.timhufnagel.org` | Hoard's outside address: share links, the iCal feed, links in notifications, the AniList OAuth redirect      |
| `TZ`                                                | `Europe/Berlin`                 | Server time zone: job times, the nightly backup, and day boundaries for users who haven't picked a time zone |
| `HOARD_SCHEDULER`                                   | on                              | `off` disables the in-process scheduler (local debugging; not passed through compose)                        |

### Backups

| Variable                               | Default            | What it does                                                                                                        |
| -------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------- |
| `HOARD_BACKUP_DIR`                     | `../backups/hoard` | Host folder for the dumps (relative to this checkout); the app mounts it read-only. Create it before the first `up` |
| `HOARD_BACKUP_UID`, `HOARD_BACKUP_GID` | `1000`             | User and group the opt-in backup service runs as, so the dumps belong to you                                        |
| `BACKUP_HOUR`                          | `3`                | Hour of the opt-in service's nightly dump (0–23, in `TZ`)                                                           |

### Search sources

| Service     | Variable(s)                            | Enables                                                                                 | Where to get it                                             |
| ----------- | -------------------------------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| **TMDB**    | `TMDB_API_KEY`                         | Movies and TV: search, details, seasons, Letterboxd and Trakt matching                  | <https://www.themoviedb.org/settings/api> (API Key v3 auth) |
| **IGDB**    | `IGDB_CLIENT_ID`, `IGDB_CLIENT_SECRET` | Games: search, details, time to beat, Steam matching                                    | A Twitch app: <https://dev.twitch.tv/console/apps>          |
| **Last.fm** | `LASTFM_API_KEY`                       | Albums: search and details, "Mark as Listened?" suggestions                             | <https://www.last.fm/api/account/create>                    |

Without one of these, that section's search reports that it isn't configured and its
nightly lookups are skipped. **No key required:** anime and manga use the
[AniList GraphQL API](https://anilist.co), and books use
[OpenLibrary](https://openlibrary.org). `GOOGLE_BOOKS_API_KEY` is still listed in
`.env.example` and passed through compose, but nothing reads it: books always come from
OpenLibrary.

### Optional features

| Variable(s)                                                   | Enables                                                                                                                                                            | Without it                                           |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| `GEMINI_API_KEY` (`GEMINI_MODEL`, default `gemini-2.5-flash`) | The AI critic, Recommend across media, Paste a list (import and reference lists) and the year-in-review verdict. <https://aistudio.google.com/app/apikey>          | Those buttons say the AI isn't configured            |
| `TRAKT_CLIENT_ID`                                             | The Trakt import (public profiles). Create an app at <https://trakt.tv/oauth/applications>                                                                         | The Trakt source is disabled with a note             |
| `STEAM_API_KEY`                                               | Steam library import and the nightly playtime job. <https://steamcommunity.com/dev/apikey>                                                                         | Settings → Accounts → Steam asks the owner for a key |
| `ANILIST_CLIENT_ID`, `ANILIST_CLIENT_SECRET`                  | Pushing anime and manga changes to AniList. Register a client at <https://anilist.co/settings/developer> with the redirect `${HOARD_PUBLIC_URL}/api/oauth/anilist` | No push; the nightly AniList pull still works        |
| `HOARD_SECRET`                                                | Encrypts saved OAuth tokens (AES-256-GCM): 32+ random characters, e.g. `openssl rand -base64 48`. Needed for the AniList push; changing it means reconnecting      | No token is ever stored, so the push stays off       |

On hoard.timhufnagel.org the Steam, Trakt and AniList-push keys (`STEAM_API_KEY`,
`TRAKT_CLIENT_ID`, `ANILIST_CLIENT_ID`, `ANILIST_CLIENT_SECRET`, `HOARD_SECRET`) have not
been added yet; those features are built and wait for them.

Development only: `HOARD_BACKUP_MOUNT` points the app at another backups folder (default
`/backups`), and `BASE_URL`, `CHROME_PATH`, `SMOKE_USER` and `SMOKE_PASSWORD` steer
`npm run smoke`.

---

## 🌱 Seeding a demo user

A small, idempotent seed creates a demo account so you can log in without
registering, plus a demo library (books, movies, anime and a TV show with scores,
tiers, an Up next queue, tags, seasons, a custom list, a reference list, a goal, a
saved view and share links) so every page has content and `npm run smoke` is
reproducible. It also creates a second user, `demo2`, opted in to compare and the
feed, for trying the friends features. It only inserts rows that don't exist yet;
catalogue rows use `demo-` external ids. It is meant for local use; production never
runs it.

```bash
# Local (uses tsx via the prisma seed hook):
npx prisma db seed
```

Default seeded credentials:

```
username: demo     (or demo2)
password: demo1234
```

---

## 📂 How it's modelled

Media is **not** crammed into one polymorphic table. Each category gets its own
first-class table (`Book`, `Movie`, `TvShow`, `Anime`, `Manga`, `VideoGame`,
`MusicAlbum`) sharing a common display core (title, image, description, year,
release date, genres) plus category-specific extras. These rows are a catalogue
shared by every user: what a user sends only ever fills empty columns, and the
provider (through the nightly `metadata` job) owns the rest.

`UserMediaActivity` is the join layer that ties a user to exactly one media row and
carries the per-user state: status, a 0–10 score with one decimal, tier and place,
Up next order, the hidden Elo score and duel count, progress, favourite, tags,
notes, owned platforms or format, and Steam playtime. (The `subScores` column is
legacy and no longer shown.)

Around it:

- **History:** `ActivityEvent` (adds, status, score, progress, tier, queue, import,
  rewatch and review changes), `DiaryEntry` (one per finish, with score and review)
  and `PlaySession`.
- **Ranking extras:** `TvSeason` + `SeasonActivity` (season tracking and season
  tiers) and `YearDuelScore` (best of the year).
- **Collections:** `Franchise`, `CustomList` (+ items and members), `RefList`
  (+ items), `SavedView` and `Goal`.
- **Per user:** `User.prefs` (a JSON column validated by `src/lib/prefs.ts`),
  `TasteProfile`, `Notification`, `ShareLink`, `ApiToken` (SHA-256 hashes only) and
  `ExternalLink` (Steam, Last.fm and AniList accounts; tokens encrypted).
- **System:** `JobRun` (scheduler state) and `WatchProviderCache`.

Schema changes are additive only (new tables, nullable or defaulted columns), so
`prisma db push` never needs `--accept-data-loss`.

---

## 📜 License

Personal project — use it, fork it, hoard responsibly.
