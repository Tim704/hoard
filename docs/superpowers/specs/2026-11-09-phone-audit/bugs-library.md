# Bug review: library core (adding, editing, seasons, diary, undo, import, syncs)

Reviewer scope: `src/lib/library/*`, `src/lib/actions/{media,diary,seasons,import,search}.ts`,
`src/components/{add-row,search-dialog,add-by-link,progress-field,tv-seasons}.tsx`,
`src/components/title/*`, `src/lib/{diary,undo,undo-store,title-draft,seasons,progress,link-resolve,links}.ts`,
`src/lib/import/**`, `src/lib/anilist-sync*.ts`, `src/lib/jobs/{steam,lastfm}.ts`, `src/lib/apis/{index,anilist}.ts`.
This was a read-only review: nothing was edited and no servers were run.

Totals: 0 critical, 5 important, 5 minor.

---

## 1. "Read / Watch again" on the title page leaves the progress box showing the old value, so +1 saves old + 1 (important, high)

- **Where:** `src/components/title/title-fields.tsx:519` (the key), `src/components/progress-field.tsx:54-58, 114-118`, triggered from `src/components/title/title-log.tsx` (`Runs.again`) and `src/lib/actions/diary.ts:133`.
- **Input/state → outcome:**
  1. A book is Read with progress 300/300. Open its full page.
  2. Press **Read again**. `startRewatch` sets `progress: 0` on the server, and `router.refresh()` passes `activity.progress = 0` down.
  3. The Progress panel still shows **300 / 300 pages**, and "Mark as Read" is offered right away (status is now Reading and value ≥ total).
  4. Tap **+1**. `increment()` computes `(latest.current ?? 0) + 1 = 301` and `setProgress(id, 301)` stores 301 pages on a 300-page book, mid-reread.

  The same stale state appears after an Undo that restores progress on that page. It affects books, anime, manga and music. TV is not affected.
- **Why:** `ProgressField` copies `activity.progress` into `useState`/`useRef` once at mount. `TitleProgressField` remounts it on a new progress value only for TV (`key = id:progress`); every other section is keyed by `activity.id` alone. The page itself never remounts on `router.refresh()`, so the field keeps its old value.
- **Test:** Render `TitleProgressField` for a book with `progress: 300`, then rerender the same id with `progress: 0`. Click +1, advance 800 ms, and expect `setProgress(id, 1)`. Today it is called with 301.

## 2. Title Save sends every field, not just the edited ones, so a stale tab silently reverts status and score (important, high)

- **Where:** `src/components/title/use-title-editor.ts:144-151` → `src/lib/actions/media.ts:253-264`.
- **Input/state → outcome:**
  1. The desktop has a title page (or popup) open: status Watching, no score.
  2. On the phone the user marks it Watched with score 8. This writes a diary entry for today with score 8.
  3. Back on the unrefreshed desktop, they type a note and press Save.
  4. `updateActivity` gets `{status:'CONSUMING', rating:null, favorite, notes}`. The status goes back to Watching and the score is wiped, with `status` and `score` events written. If the diary entry is dated today it is also rescored to null.
  5. The toast just says "Saved." because `values.status === activity.status` on the stale tab, so there is no Undo.

  The nightly AniList pull, or Mark as Listened from another device, is reverted the same way by a page left open overnight.
- **Why:** `save()` always sends `status`, `rating`, `favorite` and `notes` from `local`, even though `changed` (the edited fields) is already computed. Unedited fields carry whatever the tab last saw from the server.
- **Test:** In a `useTitleEditor` test, edit only notes, call `save()`, and assert `updateActivity` is called with `{ notes }` only. An integration version: start from server state COMPLETED/8 and a stale editor at CONSUMING/null; saving notes must leave COMPLETED/8.

## 3. The AniList pull's "newest change wins" uses `UserMediaActivity.updatedAt`, which unrelated edits bump, so AniList changes are dropped for good (important, high)

- **Where:** `src/lib/anilist-sync-server.ts:83,100` and `src/lib/anilist-sync.ts:70`. The bumps come from `src/lib/actions/queue.ts:45` (rewrites `queueOrder` of every Planned row in the section on any drag), `src/lib/actions/arena.ts:145-160` (elo/duels), `src/lib/franchise/sync.ts:117` (after every import), tags, tier saves, and auto-grouping on add.
- **Input/state → outcome:**
  1. At 21:00 the user marks an anime Completed (score 9) on AniList; in Hoard it is Planned.
  2. At 22:00 they drag any anime in Hoard's Anime Up next. `saveQueue` updates every Planned anime, so this one's `updatedAt` becomes 22:00.
  3. At the 05:30 pull, `remoteAt` 21:00 < local 22:00, so the pull treats Hoard as newer. It only fills empty score/progress, and the status stays Planned.
  4. AniList's `updatedAt` never moves again for a finished entry, so every later night repeats this. Hoard never learns it was finished: no finish, no diary entry, no tier tray.

  The same happens after an Arena duel, a tag edit, or an import's franchise regroup.
- **Why:** The rule should compare AniList's time with the last local change to status, score or progress. `updatedAt` is "last write of any column". `src/lib/jobs/steam.ts:29-31` already uses raw SQL so playtime doesn't bump `updatedAt` "(the AniList conflict rule)", which shows the dependency is known, but most other writers still bump it.
- **Test:** Activity Planned with its last status event at T0. `saveQueue` at T2. Pulled entry COMPLETED with `updatedAt` T1 (T0 < T1 < T2). Expect status → COMPLETED. Today: unchanged.

## 4. An anime/manga added before AniList knew its MAL id is stored as `al-N`; later adds see the MAL id and create a second activity (important, medium)

- **Where:** `src/lib/apis/anilist.ts:192-193` (`externalId = idMal ?? 'al-'+id`), the `al-` rows deliberately kept (`src/lib/apis/anilist.ts:393-402`), `src/lib/library/add.ts:96-100` and `src/lib/data-search.ts:15-40` (both key purely by externalId), `src/lib/import/matcher.ts:165`.
- **Input/state → outcome:**
  1. The user adds an announced anime from the season browser or search while AniList has no `idMal` yet. The catalogue row is `al-170000`.
  2. Weeks later AniList links MAL 59000. Search, the season browser and links now return externalId `59000`.
  3. `library[externalId]` / `libraryMarks` find nothing, so "In library" isn't shown and Done/Want are offered.
  4. Adding again creates a new catalogue row `59000` and a second activity: duplicate title in the section, stats and tier list.

  Also: once a `59000` row exists (for example the friend added it), the AniList import and the nightly AniList pull match `59000` first (`cat.get(mal) || cat.get('al-…')`). The `inLibrary` check then misses the user's `al-170000` activity, and the pull adds a duplicate.
- **Why:** One AniList media can have two catalogue keys over time. Every "already in library" check and the add's existing check look at a single externalId.
- **Test:** Matcher: catalogue has `59000` and `al-170000`, the user's library has `al-170000`, row ids `{anilist:'170000', mal:'59000'}` → expect `inLibrary` non-null. Today it is null. Same for `libraryMarks`/`addToList` with hit `59000` when `al-170000` is owned → expect `existing: true`.

## 5. AniList push then pull rounds the score and overwrites the local one (important, medium; latent until the push keys are set on the live server)

- **Where:** Push `src/lib/anilist-sync.ts:121` (`scoreRaw = round(rating*10)`). Pull reads `score(format: POINT_10_DECIMAL)` (`src/lib/import/sources/anilist.ts:32`). Overwrite at `src/lib/anilist-sync.ts:76`.
- **Input/state → outcome:**
  1. The user's AniList score format is "10 Point" (integer) or 5-star.
  2. They score an anime 8.7 in Hoard. The push sends `scoreRaw: 87`, and AniList stores 9 (or 4★ = 8.0).
  3. AniList's `updatedAt` is the push time, always later than the local commit, so the next pull counts AniList as newer.
  4. 9.0 ≠ 8.7, so the local score becomes 9.0. The decimal score is lost and the tier suggestion moves.
- **Why:** The pull treats Hoard's own echo as a remote change, and the comparison doesn't allow for the user's AniList scoring granularity.
- **Confidence note:** That AniList stores scores in the user's format (lossy for scoreRaw) is from memory. A web search did not confirm it, so verify against the live API.
- **Test:** `resolveConflict` with local 8.7 (updated T0) and remote 9.0 at T1 > T0, where 9.0 is what `scoreRaw 87` becomes in POINT_10. Expect no rating change once the rule ignores remote scores that equal `round(local)` in the user's format, or skips entries whose remote `updatedAt` matches the last push. Today it returns `{rating: 9}`.

## 6. A Letterboxd link for a film whose title ends in a year-like number resolves to a different film (minor, high)

- **Where:** `src/lib/links.ts:60` and `src/lib/link-resolve.ts:118-120`.
- **Input/state → outcome:**
  1. Share `https://letterboxd.com/film/blade-runner-2049/`.
  2. `letterboxdQuery` → `{query:'blade runner', year:2049}`. TMDB finds nothing for year 2049.
  3. The retry drops the year and searches `blade runner`, so `hits[0]` is Blade Runner (1982), offered as the one add row. One tap from the share sheet adds the wrong film.
  4. `wonder-woman-1984` gives Wonder Woman (2017) the same way.
- **Why:** A trailing number inside 1800–2099 is always taken as a disambiguation year. The fallback never tries the full slug words as the title.
- **Test:** `resolveMediaLink` with fake deps where `movies('blade runner',2049)` → [] and `movies('blade runner 2049')` → [BR2049]. Expect BR2049. Today the result is `movies('blade runner')[0]`.

## 7. Steam import with "Update existing titles" turns Dropped, Paused or Retired games into Playing (minor, high)

- **Where:** `src/lib/import/sources/steam.ts:115` and `src/lib/import/update.ts:58` (`STATUS_RANK` CONSUMING 4 > RETIRED 3 / ON_HOLD 2 / DROPPED 1).
- **Input/state → outcome:**
  1. A Retired MMO, or a game Dropped years ago, has any Steam playtime, so its Steam row says CONSUMING.
  2. With "Update existing" ticked (for other rows), the status moves to Playing.
  3. Retired titles leave the tier list (their tier is kept but hidden).
- **Why:** Steam's status is derived from "minutes > 0" and says nothing about current play. The status merge still treats it as forward progress.
- **Test:** `planImportUpdate({status:'RETIRED',…},{status:'CONSUMING'})` for a Steam row → expect no `status` in the patch. Today `patch.status === 'CONSUMING'`.

## 8. "Watch again" on a TV show tracked by seasons resets progress to 0, but the next season change jumps it back to the full count (minor, high)

- **Where:** `src/lib/actions/diary.ts:124-133` resets only `UserMediaActivity.progress`. `src/lib/actions/seasons.ts:149-155` recomputes progress as the sum of the untouched `SeasonActivity` rows.
- **Input/state → outcome:**
  1. A 62-episode show has every season ticked. Press **Watch again**: progress reads 0/62.
  2. Tap +1 on Season 1. S1 is already full and is clamped, but progress is recomputed to 62/62 and "Mark as Watched" is offered.
  3. Rewatch progress can't be tracked: every season interaction snaps back to the old sum.
- **Why:** The rewatch reset and the season sum disagree. Nothing clears or archives the season counts for the new run.
- **Test:** A TV activity with seasons summing to 62 → `startRewatch` → `updateSeasonWatch(S1, {kind:'inc'})` → expect progress 1. Today it is 62.

## 9. After a finish saved on the title page, the Review field still shows the previous run's review, but saving writes to the new run (minor, medium)

- **Where:** `src/components/title/title-page.tsx:112-116` (no `onSaved` reload of `useActivityLog`), `:275-284` (`ReviewField key={log.diary[0].id}`), `src/lib/actions/diary.ts:264` (`setLatestReview` targets the latest entry at save time).
- **Input/state → outcome:**
  1. A title's only entry E1 (last year) has review "Great". Mark it Watched via the Save bar, which creates E2 (today).
  2. The log isn't reloaded, so the Review panel still shows "Great" (E1). The user fixes a typo and saves.
  3. The text goes into E2 and E1 is unchanged. Clearing the field shows "Review saved." but E1 keeps "Great".
  4. "Watched N×" and History are stale too.
- **Why:** Only Runs, Sessions and Review call `logChanged`. The editor's save (status change and diary write) and its Undo toast don't.
- **Test:** In a title page test, save status COMPLETED; expect `getActivityLog` to be called again and `ReviewField` re-keyed to the new latest entry.

## 10. "Watched, then score" across midnight leaves the diary entry unscored (minor, medium)

- **Where:** `src/lib/diary.ts:101-108` (rescore only when `latest.date === today`).
- **Input/state → outcome:**
  1. Finish a film at 23:59 (entry dated D, no score).
  2. Score it at 00:01 (now D+1). `planFinish` sees `latest.date !== today`, so there is no rescore.
  3. The activity has 8.0, but the diary entry (and the year's diary and goals) shows the finish without a score.
- **Why:** The rule is keyed to the calendar day instead of "the entry this run just wrote" (for example, created within the last few minutes, or no later status change since). It may be intentional, but it breaks the stated goal of "ONE entry with the score".
- **Test:** `applyDiaryForUpdate` with a latest entry dated yesterday and `createdAt` 2 minutes ago, status COMPLETED, new rating 8 → expect a rescore. Today nothing happens.

---

### Checked and found sound (not reported)

- Ownership and privacy checks on every action in scope; manual-row isolation in add/import.
- Remove/Undo snapshot covers every cascade child (events, diary, sessions, seasons, year duels).
- Diary-entry Undo deletes by id; import diary dedupe by day.
- Season prefill matches what the client is shown.
- Catalogue writes from client hits are allow-listed and fill-only.
- Steam app id confirmation through IGDB.
- Rate-limited import chunk retries; CSV parsing.
- Book work-key normalisation (no edition/work duplicates).
- Popup follows the live activity by id.
- Concurrent double add is blocked by the unique index: worst case a spurious "Failed to add" toast, no bad data.

Sources (web check for finding 5, inconclusive): [greasyfork AniList helpers](https://greasyfork.org/th/scripts/496875-helpers/code)
