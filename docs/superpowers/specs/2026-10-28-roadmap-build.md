# Building the roadmap: spec

The owner's instruction (28 Oct 2026): *"execute the road map of features for Hoard, do not
stop until it is done and deployed. make sure to double check that its good to ship before
deploy. make no mistakes."*

`ROADMAP.md` is the feature source: everything in phases 1–9 and the four foundations,
minus its "Skipped" table. This spec turns each item into concrete, binding decisions
("rulings"). Because the owner asked not to be stopped, the rulings were made without
asking. Each records what it costs if wrong. Decisions already taken by the owner (the
"Decisions (27 Oct 2026)" section of `ROADMAP.md`) are binding.

## Global rules

- **G1. Additive database changes only.** New tables, new nullable or defaulted columns,
  and new enum values. Nothing is renamed or dropped, and `prisma db push` must run without
  `--accept-data-loss`. Any data backfill is an idempotent SQL file in `prisma/sql/`
  (numbered `002-…`, `003-…`). These run before `db push` at container start, so **SQL
  files must only touch tables and columns that already exist in production before this
  build**, or must guard themselves with `IF EXISTS` checks. Backfills that depend on new
  columns run in the app instead: an idempotent "migration job" executed by the scheduler
  at startup (see G9).
- **G2. Every user's data stays private,** except where the owner opts in:
  - share links (4.1);
  - shared custom lists (4.11);
  - "compare with me" and the activity feed (5.8, 9.x), which are opt-in per user and off
    by default.

  Every server action and route checks ownership exactly as `src/lib/actions/media.ts`
  does.
- **G3. No location data, ever.** The region comes from the browser's time zone, and the
  owner can change it (ROADMAP decision).
- **G4. External APIs must fail softly.**
  - **Timeouts:** every provider call has a timeout (8 s default).
  - **Missing keys:** a missing key gives a friendly "not configured" message, never a
    crash.
  - **Rate limits:** AniList calls respect its rate limit; reuse `anilistQuery` and its
    retry.
  - **Secrets:** API keys never reach the client.
- **G5. New environment variables are optional, and the app works without them:**
  - `STEAM_API_KEY`;
  - `TRAKT_CLIENT_ID`;
  - `ANILIST_CLIENT_ID` and `ANILIST_CLIENT_SECRET`;
  - `HOARD_PUBLIC_URL` (default `https://hoard.timhufnagel.org`; used for share and iCal
    links and OAuth redirects);
  - `HOARD_BACKUP_DIR`, `HOARD_BACKUP_UID`, `HOARD_BACKUP_GID` and `TZ`.

  Each must be passed through in `docker-compose.yml` and documented in `.env.example`.
- **G6. Dependencies.** Allowed new runtime dependencies, at exact versions published at
  least two weeks ago:
  - `fflate` (zip and unzip);
  - `html-to-image` (PNG export);
  - `@zxing/browser` and `@zxing/library` (barcode fallback, loaded only when needed).

  Allowed new dev dependency: `playwright-core` (smoke tests driven through the installed
  Chrome). Nothing else without a ledger ruling. Charts are hand-written SVG following the
  `dataviz` skill.
- **G7. Style.** Match the existing code: server actions return `ActionResult`-style
  objects; data fetchers live in `src/lib/data*.ts`; shadcn/ui components and lucide icons;
  toasts through sonner; comments at the density of the surrounding files. All copy uses
  the per-medium wording from `src/lib/status.ts`. The phone layout must work at 375 px
  width.
- **G8. Tests.**
  - **Unit tests:** every new pure rule (parsers, mappers, date maths, matching, scheduling,
    stats) has Vitest tests in `src/lib/**/*.test.ts`.
  - **Must stay clean:** `npm test`, `npx tsc --noEmit`, `npm run lint` and `npm run build`
    all pass after every task.
  - **Smoke test:** `npm run smoke` (added in task 1) drives the local Chrome against a
    running dev server. It logs in as `demo` and visits every page, failing on any console
    error, failed request or error overlay. Each task adds its new pages to the smoke list.
- **G9. Scheduler.** There is no extra container for jobs. An in-process scheduler starts
  from `src/instrumentation.ts` (with `experimental.instrumentationHook: true`) and only in
  the Node.js runtime:
  - it ticks every minute and runs named jobs at their times in the server's `TZ`
    (default `Europe/Berlin`);
  - a Postgres advisory lock stops two instances from running the same job;
  - each run's last time, status and error are stored in a `JobRun` table.

  The "migration" job runs once at startup.
- **G10. Days.** Day-based things (diary dates, streaks, the calendar, "finished this
  year") use the user's `prefs.timeZone` (defaulting to the server's `TZ`). Calendar days
  are stored as `YYYY-MM-DD` strings, never as UTC midnights.

## Shared contract: database additions

The final task may adjust the details, but this is the contract every task follows.
`User.prefs` is typed by `src/lib/prefs.ts` (zod schema with defaults; unknown keys are
dropped).

```
User           + prefs Json @default("{}")
UserMediaActivity
               + progress Int?                 // pages / chapters / episodes / tracks done
               + duels Int @default(0)          // Arena confidence (4.3)
               + tags String[]                  // 4.2
               + ownedPlatforms String[]        // 3.5 (games)
               + format String?                 // 3.5: print|ebook|audio (books, manga), vinyl|cd|digital (music)
               + subScores Json?                // 4.10 { [key]: number }
               + franchiseOrder Float?          // 4.7 manual order inside the franchise
               + playtimeMinutes Int?           // 8.1 Steam
               + seenSeasonCount Int?           // 5.5 seasons known when last finished
               + rewatching Boolean @default(false) // 3.1 a repeat run is in progress
MediaStatus    + RETIRED                        // 1.12
All seven media tables
               + releaseDate String?            // YYYY-MM-DD when known (F2)
               + genres String[]                // F2
               + metaFetchedAt DateTime?        // when F2 details were last fetched
Movie, TvShow  + directors String[], cast String[]  // 6.6 / 5.10 (top 5 billed)
TvShow         + status String? (Returning Series/Ended/…), nextAirDate String?
Anime, Manga   + titleEnglish String?, titleRomaji String?, titleNative String?  // 4.9
Anime          + nextAiringAt DateTime?, nextAiringEpisode Int?
VideoGame      + timeToBeatHours Float?, steamAppId Int?
Franchise      + orderMode String @default("release")  // release|manual (4.7)

ActivityEvent  id, userId, activityId (cascade), kind, from String?, to String?, at DateTime @default(now()), meta Json?
               kinds: added, status, score, progress, tier, queue, removed-undone, rewatch, review, import
DiaryEntry     id, userId, activityId (cascade), date String (YYYY-MM-DD), rating Float?, rewatch Boolean, review String?, createdAt
PlaySession    id, userId, activityId (cascade), date String, minutes Int?, note String?
TvSeason       id, tvShowId (cascade), seasonNumber Int, name, episodeCount Int?, airDate String?, imageUrl String?  @@unique([tvShowId, seasonNumber])
SeasonActivity id, userId, activityId (cascade), seasonId (cascade), watchedEpisodes Int @default(0), episodesWatched Int[], rating Float?, tier Tier?, rankOrder Float?, elo Float @default(1200), duels Int @default(0)  @@unique([userId, seasonId])
YearDuelScore  id, userId, activityId (cascade), year Int, elo Float @default(1200), duels Int @default(0)  @@unique([activityId, year])
ShareLink      id (random token), userId, kind ("tiers"|"year"|"list"), target String, createdAt, revokedAt?
CustomList     id, ownerId, name, description?, createdAt; CustomListItem (listId cascade, category, mediaId, addedById, position Float); CustomListMember (listId cascade, userId, canEdit Boolean)
RefList        id, userId, name, source, category, createdAt; RefListItem (listId cascade, category, externalId, title, year?, imageUrl?, position Int)
Goal           id, userId, year Int, category String? (null = all), metric ("count"|"pages"|"hours"|"episodes"), target Int
SavedView      id, userId, name, query Json, createdAt
ApiToken       id, userId, name, tokenHash, createdAt, lastUsedAt?
TasteProfile   userId @id, data Json, updatedAt
WatchProviderCache  key String (e.g. "movie:603:DE") @id, data Json, fetchedAt
Notification   id, userId, kind, title, body, url?, createdAt, readAt?, sentAt?   // also shown in-app
JobRun         name @id, lastRunAt, lastStatus, lastError?, lastDurationMs
ExternalLink   id, userId, provider ("anilist"|"steam"|"lastfm"|"trakt"), accountId, token?, data Json?, updatedAt  @@unique([userId, provider])
```

## Rulings per roadmap item

### Foundations
- **F1. Event log.** `src/lib/events.ts` exposes `recordEvent(tx|prisma, {...})`. Every
  mutation writes events in the same transaction as the change: add, status, score,
  progress, tier placement, queue moves (one `queue` event per save, not per row), import
  (`kind: 'import'`, with its source in `meta`), rewatch and review. Events are not
  backfilled; diary entries are (see 3.1).
- **F2. Release dates and genres.** Search results fill what the provider returns.
  `enrichResult` and a nightly `metadata` job fill details for rows whose `metaFetchedAt`
  is null or older than 30 days, at most 200 rows a night, with a delay between calls.
  - **Books:** the year only (`releaseDate` stays null); up to 3 genres from OpenLibrary
    subjects, using the allow-list `src/lib/genres.ts`.
  - **Music:** the top 3 Last.fm tags as genres.
  - **Year-only titles:** a release whose only date is a year counts as "released" when
    that year is not in the future.
- **F3. Scheduler.** See G9. Jobs:
  - `migration` (once at startup);
  - `metadata` (03:30);
  - `new-seasons` (04:00);
  - `releases` (06:00): notifications for releases due today;
  - `backup-watch` (09:00): notifies if the newest backup is older than 26 h;
  - `steam` (04:30);
  - `lastfm` (05:00);
  - `anilist-sync` (05:30);
  - `taste-profile` (Sunday 05:45).

  Settings shows each job's last run, and each user's own sync jobs have a "Run now"
  button.
- **F4. Settings.** A `/settings` page. `prefs` holds:

  | Group | Settings |
  |---|---|
  | Region and display | `region` (ISO country), `timeZone`, `scoreFormat` (`ten`, `five`, `hundred`), `titleLanguage` (`english`, `romaji`, `native`; default `english` falling back to romaji), `weekStart` (1 = Monday by default), `hiddenSections` |
  | Streaming and accounts | `streamingServices` (TMDB provider ids), `steamId`, `lastfmUser`, `anilistUser` |
  | Notifications | `notify.ntfyUrl`, `notify.discordWebhook`, `notify.kinds` |
  | Sharing with other users | `compareOptIn`, `feedOptIn` |
  | Calendar | `calendarToken` |

  - **Region:** on the first visit to `/settings` (and on the first login after deploy,
    when the region is unset), the browser's `Intl…timeZone` is sent and mapped to a
    country by `src/lib/timezones.ts` (a static IANA zone → ISO country table). It falls
    back to `DE` for the owner's `Europe/Berlin`.
  - **Hidden sections** disappear from the navigation and the dashboard, but their pages
    still work.

### Phase 1
- **1.1 Backups.** A `backup` service in `docker-compose.yml`:
  - **Image and schedule:** the `postgres:16-alpine` image runs `scripts/backup.sh`, an
    `sh` loop that dumps at `BACKUP_HOUR` (default 3) in `TZ`.
  - **What it writes:** `pg_dump --format=custom` to
    `/backups/daily/hoard-YYYY-MM-DD.dump`, written to a temp file and renamed, and only
    kept if it is non-empty and `pg_restore --list` reads it.
  - **Weekly copies:** Sunday's dump is also copied into `weekly/`.
  - **Retention:** the newest 14 daily and 8 weekly dumps are kept.
  - **Status file:** `/backups/status.json` records `{lastSuccess, lastAttempt, lastError,
    file, bytes}`.
  - **Where it lives on the Pi:** the host directory is `${HOARD_BACKUP_DIR:-../backups/hoard}`.
    The service runs as `${HOARD_BACKUP_UID:-1000}:${HOARD_BACKUP_GID:-1000}`, so Tim
    owns the files.
  - **Status in the app:** the app mounts the same directory read-only at `/backups`, and
    Settings shows "Last backup …".
  - **Docs:** a README section explains how to restore.
- **1.2** is F1.
- **1.3 Score these.** On each section page, a "Score these · N" banner when finished,
  unscored titles exist. It opens a dialog listing them, each with the existing
  `RatingStep`, and is also linked from the tier list's tray.
- **1.4 Progress.**
  - **The total** is the media count: `pageCount` (books), `chapters` (manga), `episodes`
    (anime), `episodeCount` (TV), or `trackCount` (music; music progress is optional and
    hidden by default).
  - **Changing it:** +1 and typed input in the details, and a bar on grid and list cards
    while the title is ongoing.
  - **Reaching the total** offers "Mark as finished" (it never changes status
    automatically).
  - **Events:** a `progress` event is written per change, debounced so one change stores
    one event.
- **1.5 Manual entries.**
  - **Adding one:** "Can't find it? Add it yourself" at the foot of the Add dialog opens a
    form: title, year, cover URL (https only), description, and the medium's counts.
  - **Storage:** `externalId = "manual:" + cuid`.
  - **Exclusions:** manual rows are skipped by every provider refresh and franchise
    resolution (they are still grouped by title matching).
  - **Editing:** the details dialog lets you edit them, but only for manual rows.
- **1.6 Undo.**
  - **Remove:** returns a snapshot of the activity row, its events, diary entries,
    sessions, season rows and list memberships. The toast's Undo (8 s) calls
    `restoreActivity(snapshot)`, which recreates them with the same ids in one transaction.
    This only works if the media row still exists; media rows are never deleted.
  - **Status changes:** the toast's Undo calls `restoreActivityState(id, {status, rating,
    queueOrder, finishedAt, tier, rankOrder})`.
- **1.7 PWA.** `src/app/manifest.ts`, icons generated from `src/app/icon.svg` into
  `public/` (192, 512 and a maskable icon), `theme_color` matching the dark theme, plus an
  Android `share_target` (GET `/add?url=…&text=…`, see 2.4). No service worker: an
  installable app doesn't need one, and offline caching could serve stale server actions.
- **1.8 Several at once.** In the Add dialog, a "Select several" toggle shows checkboxes
  on results, and a sticky bar offers "Add N as {done}" and "Add N to Up next". Titles
  added as done go to "Score these".
- **1.9 Crowd.**
  - **The crowd's score:** TMDB and MAL are already 0–10; IGDB is divided by 10. Books and
    music have no crowd score.
  - **The panel:** "You vs. the crowd" on the stats page (6.x) and on each section page:
    the 10 biggest disagreements, plus your average difference per section.
- **1.10 Favourites showcase.** A dashboard row, "Favourites": the first four starred
  titles per visible section. The order follows the tier list; untiered titles come after,
  by score.
- **1.11 CSV export.** Settings → Data offers:
  - **Library CSV:** one file, all sections, including tags, dates, progress, tier and
    franchise.
  - **Franchises CSV.**
  - **Full JSON export:** everything the user owns.

  These are route handlers under `/api/export/*`, which need a session. Re-importing the
  library CSV is an importer source (2.1).
- **1.12 Retired.**
  - **Meaning:** a new `RETIRED` status, labelled "Retired" in every section, with an icon
    (`Archive`) and its own colour.
  - **Where it counts:** it counts for the tier list (like Dropped), sorts after Paused,
    and is offered in the details. It is not offered in the Add dialog.
  - **Backloggd and Trakt imports** map "Retired" and "Shelved" to it.
- **1.13 Score display.** A `formatScore(rating, format)` helper:
  - **Ten:** `8.5`.
  - **Five:** `4.3★`, which is rating/2 rounded to 0.1.
  - **Hundred:** `85`.

  A client `PrefsProvider` supplies the format, and every place showing a score uses it.
  Input stays on the 0–10 scale.

### Phase 2
- **2.1 The import pipeline.**
  - **Page:** `/import`, listing sources.
  - **Reading files:** files are parsed in the browser (CSV through a small RFC-4180 parser
    in `src/lib/import/csv.ts`; zip through `fflate`) into `ImportRow`s:
    `{source, category, title, year?, ids: {tmdb?, imdb?, mal?, anilist?, isbn?, igdb?,
    steam?}, status, rating?, finishedOn?, startedOn?, rewatchCount?, review?, tags?,
    progress?}`.
  - **Matching:** rows are matched on the server in chunks of 10 through the
    `matchImportRows` action, with ids first and then a title + year search. It returns
    candidates and a confidence.
  - **Review screen:**
    - each row shows the matched title, the alternatives, a status picker and Skip;
    - rows with low confidence are flagged and unticked by default;
    - rows already in the library are flagged "already in library", and importing them
      updates them only if "update existing" is ticked.
  - **Committing:** `commitImportRows` (chunks of 20) uses
    `addMediaForUser(userId, slug, result, opts)`, a shared internal function that
    `addToList` also uses after the refactor. One `import` event and the diary entries are
    written per row. Franchise detection runs once at the end.
  - **Status mapping:** each source has its own table in `src/lib/import/sources/*.ts`.
    Tests cover every source's mapping and parsing with fixtures.
  - **First sources:**
    - **AniList:** a username. Queries `MediaListCollection` for anime and manga, and
      matches by MAL id, then by `al-` id.
    - **Hoard's own CSV.**
- **2.2 Letterboxd.** Its export zip or the individual `watched.csv`, `ratings.csv`,
  `diary.csv` and `watchlist.csv` files:
  - the watchlist becomes Planned;
  - watched and rated films become Completed, with ratings ×2;
  - diary rows become diary entries, with the rewatch flag and review.

  Films are matched through TMDB search by title and year.
- **2.3 Goodreads and StoryGraph CSV.**
  - **Matching:** by ISBN13, then ISBN, then title + author through OpenLibrary.
  - **Shelves:** `read` becomes Completed, `currently-reading` Ongoing and `to-read`
    Planned. Other shelves become tags. StoryGraph's `Read Status` maps the same way.
  - **Ratings:** ×2.
- **2.4 Add by link.**
  - **Where:** an `/add?url=…` page, plus a "Paste a link" field in the Add dialog and in
    the global search.
  - **Recognised links:** TMDB, IMDb (through TMDB `/find`), AniList, MyAnimeList, IGDB,
    Steam (store app id → IGDB through `external_games`), Goodreads (the ISBN is fetched
    from the page server-side; when that fails, the title from the URL slug is searched on
    OpenLibrary), Letterboxd (the film slug, searched on TMDB) and OpenLibrary.
  - **Unknown links:** the page `<title>` is fetched server-side (5 s timeout, only for
    public http/https hosts, never private IPs) and searched.
  - **Result:** opens a single add row (Done or Want), the same component as the Add
    dialog.
- **2.5 Search everything.**
  - **Where:** a "Search everything" dialog (the header button and the `/` key).
  - **How:** it fans out to all visible sections' providers in parallel through the
    existing `searchMedia`, with a 6 s timeout each. Results are grouped by section, and
    each row is the same add row.
- **2.6 Cmd/Ctrl+K palette.**
  - **What it searches:** library titles (all sections), pages, and actions on the
    highlighted title: mark as {done}, move to the top of Up next, open its details.
  - **No match:** Enter runs 2.5 with the query.
  - **Data:** a server action returns a compact index of the user's library (id, title,
    category, status, cover), cached in memory for the session.
- **2.7 More importers.**
  - **MyAnimeList:** the `animelist`/`mangalist` XML export (`.xml` or `.xml.gz`, gunzipped
    with `fflate`).
  - **Trakt:** a username through the API, needing `TRAKT_CLIENT_ID` (watched movies and
    shows, ratings, watchlist; matched by TMDB id).
  - **Generic CSV:** you map columns to title, year, status, rating, platform and date, and
    the mapping is remembered for each set of headers. It covers Backloggd community
    exports and anything else.
- **2.8 AI paste.**
  - **Input:** a text box or an image upload (PNG or JPEG up to 6 MB) posted to the route
    handler `/api/ai/parse-list`.
  - **What it returns:** Gemini returns JSON `[{title, year?, category?, rank?, score?}]`
    (validated with zod), which goes straight into the import review step.
  - **Without a key:** a friendly message.
- **2.9 Barcodes.** "Scan a barcode" in the Books Add dialog:
  - **Scanning:** the camera through `BarcodeDetector`, or a dynamically imported
    `@zxing/browser` fallback.
  - **Lookup:** the ISBN is looked up through OpenLibrary `/isbn/{isbn}.json` and the work,
    giving the add row.
  - **Typing:** you can also type an ISBN.
- **2.10 Add a whole franchise.**
  - **Where:** a button on a franchise card, "Add missing titles".
  - **Finding the missing titles:**
    - anime and manga use AniList relations (the same relation types as the resolver);
    - movies use the TMDB collection's parts;
    - games use the IGDB franchise or collection's games.
  - **Adding:** you tick them and add as Done or Want, through the import review
    component.

### Phase 3
- **3.1 Rewatches.**
  - **Diary entries:** finishing a title (from any path) creates a `DiaryEntry`: today in
    the user's time zone, the current score, and `rewatch = activity.rewatching`. It also
    clears `rewatching` and keeps the first `finishedAt`.
  - **Starting a repeat:** "Watch again" (per-medium wording: Read again, Play again,
    Listen again) sets status to Ongoing and `rewatching = true`, and leaves the tier
    placement alone (the existing rule: hidden while ongoing).
  - **Display:** the details show "Watched 3× · last 12 Mar 2026".
  - **Backfill:** a migration job creates one diary entry for each Completed, Dropped or
    Retired activity that has a `finishedAt` and no diary entry (date = `finishedAt` in
    the server's TZ). It never creates duplicates.
- **3.2 Activity log.** A "History" section in the details, newest first, listing events
  and diary entries in plain language.
- **3.3 TV seasons.**
  - **Season data:** `TvSeason` rows come from TMDB `/tv/{id}` (season 0, the specials, is
    skipped) when a show is added and by the metadata job.
  - **Tracking:** the details of a TV title get a "Seasons" section. Each season has a
    watched-episodes count (+1, set, or "all") and optional ticks per episode, which
    expand per season. Episode ticks are stored in `episodesWatched` as episode numbers.
  - **Progress:** the activity's `progress` is the sum of watched episodes.
  - **Anime:** gets nothing extra, since AniList entries are already per season.
- **3.4 Diary.** A `/diary` page:
  - **Layout:** entries grouped by month, filterable by section and year.
  - **Editing:** dates, score, rewatch and review can be edited; entries can be added (to
    log a past watch) and deleted.
  - **Review field:** the details show a "Review" field for the latest entry.
- **3.5 Ownership and format.**
  - **Games:** `ownedPlatforms`, a multi-select from the game's IGDB platforms plus free
    text.
  - **Books and manga:** `format` (print, ebook or audio).
  - **Music:** `format` (vinyl, CD or digital).
  - **Where:** shown in the details and the list view, and filterable.
- **3.6 Play sessions.** In a game's details: "Log a session" (date, minutes, note) and a
  small month calendar of the played days. Sessions are grouped into runs when gaps are
  under 7 days. A `/sessions` list page is not needed.

### Phase 4
- **4.1 Sharing.**
  - **PNG:** "Download PNG" on the Tiers tab renders the board through `html-to-image`,
    with covers and the Hoard brand. Image CORS: covers are fetched through a new
    same-origin proxy `/api/img?u=` that only allows the known provider CDN hosts.
  - **Links:** "Share link" creates a `ShareLink`. The public page `/s/[token]` is outside
    the `(app)` group, read-only, and shows only that tier list (titles, covers, tiers;
    never notes). Links are revocable in Settings → Sharing. Year-in-review (6.1) and
    custom lists (4.11) use the same mechanism.
- **4.2 Tags.**
  - **Editing:** a tag input in the details, with autocomplete from your existing tags.
  - **Filtering:** a tag filter on section pages, and a `/tags` overview with counts.
  - **Imports:** importer shelves map to tags.
- **4.3 Arena confidence.** `duels` is incremented for both titles in every duel. The
  ranking list shows "12 duels". The matchup prefers the pair with the fewest duels among
  the valid pairs (with ties broken randomly).
- **4.4 Cross-tier challenges.**
  - **The duel:** an Arena mode, "Challenge tiers", pairs the bottom title of tier X with
    the top title of the next tier.
  - **Suggestions:** if the lower title wins the same pairing twice in one Arena session
    (tracked in the client and passed back to the action), a suggestion card offers "Move
    {title} up to {tier}?" with Accept and Dismiss.
  - **Never automatic:** nothing moves unless you accept.
- **4.5 Season tiers.** A TV title's details link to `/tv/seasons/[activityId]`, which has:
  - an S–F tier board of that show's seasons, using `SeasonActivity` tier and rank fields
    and the same board component, generalised over the item type;
  - a season Arena within that show.

  Only seasons that have been watched (or have watched episodes) appear.
- **4.6 Best of the year.** `/arena/year/[year]`:
  - **Candidates:** everything finished in that year (diary entries dated in it) across
    all sections.
  - **Duels:** stored in `YearDuelScore`, with a ranking alongside.
  - **Use:** feeds 6.1.
- **4.7 Watch order.**
  - **Order mode:** a franchise's details get an order mode. *Release* sorts by
    `releaseDate`, then year. *Manual* uses drag order stored in `franchiseOrder`.
  - **Up next:** shows a "Next in {franchise}" chip on a queued title when an earlier
    franchise entry is unfinished. The franchise page also lists "Next up: {title}".
- **4.8 Reference lists.** `/lists` → "Reference lists":
  - **Built-in sources:** TMDB top rated movies (top 250), TMDB top rated TV (top 100),
    AniList top 100 anime and manga, IGDB top 100 games (rating count over 500).
  - **Custom:** "Paste titles", through the 2.8 parser or plain lines.
  - **Progress:** a list shows how many you've done and how many you've planned, and
    items have add buttons.
  - **Freshness:** stored at creation, with a refresh button.
- **4.9 Title language.**
  - **Storage:** anime and manga store English, romaji and native titles from AniList.
  - **Display:** they are shown per `prefs.titleLanguage`, falling back to `title`.
  - **Backfill:** the metadata job fills existing rows.
  - **Search:** local filtering matches all three.
- **4.10 Sub-scores.**
  - **Categories per medium,** in `src/lib/subscores.ts`:
    - Story, Characters, Visuals, Audio and Enjoyment for screen media and anime;
    - Gameplay, Story, Visuals, Audio and Enjoyment for games;
    - Writing, Story, Characters and Enjoyment for books and manga;
    - Songs, Production and Enjoyment for music.
  - **Where:** an optional collapsible section in the details. Its average is shown, and
    "Use as score" sets `rating` to it, rounded.
- **4.11 Custom lists.** `/lists`, with your own and shared lists:
  - **Contents:** a list holds media rows (any section), ordered by drag.
  - **Members:** you invite another user of this instance by username, as viewer or
    editor. Members see the list only, never each other's libraries.
  - **Sharing outside:** a read-only public share link through 4.1.

### Phase 5
- **5.1 Where to stream.**
  - **Movies and TV:** TMDB `/{movie|tv}/{id}/watch/providers`, for `prefs.region`, cached
    for 7 days in `WatchProviderCache`.
  - **Anime:** the AniList `externalLinks` of type STREAMING.
  - **Display:** your services (`prefs.streamingServices`) come first and are badged on
    cards in Up next and the picker. All providers appear in the details.
  - **Choosing services:** Settings has a picker built from TMDB's
    `/watch/providers/movie?watch_region=` list.
- **5.2 Tonight picker.** `/tonight`:
  - **Inputs:**
    - available time (30 min, 1 h, 2 h, 3 h+, or "a few sessions");
    - sections;
    - genres (from F2);
    - "on my services" (5.1).
  - **Picks:** it shows 3 picks from Up next, preferring queue order. "Another" reshuffles.
  - **Length estimates:**
    - movies use `runtime`;
    - TV and anime use one episode (an anime episode is 24 min; a TV episode is the TMDB
      `episode_run_time`, or 45 min);
    - games use `timeToBeatHours` (as a multi-session item);
    - books use pages ÷ 40 per hour;
    - albums are 45 min.
- **5.3 Time to beat.** IGDB `game_time_to_beats` (`normally`, in seconds), fetched when a
  game is added and by the metadata job. Shown on the card and in the details as "≈ 32 h".
- **5.4 Not out yet.** Up next splits into "Available now" and "Not out yet", sorted by
  date. A release counts as out per F2's rule. The split is a view only; the queue order is
  untouched.
- **5.5 New seasons.**
  - **Recording:** when a TV title becomes Completed, `seenSeasonCount` is set to the
    current `seasonCount`.
  - **Checking:** the `new-seasons` job refreshes completed TV shows whose status isn't
    "Ended" or "Canceled", at most 100 a night.
  - **Badge:** "New season" when `seasonCount > seenSeasonCount` and the new season's
    `airDate` has passed.
  - **Notification:** one per new season.
  - **Acknowledging:** "Got it", or starting the show, sets `seenSeasonCount`.
  - **Tiers:** placement is untouched.
- **5.6 Calendar.** `/calendar` is a month grid and a list, starting the week on
  `prefs.weekStart`. It shows:
  - Planned titles with future release dates;
  - the next episodes of ongoing and completed returning TV (`nextAirDate`);
  - anime `nextAiringAt`;
  - unreleased AniList sequels of your franchises.

  A private iCal feed at `/api/ical/[calendarToken].ics` is generated (and can be
  regenerated) in Settings.
- **5.7 Notifications.**
  - **Delivery:** in-app (a bell in the header with unread notifications), plus each
    user's own ntfy URL and/or Discord webhook, both optional.
  - **Kinds:** releases today, new seasons, backup problems (sent only to the owner, meaning the
    first registered user), sync results with
    errors, and lists shared with you.
  - **Sending:** with a 5 s timeout. Failures are recorded on the notification, never
    thrown.
- **5.8 Watch together.** `/together`:
  - **Who:** pick another user who has `compareOptIn`. You must have it on as well.
  - **Result:** the overlap of both users' Planned titles in the chosen sections, ranked by
    combined queue position, with the streaming badges.
- **5.9 Countdowns.** A "in 12 days" badge on cards with a future release date (Planned
  titles only), and a dashboard tile listing the next 5 releases.
- **5.10 More by the same people.** A lazy section in the details:
  - movies and TV: directors and top cast through TMDB credits;
  - books: the author's other works through OpenLibrary;
  - anime and manga: the studio and main staff through AniList;
  - games: the developer's other games through IGDB `involved_companies`;
  - albums: the artist's top albums through Last.fm.

  Each entry has an add row.
- **5.11 Anime season browser.** `/anime/season`:
  - **Choosing a season:** season and year pickers (default: the current season), with
    filters for genre and format.
  - **Data:** AniList `Page(media: {season, seasonYear, type: ANIME})`, sorted by
    popularity.
  - **Rows:** each has an add row.

### Phase 6
`/stats`, with tabs (Overview, Year, Goals, Taste, People):

- **6.1 Year in review.** `/stats/year/[year]`:
  - **Contents:**
    - totals per section and the 6.x metrics;
    - new S-tier titles (titles finished in the year that are now in tier S);
    - a top 3 from 4.6, if any duels exist;
    - the top franchise;
    - the busiest month;
    - an optional AI verdict (a Gemini button).
  - **Sharing:** shareable as a PNG and a share link (4.1).
  - **Data:** diary entries, so the backfill gives past years data.
- **6.2 Charts.** Hand-written SVG:
  - titles finished per month (stacked by section);
  - genres (top 10 bars);
  - average score by year;
  - status mix per section;
  - drop rate.
- **6.3 Goals.** Per year: a count per section or overall, pages (books), hours (movies
  and TV, from runtime × episodes), episodes, or games beaten. Progress bars appear on
  `/stats` and as a dashboard tile.
- **6.4 Taste trends.**
  - **Drop point:** the median `progress` ÷ total at the time of a drop, from the event
    log, falling back to the current `progress`, shown per section ("you usually drop
    shows around episode 4").
  - **Genre drift:** your average score per genre by year.
- **6.5 Compare periods.** Two date ranges side by side: counts, average score, top
  genres and the number of titles finished.
- **6.6 People.** Your most-watched directors and actors (movies and TV, from the
  F2-stored credits), with counts and average scores.
- **6.7 Streaks.** The current and longest streaks of days with any activity event or
  diary entry, in the user's time zone. Shown on `/stats`.

### Phase 7
- **7.1 Recommendations across media.** A "Recommend across media" button (on the
  dashboard and `/stats`):
  - **Input:** Gemini gets your S and A tier titles from every section, plus the taste
    profile.
  - **Output:** JSON `[{category, title, year?, because}]`, at most 6, from at least 3
    different sections, none already in the library (filtered against the library index).
  - **Each item:** links to the 2.5 search, prefilled.
- **7.2 Taste profile.** The `taste-profile` job (or "Refresh" on `/stats` → Taste)
  computes a deterministic profile (genre weights, average score per section and genre,
  drop rate, favourite eras) and stores it in `TasteProfile`. It is shown as a page
  section and fed into the roast, the recommendations and 7.1. Gemini gets the summary,
  not raw rows.

### Phase 8
- **8.1 Steam.**
  - **Connecting:** Settings → Accounts → Steam. You enter a profile URL, vanity name or
    SteamID64 (vanity names are resolved through `ResolveVanityURL`). It needs
    `STEAM_API_KEY`; without one, a friendly "ask the owner to add a Steam Web API key"
    message.
  - **Import:** `GetOwnedGames` (with app info) → IGDB matches through `external_games`
    (`category = 1`, `uid = appid`), with a title search as fallback.
  - **Review:** imported through the 2.1 review step:
    - games played 0 min are suggested as Planned;
    - games played more than 0 min are suggested as Ongoing;
    - nothing is marked done automatically.
  - **Kept current:** `playtimeMinutes` and `steamAppId` are stored and updated nightly.
  - **Display:** the details show "40 h on Steam". The "Score these" list includes games
    with ≥ 10 h playtime and no score.
- **8.2 AniList sync.**
  - **Pull:** a nightly pull, a re-run of the 2.1 AniList import in "update existing" mode
    for status, progress and score, never removing anything. Needs only `anilistUser`.
  - **Push:** needs `ANILIST_CLIENT_ID`/`ANILIST_CLIENT_SECRET` (OAuth authorization code
    flow, redirect `${HOARD_PUBLIC_URL}/api/oauth/anilist`). Your status, score and
    progress changes on anime and manga are pushed through `SaveMediaListEntry`.
  - **Without keys:** the push is unavailable, and Settings explains how to register an
    AniList client.
  - **Conflicts:** the most recent change wins (`updatedAt` against AniList's
    `updatedAt`).
- **8.3 Last.fm.** Settings → Accounts → Last.fm username. The nightly job checks, for
  each Planned or Ongoing album, `album.getInfo&username=` (its `userplaycount`) and
  `trackCount`. When the play count reaches 80 % of the track count, a notification and a
  badge suggest "Mark as Listened?". It never marks anything automatically.
- **8.4 Markdown export.** Settings → Data → "Markdown (Obsidian)": a zip (fflate) with
  one `.md` per title, under `Section/Title (Year).md`, with front matter (status, score,
  tier, dates, tags, franchise, links) and the notes and reviews as the body.
- **8.5 Linked notes.** `[[Title]]` in notes and reviews is resolved against your library
  by title, case-insensitively, preferring the same section. It renders as a link that
  opens the target's details. The details show "Mentioned in" (titles whose notes or
  reviews link here). There is autocomplete on `[[` in the notes textarea.
- **8.6 Saved views.** `/views`:
  - **Building one:** a builder picks sections, statuses, tags, genres, a length limit, a
    score range, a year range and a sort.
  - **Saving:** the view is saved with a name and appears in the navigation under "Views".
  - **Results:** grid or list, with the same cards.
- **8.7 Public API.** Settings → API tokens, created once and shown once (stored as a
  SHA-256 hash). The read-only endpoints are:
  - `GET /api/v1/library?category=&status=`;
  - `GET /api/v1/activity/:id`;
  - `GET /api/v1/tiers/:category`;
  - `GET /api/v1/queue/:category`;
  - `GET /api/v1/stats`.

  They use a bearer token, are limited to 60 requests per minute per token (in memory),
  and are documented in `docs/API.md`.

### Phase 9
- **9.1 Compare.** `/compare/[username]`, only when both users have `compareOptIn`. It
  shows:
  - titles you both have;
  - the biggest score disagreements;
  - a compatibility score, as the Pearson correlation of shared scores mapped to 0–100
    (needs at least 5 shared scored titles);
  - titles they put in S tier that you haven't got.
- **9.2 Activity feed.** `/feed`: finished titles, drops and new S-tier placements by
  users who have `feedOptIn`, with scores. Your own entries appear only if you opted in.

## Out of scope

- **The roadmap's "Skipped" table.**
- **8.2 push without keys:** built, but inactive until keys exist.
- **Keys the owner hasn't supplied** (Steam, Trakt, AniList OAuth): the code ships with
  graceful messages, and the final report tells the owner exactly what to add.

## Shipping

- **Rehearsal:** on a copy of the production database (local Postgres), run the SQL files,
  `db push` and the migration job. Check that the counts are unchanged and that the
  backfills are correct.
- **Staging on the Pi:**
  - a separate compose project (`hoard-staging`) on `127.0.0.1:3019`, with its own volume,
    restored from a fresh production dump;
  - the smoke suite run through an SSH tunnel with the real keys;
  - then torn down, including its volume, which is the staging project's own and never
    `hoard_pgdata`.
- **Production:** a fresh `pg_dump` first, then the normal pi-deploy steps.
- **Verification:**
  - the live HTTP checks;
  - the backup service has produced its first dump (a manual trigger:
    `docker compose exec backup /bin/sh /backup.sh --once`);
  - the scheduler has logged its jobs.
