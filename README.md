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

# 2. Build and start the database + app.
docker compose up -d --build

# 3. Open the app.
#    Local:        http://localhost:3000
#    On a Pi/LAN:  http://<pi-ip>:3000

# 4. Register a user from the login screen and start hoarding.
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
registering. It only inserts the user if it doesn't already exist.

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
