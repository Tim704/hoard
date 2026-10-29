# Roadmap

> **Status (28 Oct 2026):** everything below is built, the four foundations and phases 1–9,
> except the [Skipped](#skipped-and-why) table. Two of its rows went in the way the table
> itself suggested: "hide sections I don't use" is part of the Settings page (F4), and the
> week start setting arrived with the calendar (5.6). [`FEATURES.md`](FEATURES.md)
> describes the app as it is now; the build's decisions are in
> `docs/superpowers/specs/2026-10-28-roadmap-build.md`.
>
> **Built but inactive until the owner adds keys** (each shows a "not configured" note
> until then):
> - **8.1 Steam** library import and nightly playtime: `STEAM_API_KEY`.
> - **2.7 Trakt** import: `TRAKT_CLIENT_ID`.
> - **8.2 AniList push** (sending your changes to AniList): `ANILIST_CLIENT_ID`,
>   `ANILIST_CLIENT_SECRET` and `HOARD_SECRET`. The nightly AniList *pull* needs no key.
>
> The AI features (the critic, 2.8 paste a list, 6.1's verdict, 7.1 recommendations) need
> `GEMINI_API_KEY`, as before. See README → Configuration for every variable.
>
> **Shipped since (29 Oct 2026): switchable layouts and a UI clean-up**
> (`docs/superpowers/plans/2026-10-29-layout-themes.md`). Settings → Themes picks one of
> four layouts (Classic, the default and the look above; Minimal; Organised; Fresh), the
> title view (a short popup or a full page) and the dashboard's tiles; Settings has a side
> menu; notifications, Search and the Command palette moved into the user menu;
> scrollbars are thin and themed. Some items below were then **removed on the owner's request (layout themes, Oct 2026)**:
> 5.1 Where to stream (and streaming in 5.2 and F4), 4.10 sub-scores, 1.9's panel on the
> section pages (Stats keeps You vs. the crowd), 1.3's banner on the section pages (Score
> these lives in the tier list's tray), and the header's bell and search button. They are
> struck through or annotated below; the rest of the text is kept as planned.

This roadmap ranks a list of feature ideas drawn from other trackers: Ryot, Yamtrack,
StoryGraph, Letterboxd, Serializd, Backloggd, Hardcover, Trakt, TV Time, AniList apps,
NeoDB and Sequel. Each idea is ranked by how useful it would be **in Hoard** and what it
would cost **in this codebase**. Written against commit `79a94d5`, before the build; the
text below is kept as it was planned.

**Value** (★1–5) is judged for how Hoard is used: a private tracker on a Raspberry Pi for
Tim and maybe a few others, across all seven kinds of media. Ranking is the heart of the
app.

**Effort:** **S** = an afternoon, **M** = a few days, **L** = a week or more.

**What Hoard already does that other trackers don't:**
- hand-placed tier lists;
- the Arena's head-to-head duels;
- franchises grouped across kinds of media;
- wording that matches each medium;
- the AI critic.

The rule for new features is the one the source list suggests: wherever possible, a new
feature should **feed the ranking**. Season scores join the tier list, the diary feeds a
year in review built around tiers, and the "what to start tonight" picker draws on Up next.

---

## Four foundations

Many ideas below rest on the same few missing pieces. Building these first makes the rest
cheaper.

| Foundation | Why it matters | Effort |
|---|---|---|
| **F1. An event log** | Hoard keeps only the current state and the first finish date. Rewatches, the diary, the year in review, streaks and taste trends all need a history, **and history can't be filled in after the fact.** Start recording every add, status change, score and progress change now, even before any screen shows it. | S to record, M for the screens that use it |
| **F2. Release dates and genres** | The catalogue stores only a year. "Not out yet", the release calendar, countdowns, the picker's mood and genre filters, and the genre charts all need a full release date and genres. Store them when titles are added, and fill in existing titles in one run. | S–M |
| **F3. A nightly job runner** | Nothing in Hoard runs on a schedule. Backups, new-season checks, release reminders and notifications all need one: a small cron service in `docker-compose.yml` that calls a protected route or a script. | S |
| **F4. User settings** | No settings are stored yet. ~~Streaming services, region (guessed from the browser's time zone, never from location),~~ *(streaming and region removed on the owner's request (layout themes, Oct 2026))* score display, title language, week start and which sections to show need a `prefs` JSON column on `User` and a Settings page. | S |

---

## Phase 1: Quick wins and safety (about 2 weeks)

| # | Feature | Value | Effort | How, in this codebase |
|---|---|---|---|---|
| 1.1 | **Nightly backups** | ★★★★★ | S | Nothing backs up the database except the one manual dump taken during the October deploy. Add a `backup` service (built on F3) that runs `pg_dump` every night into `~/backups/hoard` on the Pi, outside the Docker volume, and keeps 14 daily and 8 weekly copies. The Pi runs from a single 256 GB NVMe SSD with 188 GB free, so the backups fit easily. They protect against mistakes, a bad schema change and a damaged volume, but not against the SSD itself failing. For that, an occasional copy to the Mac over Tailscale is the cheap extra step. |
| 1.2 | **Start the event log** (F1, recording only) | ★★★★★ | S | Add an `ActivityEvent` table (`activityId`, `kind`, `from`, `to`, `at`) written by `addToList`, `updateActivity`, the rating step and the queue. No screen yet. |
| 1.3 | **Score the unscored** | ★★★★ | S | A "Score these" list of finished titles with no score, using the existing rating step. Scoring one sends it to the tier list's tray with a suggested tier, which closes the gap left by Skip. *The section pages' Score these banner was removed on the owner's request (layout themes, Oct 2026); Score these lives in the tier list's tray.* |
| 1.4 | **Progress counters** | ★★★★ | S | `progress Int?` on the activity, compared against the counts already stored (`pageCount`, `chapters`, `episodes`, `episodeCount`). Shows "p. 120 / 340" and a bar on cards, with a +1 button in the details. Covers TV and anime episodes until full season tracking (3.3). |
| 1.5 | **Manual entries** | ★★★★ | S–M | "Can't find it? Add it yourself": a title, year, optional cover URL and the medium's own counts. Stored with `externalId = "manual:<id>"`, and skipped by provider lookups and franchise detection. Indie games, regional films and fan translations become trackable. |
| 1.6 | **Undo in toasts** | ★★★★ | S | Removing a title deletes its row, losing tier, notes and franchise. Keep a snapshot and offer Undo for a few seconds; do the same for status changes. |
| 1.7 | **Install as an app (PWA)** | ★★★★ | S | Add `app/manifest.ts` and icons, so Hoard opens from the home screen in its own window. It also makes 2.4's share target possible on Android. |
| 1.8 | **Mark several as done in the Add dialog** | ★★★★ | S | A "select several" mode: search "Marvel", tick everything you've seen, then press Add. Scores can follow later through 1.3. |
| 1.9 | **You vs. the crowd** | ★★★ | S | TMDB, MAL and IGDB scores are already stored. Put them on the same 0–10 scale (IGDB is out of 100) and list your biggest disagreements per section. A good extra for the AI roast. *The panel on the section pages was removed on the owner's request (layout themes, Oct 2026); Stats keeps it.* |
| 1.10 | **Favourites showcase** | ★★★ | S | Your top four starred titles per section, on the dashboard. |
| 1.11 | **CSV export** | ★★★ | S | Everything to CSV, one file per section plus franchises. Re-importing it reuses 2.1. |
| 1.12 | **Richer finish states** | ★★★ | S–M | Add *Retired*, for endless games such as multiplayer titles. It means adding a value to the `MediaStatus` enum and deciding whether it counts for the tier list (recommendation: yes, like Dropped). Add it before importers, so Backloggd's states have somewhere to land. |
| 1.13 | **Score display formats** | ★★ | S | Show scores out of 10, as 5 stars or out of 100 (F4). Storage stays 0–10. |

## Phase 2: Getting your library in (about 2–3 weeks)

Switching cost is what stops people moving to a new tracker, and the same goes for
backfilling your own history. These features share one piece: **a bulk review step** (a
list of matched titles, each with its status, score and "skip", then Add all), built once
and reused by importers, AI parsing and adding by link.

| # | Feature | Value | Effort | How |
|---|---|---|---|---|
| 2.1 | **Import pipeline + AniList** | ★★★★★ | M | Build the review step and a status-mapping table first. AniList is the cheapest first source: its public GraphQL API takes a username, needs no key and returns MAL ids, which is how Hoard already identifies anime and manga. |
| 2.2 | **Letterboxd** | ★★★★ | S–M | Its CSV export (diary, ratings, watchlist) is matched to TMDB ids by searching each title with its year. Half-star ratings ×2 give a score out of 10. |
| 2.3 | **Goodreads / StoryGraph** | ★★★★ | S–M | Their CSV exports, matched to OpenLibrary by ISBN where present, otherwise by title and author. Custom shelves become tags (4.2) once tags exist. |
| 2.4 | **Add by link** | ★★★ | S–M | Paste, or share on Android through the PWA, a link from TMDB, IMDb, AniList, MAL, IGDB, Steam, Goodreads or Letterboxd. Recognise the provider id from the address (IMDb goes through TMDB's `/find`) and open that title's add row. |
| 2.5 | **One search for every section** | ★★★★ | M | One box that searches all seven providers in parallel, with results grouped by section. Its timeout per provider stops AniList's rate limit from slowing the rest. Pairs with 2.6. |
| 2.6 | **Cmd/Ctrl+K** | ★★★★ | S–M | Jump to any title in your library, in any section, and run quick actions such as "mark as watched" or "move to the top of Up next". Pressing Enter on a search that matches nothing opens 2.5. |
| 2.7 | **Backloggd, Trakt, MAL** | ★★★ | M each | Trakt and MAL have exports or APIs. Backloggd has no official export, so use a community CSV tool. Build each one only when you actually have data there. |
| 2.8 | **AI: paste a list or a screenshot** | ★★★ | M | Gemini reads "my top 20 movies" or a screenshot of a list and returns titles and years. These go through provider search into the review step, and nothing is added without the review. |
| 2.9 | **Barcode scanning (books)** | ★★★ | S–M | The browser's `BarcodeDetector` on Android Chrome, with a small JS decoder elsewhere (iOS Safari lacks the API). The ISBN is looked up through OpenLibrary. |
| 2.10 | **Add a whole franchise** | ★★★ | M | From a franchise card: list the parts you don't have yet (AniList relations, TMDB collection parts) and tick them off, through the same review step. |

## Phase 3: Progress and history (about 2–3 weeks, needs F1)

| # | Feature | Value | Effort | How |
|---|---|---|---|---|
| 3.1 | **Rewatches and rereads with dates** | ★★★★ | M | Each completion is an event with its date. "Watch again" starts a new run without touching the tier placement; the details show "Watched 3× · last 12 Mar 2026". |
| 3.2 | **Activity log per title** | ★★★ | S | In the details: a list of everything that has happened to the title, read straight from F1. |
| 3.3 | **TV seasons and episodes** | ★★★★ | M–L | A `Season` table for TV, fed by TMDB, with a watched count per season and optional ticks per episode. Anime needs none of this, because AniList already lists each season as its own title. |
| 3.4 | **Diary** | ★★★ | M | A dated list of what you finished, with score, a rewatch flag and a short review per entry. It is a view over F1 plus a `review` field. |
| 3.5 | **Ownership and format** | ★★ | S–M | The platform you own a game on, and whether a book is print, ebook or audio. Feeds goals by format (6.3). |
| 3.6 | **Play sessions** | ★★ | M | Days played, grouped into sessions, shown as a calendar per game. Only worth it if you'd really log sessions. |

## Phase 4: Deeper ranking (about 2 weeks)

| # | Feature | Value | Effort | How |
|---|---|---|---|---|
| 4.1 | **Share a tier list** | ★★★★ | S–M | Download it as a PNG (rendered in the browser) for S; a revocable read-only link for M. Hoard stays private apart from what you share. |
| 4.2 | **Tags** | ★★★ | S–M | Free tags on a title ("cinema", "with partner", "on a flight"), with a filter on section pages. Importers map other apps' custom shelves onto them. |
| 4.3 | **Arena confidence** | ★★★ | S | Count each title's duels and show it ("12 duels") beside the ranking. Pair the least-tested titles first. |
| 4.4 | **Cross-tier challenge duels** | ★★★★ | S–M | Duel the bottom of one tier against the top of the next. A surprising winner gets a suggestion to move it up or down, never an automatic move. This keeps the tier list hand-placed while still learning from duels. |
| 4.5 | **Season scores in the tier list** (needs 3.3) | ★★★★ | M | TV seasons become items that can be tiered and duelled ("rank every season of a show"). Anime seasons already can, as separate titles. |
| 4.6 | **Best of the year, any medium** | ★★★ | M | A cross-section Arena of everything finished in a year (`finishedAt` already exists). It is the centrepiece of the year in review (6.1). |
| 4.7 | **Franchise watch order** | ★★★ | M | Release order from provider dates, or a chronological order you drag into place, replacing the free-text notes. Up next shows "Next in franchise". |
| 4.8 | **Reference lists with progress** | ★★ | S–M | Import a list (IMDb Top 250, 1001 Albums, AniList top 100) as a checklist with progress against your library. |
| 4.9 | **Title language for anime and manga** | ★★★ | S–M | Store AniList's English, romaji and native titles and show the one you prefer (F4). Existing titles need refetching once. |
| 4.10 | ~~**Sub-scores**~~ | ★★ | M | ~~Scores for story, characters and so on (gameplay for games) that average into the overall score. Optional per title.~~ *Built, then removed on the owner's request (layout themes, Oct 2026).* |
| 4.11 | **Custom lists, optionally shared** | ★★ | M | Lists beyond the statuses, which other users of the instance can edit with you. |

## Phase 5: Deciding what's next and upcoming releases (about 2–3 weeks, needs F2 and F3)

| # | Feature | Value | Effort | How |
|---|---|---|---|---|
| 5.1 | ~~**Where to stream**~~ *(built, then removed on the owner's request (layout themes, Oct 2026))* | ★★★★ | S–M | TMDB's watch-providers endpoint for your region, filtered to the services you subscribe to (F4). The region is guessed once from the browser's time zone (for example `Europe/Zurich` → CH), never from location. It is shown in Settings and can be changed there, and it is stored per user, so each friend sees their own country's services. Shown on cards and in Up next. |
| 5.2 | **"What should I start tonight?"** | ★★★★ | M | Up next filtered by the time you have (runtime, episodes × length, pages, time to beat), genre ~~and streaming~~ *(streaming removed on the owner's request (layout themes, Oct 2026))*. Up next itself stays the order. |
| 5.3 | **Time to beat (games)** | ★★★ | S | IGDB's time-to-beat data, stored on the game. Feeds 5.2. |
| 5.4 | **"Not out yet"** | ★★★ | S | Up next split into *available now* and *not out yet*, using release dates (F2). |
| 5.5 | **New season alerts** | ★★★★ | M | A nightly job (F3) compares the season count of each completed show with TMDB. A new season gets a "new season" badge, and its tier placement is untouched until you start it. |
| 5.6 | **Release calendar + iCal feed** | ★★★ | M | Upcoming releases from your Up next and franchises, as a page and as a private iCal link your calendar app subscribes to. |
| 5.7 | **Notifications** | ★★★ | M | Releases, new seasons and backup failures sent through ntfy (the simplest to self-host), Discord or email. Needs F3. |
| 5.8 | **What can we watch together?** | ★★ | S–M | The overlap between two users' Up next queues, only for users who opt in to being compared. |
| 5.9 | **Countdowns** | ★★ | S | A "12 days" badge on cards and a dashboard tile. Needs F2. |
| 5.10 | **More by the same people** | ★★ | M | Cast, crew and author filmographies and bibliographies from TMDB and OpenLibrary, shown in the details. |
| 5.11 | **Anime season browser** | ★★ | M | Browse current and upcoming AniList seasons by genre and format, with add buttons. |

## Phase 6: Stats, recaps and goals (about 2 weeks, needs F1 and F2)

| # | Feature | Value | Effort | How |
|---|---|---|---|---|
| 6.1 | **Year in review, built around tiers** | ★★★★★ | M | Per year: what you finished in every medium, the new S-tier titles, the best-of-year Arena winner (4.6), hours and pages, a top franchise and the AI critic's verdict on your year. Shareable as an image. A first version only needs `finishedAt` and could be built before F1 has a year of data. |
| 6.2 | **Charts over time** | ★★★ | M | Finished per month, genres, average score by year, and how often you drop things. |
| 6.3 | **Goals** | ★★★ | S–M | Yearly goals per medium (books, pages, films, games beaten), with progress on the dashboard. |
| 6.4 | **Taste trends** | ★★ | M | Where you usually drop things ("around episode 4", from 1.4) and how your average scores drift by genre. |
| 6.5 | **Compare periods** | ★★ | M | Any two date ranges side by side. |
| 6.6 | **People stats** | ★★ | M | Most-watched directors and actors. Needs TMDB credits stored. |
| 6.7 | **Streaks** | ★ | S | Days in a row with activity. |

## Phase 7: AI (builds on the AI critic)

| # | Feature | Value | Effort | How |
|---|---|---|---|---|
| 7.1 | **Recommendations across media** | ★★★★ | M | "You put Haikyuu in S tier: here's a sports novel and a game." Only Hoard holds all seven media in one place. Each suggestion links straight into the add search. |
| 7.2 | **Taste profile** | ★★★ | M | Genres, themes and how you score, worked out once and reused by the roast and both kinds of recommendation (and shown as a page). Needs F2's genres. |

## Phase 8: Integrations

| # | Feature | Value | Effort | Note |
|---|---|---|---|---|
| 8.1 | **Steam library** | ★★★★ | M | Your Steam profile id (it must be public) plus a Steam Web API key. Imports owned games, matched to IGDB through IGDB's Steam ids, and playtime, giving ownership (3.5), "played 40 h, still unrated" and an unplayed pile that seeds Up next. A nightly job (F3) keeps playtime current. Steam is the only integration in use, so it is the one worth building. |
| 8.2 | **AniList two-way sync** | ★★ | M–L | Import (2.1) covers most of the need. Two-way sync only if you still use AniList itself. |
| 8.3 | **Last.fm scrobbles** | ★★ | M | Suggest "Listened" once most of an album's tracks have been played. |
| 8.4 | **Markdown export** | ★★ | S | One note per title with front matter, for Obsidian or shared-notes. |
| 8.5 | **Linked notes** | ★★ | M | `[[Paprika]]` in a title's notes links to that title, which then shows "mentioned in". |
| 8.6 | **Saved views** | ★★ | M | Named filter and sort combinations across sections ("unwatched, under 100 min"). |
| 8.7 | **Public API** | ★★ | M | A token-protected JSON API. Wait until something needs it; the exports cover backups. |

## Phase 9: Social, between users of this instance (only once friends join)

| # | Feature | Value | Effort | Note |
|---|---|---|---|---|
| 9.1 | **Compare libraries / taste match** | ★★★ | M | Shared titles, the biggest disagreements and a compatibility score. Opt-in. |
| 9.2 | **Activity feed** | ★★ | M | What friends on the instance finished, with scores. Opt-in, and built from F1. |

## Skipped, and why

| Feature | Why not |
|---|---|
| Federation (ActivityPub) | L, and contrary to Hoard being private. |
| SSO / OIDC | Usernames and passwords work for a handful of people. If more is wanted, put Cloudflare Access in front of the tunnel, with no code. |
| Badges | They can feel cheap, and they don't feed the ranking. |
| Jellyfin / Plex webhooks, KOReader, Audiobookshelf | None of these are in use. |
| Release RSS feeds | The iCal feed (5.6) and notifications (5.7) cover it. |
| Personalisation (accent colours, hidden sections) | Small; fold "hide sections I don't use" into the F4 settings page and skip the rest. |
| Week start setting | Trivial; add it with the first calendar (5.6), not before. |

---

## Top 10 by value per effort

1. 1.1 Nightly backups
2. 1.2 Start the event log
3. 1.3 Score the unscored
4. 1.4 Progress counters
5. 1.6 Undo in toasts
6. 1.8 Mark several as done
7. 1.5 Manual entries
8. 1.7 Install as an app
9. 2.1 Import pipeline + AniList
10. 6.1 Year in review

Items 1–8 are about a week and a half of work in total. Do 1.1 and 1.2 first: one protects
the data you have, and the other starts recording the history that later features need.

## Dependencies

```
F1 event log ─┬─ 3.1 rewatches ── 3.4 diary
              ├─ 6.1 year in review ── 4.6 best of the year
              ├─ 6.2 charts, 6.4 trends, 6.7 streaks
              └─ 9.2 activity feed
F2 release dates + genres ─┬─ 5.4 not out yet, 5.6 calendar, 5.9 countdowns
                           ├─ 5.2 tonight picker ── 5.3 time to beat
                           └─ 7.2 taste profile ── 7.1 cross-media recs
F3 nightly jobs ─┬─ 1.1 backups
                 ├─ 5.5 new season alerts
                 └─ 5.7 notifications
F4 settings ── 1.13 score display, 4.9 title language, 5.1 streaming (removed, Oct 2026)
2.1 review step ─┬─ 2.2, 2.3, 2.7 importers
                 ├─ 2.4 add by link, 2.8 AI paste, 2.10 add franchise
                 └─ 1.11 CSV re-import
3.3 TV seasons ── 4.5 season scores in tiers
```

## Decisions (27 Oct 2026)

- **Users:** Tim, and maybe friends later. Features between users (5.8, phase 9) wait
  until friends actually join, and are opt-in when they do.
- **Integrations:** Steam only. 8.1 stays in; Jellyfin, Plex, KOReader and Audiobookshelf
  are skipped.
- ~~**Streaming region:** guessed from the time zone and editable in Settings. Never from
  location, so no friend's location is ever asked for or stored.~~ *Streaming and the
  region setting were removed on the owner's request (layout themes, Oct 2026).*
- **Backups:** stored on the Pi, in `~/backups/hoard` (see 1.1).
