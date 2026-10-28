# Hoard roadmap build: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build every item in `ROADMAP.md` (the foundations and phases 1–9, minus its
Skipped table), then ship it to the Pi.

**Architecture:** Next.js 14 App Router with server actions and route handlers; Prisma 5 on
Postgres 16. Schema changes are additive (`db push` at container start, idempotent
`prisma/sql/*.sql`, and an in-app migration job). An in-process scheduler started from
`instrumentation.ts` runs the nightly jobs. A `backup` compose service runs `pg_dump`.

**Tech stack:** TypeScript, Prisma, Tailwind/shadcn, @dnd-kit, Vitest, playwright-core
(smoke tests only), and fflate, html-to-image and @zxing (lazy-loaded).

**Spec:** `docs/superpowers/specs/2026-10-28-roadmap-build.md`. It is binding: every
ruling in it is a requirement, and its "Shared contract" section is the schema.

## Global constraints

- **Additive schema only** (spec G1). `prisma/sql/*.sql` may only touch tables and columns
  that already exist in production, or must guard with `IF EXISTS`. Backfills that need
  new columns go in the in-app `migration` job.
- **Ownership checks on every action and route**, as in `src/lib/actions/media.ts`.
  Cross-user features only for opted-in users (spec G2).
- **No location APIs.** The region comes from the time zone (spec G3).
- **External calls:** a timeout (8 s by default), a soft failure, and a friendly message
  when a key is missing (spec G4). Keys never reach client bundles.
- **Dependencies:** only those in spec G6, at exact versions.
- **Copy:** per-medium wording from `src/lib/status.ts`; works at 375 px.
- **Must pass after every task:** `npm test`, `npx tsc --noEmit`, `npm run lint`,
  `npm run build` and `npm run smoke`.
- **Local database:** Postgres at `postgresql://postgres@localhost:55432/hoard_dev` (in
  `.env`, which is git-ignored). Apply schema changes with
  `npx prisma db push --skip-generate`. The demo login is `demo` / `demo1234`. Run
  `npx prisma db seed` if it is missing.
- **Days are `YYYY-MM-DD`** in the user's time zone (spec G10).
- **One commit per finished feature** (`feat: …`, `fix: …`), each ending with the
  `Co-Authored-By` trailer given in the dispatch.

## Review focus (input classes the tests must pin)

1. **Imports with messy data:** BOMs, quoted commas and newlines in CSV, half-star and
   empty ratings, duplicate rows, titles already in the library, rows with no match.
2. **Day boundaries:** a title finished at 00:30 Berlin time belongs to that Berlin day and
   year, not to the previous UTC day.
3. **Undo after a remove:** everything comes back with the same ids. Undo after the media
   row was refreshed still works.
4. **Missing keys** (Steam, Trakt, AniList OAuth, Gemini): the pages render with a clear
   message, and the jobs skip without errors.
5. **Users without opt-in** never appear in compare, together or feed, and their data is
   never returned by those actions, even when called directly.

---

### Task 1: Foundations: settings, events, score formats, smoke harness
Spec: F1, F4, 1.13, G8 (smoke).
- **Schema:** add `User.prefs`, `ActivityEvent`, `JobRun` and `Notification` from the
  contract.
- **Settings:** `src/lib/prefs.ts`: `PrefsSchema` (zod, defaults),
  `getPrefs(userId): Promise<Prefs>`, `updatePrefs(patch)` action.
- **Region:** `src/lib/timezones.ts`: `countryForTimeZone(tz: string): string | null`.
- **Events:** `src/lib/events.ts`: `recordEvent(db, e: {userId, activityId, kind, from?,
  to?, meta?})`. Wired into `addToList`, `updateActivity`, `saveTiers`,
  `acceptSuggestedTiers`, `saveQueue` and the arena swap.
- **Score display:** `formatScore(rating, format)` in `src/lib/rating.ts`, plus a client
  `PrefsProvider`/`usePrefs()` that the `(app)` layout provides. Replace every score
  display.
- **Settings page:** `/settings`, with region (auto-detected from the browser's time zone,
  editable), time zone, score format, title language, week start and hidden sections. It
  is linked in the sidebar and mobile nav. Hidden sections are filtered from the
  navigation and the dashboard.
- **Smoke harness:** add `playwright-core`, `e2e/smoke.mjs` and `npm run smoke`. It starts
  nothing itself; it expects `BASE_URL` (default `http://localhost:3000`). It logs in as
  the demo user and visits the listed routes, failing on console errors, page errors,
  failed requests (status ≥ 500) or the Next.js error overlay. Routes are listed in
  `e2e/routes.json`.
- **Tests:** prefs defaults and parsing, `countryForTimeZone`, `formatScore`, and the
  event payloads for status and score changes (a pure builder `eventsForUpdate(before,
  after)`).

### Task 2: Scheduler, backups, notifications
Spec: F3 / G9, 1.1, 5.7 (delivery plumbing).
- **Scheduler:** `src/instrumentation.ts` + `src/lib/jobs/scheduler.ts`:
  `registerJob({name, at: 'HH:MM' | 'startup', weekday?, run})`, with an advisory lock per
  job and `JobRun` bookkeeping. The pure function `dueJobs(now, tz, jobs, lastRuns)` is
  unit-tested, including DST changes and catching up after a restart.
- **Migration job:** `src/lib/jobs/migration.ts`, which runs once at startup. Later tasks
  register their backfill steps in it, and each step must be idempotent.
- **Backups:** `scripts/backup.sh` + a `backup` service in `docker-compose.yml`, exactly
  as spec 1.1, with a `--once` flag. The app service gets a read-only `/backups` mount.
  `src/lib/backups.ts` gives `readBackupStatus()` for Settings. The `backup-watch` job
  notifies the owner if the newest backup is older than 26 h.
- **Notifications:** `src/lib/notify.ts`: `notify(userId, {kind, title, body, url?})`
  writes the `Notification` row and delivers to ntfy and Discord if configured (5 s
  timeout; failures recorded). There is a bell with unread notifications in the header
  (desktop and mobile), and Settings → Notifications has the URLs and a "Send test"
  button.
- **Settings → System:** shows each job's last run and the backup status.
- **Docs:** `.env.example`, compose pass-through for the new env vars, and a README
  section on backups and restores.
- **Verification:** run `sh scripts/backup.sh --once` against the local database with
  `BACKUP_DIR` set to a temp directory; check the dump with `pg_restore --list`, and check
  retention using fake old files.

### Task 3: Release dates, genres, credits, title languages, time to beat
Spec: F2, 4.9, 5.3, plus the credits for 5.10 and 6.6.
- **Schema:** the contract columns on the media tables.
- **Providers:** each search and `enrichResult` fills `releaseDate`, `genres`, `credits`,
  the AniList title variants, `nextAiringAt`, the TV `status`/`nextAirDate`, IGDB
  `timeToBeatHours` and `steamAppId` where available.
- **Helpers:** `src/lib/genres.ts` (subject allow-list, normalising), and
  `src/lib/release.ts`: `isReleased(media, today)` and `daysUntil(media, today)`.
- **Metadata job:** limits per spec F2. `displayTitle(media, prefs)` is used everywhere a
  title is shown.
- **Tests:** release logic (year-only rules, future dates), provider mappers on fixture
  JSON (with no network in tests), and `displayTitle` fallbacks.

### Task 4: Phase 1 core: score these, progress, undo, Retired
Spec: 1.3, 1.4, 1.6, 1.12.
- **Retired:** the `RETIRED` enum value across `status.ts` (labels, order, badge, icon) and
  tier eligibility.
- **Score these:** a banner and dialog.
- **Progress:** progress in the details, a bar on cards, and debounced `progress` events.
- **Undo:** `removeActivity` returns a snapshot; `restoreActivity(snapshot)` and
  `restoreActivityState(id, state)`, with Undo in the toasts.
- **Tests:** `progressTotal(activity)`, the snapshot round trip (a pure `snapshotPlan`),
  and tier eligibility with RETIRED.

### Task 5: Phase 1 extras: manual entries, add several, crowd, favourites, PWA, CSV/JSON export
Spec: 1.5, 1.7, 1.8, 1.9, 1.10, 1.11.
- **Refactor:** add `addMediaForUser(userId, slug, result, opts)` (internal, not an action)
  and make `addToList` use it.
- **Pure helpers, with tests:** `crowdScore(media, slug)`, `biggestDisagreements(list, n)`,
  `toLibraryCsv(rows)` (quoting) and `favouritesShowcase(list)`.
- **Tests:** CSV quoting round trip, crowd normalisation, showcase ordering.

### Task 6: Import pipeline + Hoard CSV + AniList + Letterboxd + Goodreads/StoryGraph
Spec: 2.1, 2.2, 2.3.
- **Core:** `src/lib/import/` holding `csv.ts` (an RFC-4180 parser that handles BOMs),
  `types.ts` (`ImportRow`), `sources/{hoard,anilist,letterboxd,goodreads,storygraph}.ts`
  (parse + map) and `match.ts`.
- **Actions:** `matchImportRows(rows)` and `commitImportRows(rows, opts)`.
- **UI:** `/import`, with the review component (reused by later tasks: export it as
  `<ImportReview rows=… onDone=…/>`).
- **Tests:** fixtures for every source covering the messy inputs in the review focus.

### Task 7: MAL, Trakt, generic CSV, AI paste, add whole franchise
Spec: 2.7, 2.8, 2.10.
- **Sources:** `sources/{mal,trakt,generic}.ts`.
- **AI paste:** the `/api/ai/parse-list` route and its prompt + zod schema.
- **Missing franchise titles:** `franchiseMissing(franchiseId)` (an action) for the
  AniList, TMDB and IGDB lookups.
- **Tests:** MAL XML parsing, the remembered generic mapping, validation of the AI JSON
  (malformed input is rejected), and the TMDB/AniList relation mappers.

### Task 8: Add by link, search everything, Cmd+K, barcode
Spec: 2.4, 2.5, 2.6, 2.9.
- **Parsing links:** `src/lib/links.ts`: `parseMediaUrl(url): {provider, id, category?} |
  null`, with tests for every provider's URL shapes. It is the SSRF guard for the page
  title fetch: http/https only, DNS-resolved private and loopback addresses rejected,
  tested.
- **Pages and components:** `/add`, the "Search everything" dialog, the command palette
  (`cmdk` is NOT allowed; build it on the existing Dialog), and the ISBN scanner and
  input.

### Task 9: Rewatches, diary, history, ownership/format, play sessions
Spec: 3.1, 3.2, 3.4, 3.5, 3.6.
- **Schema:** `DiaryEntry`, `PlaySession`, and the activity columns.
- **Diary on finish:** `src/lib/diary.ts`: `todayIn(tz)` and `onFinished(tx, activity,
  prefs)`, called from every path that sets a finished status (`updateActivity`, the
  rating step, the queue's done button, imports).
- **Backfill:** a migration-job step backfills diary entries.
- **Pages:** `/diary`, the History section, Watch again, and the session calendar.
- **Tests:** time-zone day maths, the backfill being idempotent, grouping sessions into
  runs, and the history wording.

### Task 10: TV seasons + season tier lists
Spec: 3.3, 4.5.
- **Schema:** `TvSeason` and `SeasonActivity`.
- **Season data:** TMDB season fetching.
- **Tracking and pages:** the Seasons section in the details, progress synced from the
  watched episodes, and `/tv/seasons/[activityId]` with a tier board and season Arena.
- **Reuse:** generalise `tier-board.tsx`/`src/lib/tiers.ts` over an item type rather than
  copying them.
- **Tests:** season progress sums, and the generalised tier rules (the existing tests must
  still pass unchanged).

### Task 11: Share links + PNG, tags, Arena confidence, cross-tier challenges
Spec: 4.1, 4.2, 4.3, 4.4.
- **Schema:** `ShareLink`.
- **Image proxy:** `/api/img` with a host allow-list (tested).
- **Sharing:** `/s/[token]` public pages, and Settings → Sharing.
- **Tags:** the tag UI and the `/tags` page.
- **Arena:** confidence, and challenge mode.
- **Tests:** the image proxy allow-list, share-token access rules (pure), matchup
  preference for the fewest duels, and challenge suggestion logic.

### Task 12: Best of the year, watch order, reference lists, sub-scores, custom lists
Spec: 4.6, 4.7, 4.8, 4.10, 4.11.
- **Schema:** `YearDuelScore`, `RefList`/`RefListItem`, `CustomList*`, and
  `Franchise.orderMode`.
- **Tests:** next-in-franchise logic, sub-score averaging, list permissions (pure
  `canEditList`).

### Task 13: Where to stream, tonight picker, not out yet, countdowns, watch together
Spec: 5.1, 5.2, 5.4, 5.8, 5.9.
- **Schema:** `WatchProviderCache`.
- **Tests:** the length estimates, picker filtering, the not-out-yet split, the overlap
  ranking, and the opt-in gate (pure).

### Task 14: New seasons, calendar + iCal, notification triggers, more by the same people, anime season browser
Spec: 5.5, 5.6, 5.7 (triggers), 5.10, 5.11.
- **Tests:** new-season detection, the ICS output (folding, escaping, all-day dates;
  validated against RFC 5545 rules), and calendar week start.

### Task 15: Stats: year in review, charts, goals, trends, compare periods, people, streaks
Spec: 6.1–6.7.
- **Schema:** `Goal`.
- **Charts:** invoke the `dataviz` skill before writing any chart code.
- **Logic:** all statistics are pure functions in `src/lib/stats/*.ts`, with tests:
  streaks across time zones, drop point, goal progress, year aggregation, and comparing
  periods.

### Task 16: AI across media + taste profile
Spec: 7.1, 7.2.
- **Schema:** `TasteProfile`.
- **Logic:** a pure `computeTasteProfile(rows)` (tested), a prompt builder (tested for
  excluding library titles), and zod validation of the replies.

### Task 17: Steam, AniList sync, Last.fm, Markdown export, linked notes, saved views, public API
Spec: 8.1–8.7.
- **Schema:** `ExternalLink`, `SavedView` and `ApiToken`.
- **Tests:**
  - Steam id parsing;
  - AniList conflict resolution;
  - the Last.fm 80 % rule;
  - Markdown file naming and front matter;
  - `[[link]]` resolution;
  - saved-view query to filter;
  - token hashing and rate limit.

### Task 18: Compare and feed
Spec: 9.1, 9.2.
- **Tests:** Pearson compatibility (fewer than 5 shared titles means no score) and the
  feed privacy filter.

### Task 19: Docs and polish
- **Docs:**
  - `README.md`: the features section brought up to date, env vars, backups, jobs.
  - `FEATURES.md`: every new feature.
  - `ROADMAP.md`: a "Status" note saying what was built and what needs keys.
  - `docs/API.md`.
- **Final check:** a full run of all checks plus the smoke test, with every route in
  `e2e/routes.json`.
