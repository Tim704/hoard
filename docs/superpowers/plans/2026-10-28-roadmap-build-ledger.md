# SDD ledger — plan: docs/superpowers/plans/2026-10-28-roadmap-build.md

Spec: docs/superpowers/specs/2026-10-28-roadmap-build.md. Branch: feat/roadmap (base 4b6da24 + docs commit).
Local DB: Postgres.app cluster at scratchpad/pgdev, port 55432, db hoard_dev, started with -k ''.

## Pre-flight scan
| Pair / task | Produces → consumes | Finding |
|---|---|---|
| T1 → all | prefs, recordEvent, formatScore/usePrefs, smoke harness | ok |
| T1 vs T2 | plan T1 lists JobRun + Notification schema; T2 implements them | Ruling: T2 adds JobRun + Notification; T1 adds only prefs + ActivityEvent — schema lands with its code — cost if wrong: none |
| T2 → T14, T17 | notify(), registerJob, migration job steps | ok |
| T3 → T13, T14, T15, T16 | releaseDate/genres/credits/timeToBeat, isReleased, displayTitle | ok |
| T4 → T9, T10, T12 | snapshot/restoreActivity | Ruling: every later task that adds a table hanging off UserMediaActivity (DiaryEntry, PlaySession, SeasonActivity, YearDuelScore, CustomListItem refs media not activity) extends snapshot+restore and its test — cost if wrong: undo loses rows |
| T5 → T6, T7, T8, T17 | addMediaForUser | ok |
| T6 → T7, T8(2.10 none), T12(ref lists add), T17 (Steam, AniList pull) | ImportReview, matchImportRows, commitImportRows | ok |
| T9 → T15, T12(4.6) | DiaryEntry + onFinished | ok; T12 4.6 reads diary entries |
| T10 → T10 | generalised tier rules must keep existing tests unchanged | ok |
| T11 → T12(4.11 share), T15(6.1 share) | ShareLink, /api/img | ok |
| T13 vs T3 | picker needs timeToBeat/genres | ordering ok |
| Each task self-consistency | T1–T19 tests named match code named | ok |
| Spec 4.4 | earlier draft mentioned YearDuelScore store | fixed in spec before dispatch |

## Rulings
- Ruling: one long-lived feature branch in place (no worktree) — repo has no other in-flight work and node_modules/.env/local DB are already set up here — cost if wrong: none.
- Ruling: owner asked not to be stopped; spec rulings were made without asking — cost if wrong: rework visible in spec.

## Progress
- Task 1: implemented 73859c7..e1d6639 (DONE_WITH_CONCERNS: prefs split into data-prefs.ts/actions/prefs.ts; UTC→DE fallback; double star in five format; local-only dev fixture rows in hoard_dev). Implementer agent a5b4881deda7a9e0c. Review dispatched.
- Ruling: getPrefs/updatePrefs file split accepted — 'use server' files may only export async functions and prefs.ts must stay client-importable — cost if wrong: none.
- Task 1 review: Needs fixes (1 critical: smoke overlay check dead via shadow DOM; 2 important: libraryBadge format, double star). Ruling: also fix seed demo library (load-bearing for later smoke) and region "Not set" re-detect loop.
- Task 1: minor (deferred): prefs read-modify-write race on detectRegion vs save.
- Task 1: minor (deferred): one bad hiddenSections value resets list to [].
- Task 1: minor (deferred): arena swaps logged kind:'tier' with from=to (meta.via) — stats must filter.
- Task 1: minor (deferred): dashboard Now consuming fetches 12 then filters hidden sections.
- Task 1: fix round 1/5 (5 addressed per implementer, re-review pending; commits e1d6639..eef1a9a). Minor (deferred): weekStart accepts 0–6 but UI offers Mon/Sat/Sun; score events store '8' not '8.0'.
- Task 1: complete (commits 73859c7..eef1a9a, review clean after round 1)
- Task 2: dispatched (base eef1a9a), implementer acd12e38e3bb84395
- Task 2: implemented eef1a9a..f43288a DONE_WITH_CONCERNS (xact advisory lock inside pinned tx; Notification.error added; backup dir must pre-exist; empty kinds = all; never-run jobs fire at first start; backup.sh tested under dash only)
- Task 2 review: Approved; Important #1 staging would write into prod backup folder. Ruling: DEPLOY MUST-DO — staging stack starts only `db app` (never `backup`) AND sets HOARD_BACKUP_DIR to a staging-only dir; no code change — cost if forgotten: staging dump overwrites today's prod dump file.
- Task 2: fix round 1 dispatched (first-sight job seeding, backup-watch quiet before first backup, pid tmp name, generic notify errors + private-IP literal rejection, owner-only System card, README connection_limit note).
- Task 2: minor (deferred): xact lock lease expiry after 2h records ok job as error; DST nights in backup loop run at 02:00/04:00 (documented); backup container uid has no passwd entry — confirm in first Pi log.
- Task 2: fix round 1/5 (6 addressed, 0 open; commits f43288a..53b187e)
- Task 2: complete (commits eef1a9a..53b187e, review clean)
- Task 2: minor (deferred): url-safety misses NAT64/6to4 IPv6; timeout vs connect error still distinguishable; notifications catch returns err.message for DB errors; crashed backup leaves pid tmp/log files.
- Task 3: dispatched (base 53b187e), implementer aca79ee9166305ddb
- Task 3: implemented 53b187e..7439f4c DONE_WITH_CONCERNS (TMDB/IGDB/Last.fm fixture-only; IGDB steam via external_game_source; one failed lookup marks run error; time-to-beat only in details).
- Ruling: spec 5.3 card display of "≈ 32 h" deferred to Task 13 (my Task 3 dispatch limited UI) — carry into Task 13 dispatch — cost if forgotten: spec gap.
- Task 3 review: Approved; controller sent minors 1–5 + pre-existing upsert-blanking + naming as fix round 1 (make-no-mistakes ruling: cheap real bugs fixed now).
- Ruling for Task 14: calendar/new-seasons job must refresh airing anime + returning TV (nextAirDate/nextAiringAt) at least weekly, not on the 30-day metadata cadence — carry into Task 14 dispatch.
- Task 3: complete (commits 53b187e..4182b20, review clean after round 1)
- Task 4: dispatched (base 4182b20), implementer a3bb019c2fb188cdc
- Ruling: undo uses a server-side in-memory snapshot keyed by token (2 min TTL), not a client snapshot — G2 forgery risk — cost if wrong: undo unavailable after an app restart within 2 min (acceptable).
- Task 4: implemented 4182b20..82f832d DONE_WITH_CONCERNS (in-memory undo; list memberships not snapshotted; status undo restores allowed fields only; typed progress may exceed total)
- Task 4 review: Approved; fix round 1 sent for minors 1–3 (serialise progress saves; hide Mark-as for finished statuses; normalize restored rating).
- Task 4: minor (deferred): undo store bound is global (200); status undo overwrites changes made after save within 8 s; vague message on lost undo race.
- Ruling for Task 12 (4.11): CustomListItem is keyed by media, not activity — removing a title should NOT remove list items (lists hold media), so nothing to snapshot; confirm in Task 12 dispatch.
- Task 4: fix round 1/5 (3 addressed per implementer; commits 82f832d..3fb97b1), re-review a57c0d80055a03f98 running.
- Task 5: dispatched (base 3fb97b1), implementer a67ab1271adbd0da6. Ruling: /add is a non-crashing placeholder until Task 8 replaces it.
- Task 4: complete (commits 4182b20..3fb97b1, review clean after round 1)
- Task 4: minor (deferred): persist chain could stay rejected if router.refresh/toast throws inside save — add .catch in persist.
- Task 5: implemented 3fb97b1..ccec63b DONE_WITH_CONCERNS (cuid-like manual id; select-several sequential; CSV status = enum; crowd 0 = none; demo rows title-grouped; signed-out /add share loses text → carry to Task 8 (login redirect must preserve ?next=)).
- Task 5 review: Needs fixes — Important G2: client fields.externalId could rename shared row to manual: and enable edits for all. Ruling: pin externalId AND make existing-row updates fill-only (client data never overwrites non-empty shared catalogue values; metadata job owns refresh) — cost if wrong: re-adding no longer refreshes a changed poster URL until the metadata job runs. Also fixing CSV formula injection (+ unescape helper for Task 6), prefs export allowlist, sticky bar.
- Task 5: minor (deferred): queueOrder race under parallel adds (importers must commit sequentially).
- Task 5: fix round 1/5 (4 addressed; new Important: client-settable metaFetchedAt; controller Q: first creator controls title/cover/description). Ruling: fix both now — provider is source of truth for title/imageUrl/description/crowd score on non-manual rows (detail mappers + AniList lookup on add); metaFetchedAt/metaFailedAt server-owned. Commits ccec63b..15f0593. Round 2 dispatched.
- Task 5: fix round 2/5 (all addressed; commits 15f0593..5fe3b53)
- Task 5: complete (commits 3fb97b1..5fe3b53, review clean after round 2)
- Task 5: minor (deferred): metadata job AniList path writes patch without compact() (title variants may be set null); every anime/manga add makes one AniList call.
- Ruling for Task 6: DiaryEntry doesn't exist until Task 9 → Task 6 stores finishedOn as finishedAt and keeps review/rewatch on ImportRow; Task 9 must extend commitImportRows to write diary entries (carry). Task 6 adds the `tags String[]` column (contract) so shelves map to tags; Task 11 builds tag UI.
- Task 6: dispatched (base 5fe3b53), implementer a5b367688055fa612
- Task 6: implemented 5fe3b53..4975da5 DONE_WITH_CONCERNS (no-day completed → finishedAt null; diary fields passthrough for Task 9; Hoard CSV reimport doesn't restore tier/queue/fav/franchise; StoryGraph format assumed; TMDB fixture-only; invalid chunk marks 10 rows unmatched)
- Task 6 review: Approved; fix round 1 sent (Letterboxd logging date not a finish date; failed-row list + retry; numeric id validation + manual/demo filter; body-size-aware chunks; favourite restore + note; no status downgrade on update; double-run guard/beforeunload/key reset).
- Task 6: minor (deferred): noon-UTC days off by one in UTC+12..+14 zones; client-built rows may create catalogue rows from client fields when enrichment fails (parity with addToList).
- Task 6: fix round 1/5 (7 addressed per implementer; commits 4975da5..ad26859); re-review a6ce87191392cdf1d running.
- Task 7: dispatched (base ad26859) concurrently with Task 6 re-review, implementer a445d520c86892ab1. Ruling: platform stored as a tag until Task 9 adds ownedPlatforms — Task 9 should migrate? No: leave tags; Task 9's ownership UI is separate.
- Task 6: complete (commits 5fe3b53..ad26859, review clean after round 1). ISBN normalisation + copy fix + dead branch handed to Task 7 implementer as addendum.
- Task 6: minor (deferred): runImport throwing outside caught calls leaves phase 'importing'.
- Task 7: implemented ad26859..4943fe0 DONE_WITH_CONCERNS (Trakt shapes from old blueprint; AI 30 s timeout; franchise missing all ticked as Want; generic CSV ignores MM/DD/YYYY; IGDB parent_game filter)
- Task 7 review: Approved; fix round 1 sent (AI body cap + Content-Length; shared per-user AI rate limiter incl. roast — registration is open; case-insensitive mapping restore; negation status words; DD.MM.YYYY + unread-date warning; franchise-missing untick >10; assign added titles to the franchise; Trakt reset_at + row-cap warning + toasts; MAL CDATA note).
- Ruling: 2.10 uses its own checklist + commitImportRows instead of ImportReview — rows are exact provider hits with nothing to match — cost if wrong: none.
- Ruling: open registration means every AI call (roast, parse-list, later recommend/taste/year verdict) goes through the shared per-user rate limiter — cost if wrong: owner's Gemini bill.
- Task 7: fix round 1/5 (9 addressed per implementer; commits 4943fe0..f0bbd99); re-review af634c495a83be4c0 running.
- Task 8: dispatched (base f0bbd99), implementer a877cbd29ae27809e. Rulings: full SSRF guard (DNS all-address check, manual redirects re-validated, 512 KB cap); login `next` param same-site only.
- Task 7: re-review round 1 NEEDS FIXES (no Tick all; negation gaps; orphan franchise risk); controller added: drop 411 rule (tunnel may chunk). Round 2 sent while Task 8 runs concurrently (file-scoped commits).
- Task 7: fix round 2/5 (all addressed; commit 200928a)
- Task 7: complete (commits ad26859..200928a, review clean after round 2)
- Task 7: minor (deferred): addToFranchise failure swallowed before finishImport regroup; vague-status regex matches 'other'/'misc' anywhere; misplaced Want comment.
- Task 8: implemented 200928a..793a458 DONE_WITH_CONCERNS (Goodreads ISBN not exposed → slug fallback; server-side fan-out; palette index no invalidation; new middleware sets x-hoard-path; TMDB/IGDB link lookups fixture-only)
- Task 8 review aac84d4cc1fc3c1c0 running.
- Task 9: dispatched concurrently (base 793a458), implementer a559728b12d9179c5. Ruling: diary entries for COMPLETED and RETIRED transitions only (not DROPPED); same-day later score updates that entry — cost if wrong: diary shows drops? (spec 3.1 says "finishing a title (from any path)"; DROPPED isn't finishing in the diary sense).
- Task 8 review: Needs fixes (open redirect via dot segments in safe-next; palette mark-done lacks Undo) + minors 3–8 (fromCodePoint throw, more blocked IPv6/v4 ranges, camera leak, palette cache per user, ?open= reopen, Mac Ctrl+K). Fix round 1 sent.
- Task 8: fix round 1/5 (8 addressed; commit 2f685af)
- Task 8: complete (commits 200928a..2f685af excluding Task 7's 200928a, review clean after round 1)
- Task 8: minor (deferred): in-flight palette index tagged with closure userId; ipv6Blocked direct call false on unparseable.
- Task 9: implemented 0ed0fdc DONE_WITH_CONCERNS (COMPLETED/RETIRED only; add-as-completed writes today entry; undo deletes newest diary entry <15 min heuristic; watch again only COMPLETED/RETIRED; desktop details now scroll; review w/o date dropped on import)
- Task 9 review a05d6eeb8ab3f6d9b running; Task 10 dispatched concurrently (base 0ed0fdc), implementer a23198b078b9efee2.
- Task 9 review: Needs fixes (migration steps re-run every boot → backfill recreates deleted entries; dateless imported reviews dropped) + 3–6 (deterministic undo by entry id; clear rewatching on any finish; score-undo restores diary rating; atomic import add+diary). Round 1 sent. Ruling: migration steps become one-shot in the framework (JobRun marker per step).
- Task 9: minor (deferred): /diary sends whole library for picker; same-day watch+rewatch merged on import; tiny backfill race at boot.
- Task 9: fix round 1/5 (6 addressed; commit 9ae3107); round 2 sent for rescore-on-every-undo low. Minor (deferred): short review text matched anywhere in notes.
- Task 9: fix round 2/5 (1 addressed; commit 914086b — one-line guard + test, verified by controller read of the diff)
- Task 9: complete (commits 2f685af..914086b Task-9 commits 0ed0fdc, 9ae3107, 914086b; review clean)
- Task 10: implemented 78f12a0 DONE_WITH_CONCERNS (season score/tier/duels write no events; existing shows' seasons via nightly job only; route under [category]/seasons; season arena duels; min-w-0 + ProgressField wrapper)
- Task 10 review ab8282ec6818ca64c running; Task 11 dispatched concurrently (base 78f12a0), implementer abafe0d043f245a0a. Rulings: share pages show tiers + titles only (no scores/notes); /api/img requires session + CDN allow-list; no events for tags.
- Task 10 review: Needs fixes (first season tap clobbers progress; existing shows wait days for seasons). Round 1 sent incl. on-demand season fetch, parent row lock, clamp, tick cap, read-only ProgressField, P2002, arena toast. Ruling: metadata nightly cap 200→1000 rows, TV first among never-fetched — first deploy has every row never-fetched — cost if wrong: ~10 min nightly job on the Pi.
- Task 10: minor (deferred): season score/tier/duel write no events (future `season` kind); metadata column update + saveTvSeasons not atomic.
- Task 10: fix round 1/5 (6 addressed, 1 open — prefill trigger misses rating/tier-first rows; commit a6a3c86). Round 2 sent.
- Task 10: fix round 2/5 (1 addressed; commit dc43611, controller read the diff — hasWatchState + upsert keeps scores)
- Task 10: complete (commits 78f12a0, a6a3c86, dc43611; review clean). Note: a6a3c86 alone doesn't build (swept Task 11 lines; fixed in dc43611).
- Ruling: no more concurrent implementers — overlapping commits produced a non-building intermediate commit; from Task 12 on, strictly one implementer at a time (reviews may overlap with the next implementer only if they review a fixed diff file) — cost: wall time.
- Task 11: implemented dc43611..1949e67 DONE_WITH_CONCERNS (img allow-list incl archive.org + ia<N>.us.archive.org regex; share page omits username; fixed duplicate sibling keys; share URL uses HOARD_PUBLIC_URL; challenge history shape-checked; isCategorySlug 'toString' bug pre-existing)
- Task 11 review: Approved; fix round 1 sent (img private cache; isCategorySlug Object.hasOwn — pre-existing bug that could plan tier saves across all sections; tag merge truncation; input disabled while saving; reduce; archive.org note).
- Task 11: fix round 1/5 (6 addressed; commit 703c1d6, controller read diff)
- Task 11: complete (commits b1f9f6e, 1949e67, 703c1d6; review clean)
- Task 12: dispatched (base 703c1d6), implementer acdbdf2efb831ecb5 (sole implementer).
- Task 12: implemented 703c1d6..886bf91 DONE_WITH_CONCERNS (IGDB top-100 unverified; next-in-franchise cross-section; rewatch-in-year candidates; RefList.refreshedAt added; partial refresh; paste auto-keeps high/medium; no events for subscores/order; exports lack new data)
- Task 12 review: Approved; round 1 sent (atomic ref refresh + unique; remove pasted item, only high auto-kept; AI row sanitising; year duel P2002; idempotent builtin create + N+1; next-in chip cross-section refinement; invite rate limit).
- CARRY TO TASK 19: JSON export must include everything the user owns — diary entries, play sessions, season activity, year duel scores, owned custom lists + items, reference lists (+ new later tables: goals, saved views, api tokens metadata (no hashes), external links (no tokens), taste profile).
- Task 12: fix round 1/5 (7 addressed; commit 6178857)
- Task 12: complete (commits 8b51a08..6178857, review clean). Minor (deferred): stale refreshRefListStep comment; bare catch in refreshRefList; refresh can approach 60–100 s on slow pages.
- Task 13: dispatched (base 6178857), implementer ac05dc75302de28da.
- Task 13: implemented 6178857..0993a63 DONE_WITH_CONCERNS (manga only in few sessions; static fallback provider ids from memory; AniList names matched; countdown day at render; 60-candidate service filter; added TvShow.episodeRunTime)
- Task 13 review: Approved; round 1 sent for 5 minors (TMDB failure backoff, tonight depth, deselect missing services, Prime 119 names, sorted badge key).
- Task 13: fix round 1/5 (5 minors addressed; commit 2ddcb23, controller checked stat + tests reported)
- Task 13: complete (commits 2490e91, 0993a63, 2ddcb23; review clean)
- Task 14: dispatched (base 2ddcb23), implementer ac40b8ce1130f7ab5. Ruling: Franchise.upcoming Json? (additive, not in contract) caches unreleased AniList sequels for the calendar.
- Task 14: implemented 2ddcb23..a2e9aea DONE_WITH_CONCERNS (dedupeKey non-unique index; books more-by via search author_key; IGDB involved_companies unverified; undo doesn't restore seenSeasonCount; year-only sequels omitted)
- Task 14 review: Needs fixes (dedupeKey should be unique while table is new; seenSeasonCount baseline counts unaired seasons). Round 1 sent + early-morning airings, sequel starvation, prefs row lock (also fixes Task 1 deferred race), releases skip hidden sections.
- Ruling: G1's no-data-loss rule binds PRODUCTION; tables new in this build may get unique constraints; local dev DB may use --accept-data-loss once for them.
- Ruling: seenSeasonCount = highest aired seasonNumber (fallback seasonCount) — spec intent over literal wording.
- Task 14: minor (deferred): releases at 06:00 server TZ arrives evening for Americas users; TMDB person lookup by name may pick namesake; undo doesn't restore seenSeasonCount.
- Task 14: fix round 1/5 (6 addressed; commit 6f065b6)
- Task 14: complete (commits 330ec54, a2e9aea, 6f065b6; review clean). Minor (deferred): failure-path franchise.update not in try; fetchedAt stamped on failed walk.
- Task 15: dispatched (base 6f065b6), implementer a420d0dc188a1def8.
- Task 15: implemented 1df60a1 DONE_WITH_CONCERNS (finished rule; hidden sections excluded from stats; streaks count all event kinds incl import/arena; compare on Taste tab; Gemini 20 s; smoke year hardcoded 2026; share title 'A shared list')
- Task 15 review: Approved; round 1 sent for 8 minors (wording, top-3 filter order, Gemini abort, query merge, dashboard parallel goals, TV hours fallback, svg role, share titles).
- Task 15: fix round 1/5 (8 minors addressed; commit 538bc7e, controller checked stat + reported tests)
- Task 15: complete (commits 1df60a1, 538bc7e; review clean)
- Task 16: dispatched (base 538bc7e), implementer aa4f933a798ccdfbe.
- Task 16: implemented a3c4c21 DONE_WITH_CONCERNS (library dedupe across grouped sections; Find it title only; stale hidden sections in sentences; Refresh own limit + hourly window in limiter; roast 20 s timeout)
- Task 16 review: Approved; round 1 sent for minors 1–3 (weekly recompute + deep-equal skip; hide hidden sections in sentences/prompts; rate before heavy loads).
- Task 16: fix round 1/5 (3 addressed; commit 7d69a79)
- Task 16: complete (commits a3c4c21, 7d69a79; review clean)
- Ruling: Task 17 split into 17a (8.1 Steam, 8.2 AniList sync, 8.3 Last.fm) and 17b (8.4 Markdown export, 8.5 linked notes, 8.6 saved views, 8.7 public API), dispatched sequentially — size.
- Task 17a: dispatched (base 7d69a79), implementer afbea1e8c3427d41d. Ruling: OAuth tokens AES-256-GCM encrypted with key from new optional HOARD_SECRET; push unavailable without it.
- Task 17a: implemented fa3471e DONE_WITH_CONCERNS (sync kind reuse; client steam commit can set steamAppId if none; OAuth untested live; in-memory state/queue; pull skips unsure matches; prefs account ids patchable unvalidated)
- Task 17a review: Needs fixes (RETIRED round-trip rewrite; client steamAppId poisons shared row; push coverage gaps) + 8 minors; round 1 sent.
- Task 17a: fix round 1/5 (11 addressed; commit b46b246); round 2 sent for import push volume (skip anilist source, skip >200-row imports) + viewerName fallback.
- Task 17a: fix round 2/5 (addressed; commit d5eea0d, controller checked stat)
- Task 17a: complete (commits fa3471e, b46b246, d5eea0d; review clean). Minor (deferred): in-memory OAuth state + push queue; OAuth untested live.
- Task 17b: dispatched (base d5eea0d), implementer a169720c651a763d7; includes the full-JSON-export carry from Task 12.
- Task 17b: implemented d5eea0d..1cf4d2d DONE_WITH_CONCERNS (views score range 0–10 raw; md tag spaces→-, aliases; link matching extras; 30 s client cache; in-memory limits, no per-IP; docs link to GitHub main; stats subset; export v2)
- Task 17b review: Approved; round 1 sent (per-IP failed-auth limiter, byte-capped filenames, NFC, atomic view cap). Minor (deferred): views score range raw 0–10; hidden sections visible via API (display pref); no CORS (documented).
- Task 17b: fix round 1/5 (4 addressed; commit 1ca8b90)
- Task 17b: complete (commits 42c1e78..1ca8b90; review clean)
- Task 18: dispatched (base 1ca8b90), implementer ac0154d0a4bca2662.
- Task 18: implemented 2de2e8b DONE_WITH_CONCERNS (seed opt-ins; drop shows current score; caps 2000/300; together link hidden without opt-in)
- Task 18 review ab797f813ed9ea55d running; Task 19 (docs only) dispatched concurrently, implementer a26c400cec80181ff (doc files only — no code overlap).
- Task 18 review: Needs fixes (feed per-source cap + post-fetch filtering can skip entries); round 1 sent incl. undo handling, opaque cursor, copy fixes.
- Task 19: complete (commit 11df0d4, docs only; to be covered by the final whole-branch review). Notes: GOOGLE_BOOKS_API_KEY unused (pre-existing); API limit>100 clamped not 400 (documented).
- Task 18: fix round 1/5 (4 addressed, 1 partial — horizon fallback can skip; commit ab4694f). Round 2 sent.
- Task 18: fix round 2/5 (addressed; commit 468014d). Ruling: horizon ignored only in degenerate >2000-at-one-instant cases — accepted.
- Task 18: complete (commits 2de2e8b, ab4694f, 468014d; review clean)
- ALL TASKS COMPLETE. Final whole-branch review next (3 parallel lenses due to size: deploy safety, security/privacy, cross-feature correctness+perf).
- Final review dispatched: deploy safety a103e0268c2fd4e9f, security/privacy a9dbf7d840027147c, correctness/perf a164fe371833aa217 (base a490a7f, head 468014d).
- Final review (security): CRITICAL C1 nested-write mass assignment via result.fields relation keys (activities/seasons) → write into other users' libraries; PRE-EXISTING on main (create: result.fields). Important: searchMedia unauthenticated (pre-existing); no per-user throttle on provider fan-out actions. Minors M1–M8. Waiting for the other two lenses before ONE fix wave.
- Final review (correctness): Important — undo wipes hidden tier; Dropped→Completed no diary; diary backfill dates whole library to Oct 2026 (finishedAt = add time on main); AniList pull/import updateExisting finishes write no diary/finishedAt. Minors incl. dashboard query count (React cache), arena swap events in History, tier readers without eligibility, persist .catch, seenSeasonCount undo.
- Ruling: adding a title directly as done (Add dialog, select several, manual, link, ISBN) writes NO diary entry (date unknown); backfill skips rows where |finishedAt − createdAt| < 2 min — spec 3.1 intent (real finishes) over literal backfill — cost if wrong: those titles absent from year stats until rewatched/edited.
- Final review (deploy safety): no blockers. Important: rollback to main crash-loops (needs restore into emptied schema); README restore fails across schema versions; no backup service before first deploy (manual dump first); backup dir must pre-exist with uid 1000. Must-do checklist recorded in that report.
- Final fix wave dispatched (one subagent, all items in final-fixes.md), implementer a2fa773e342bb8abb, base 468014d.
- Ruling: list invites stay consent-free (small instance) but member userIds no longer sent to client.
- Final fix wave done: 33eb9fb, 473dfa3, f866456, 273100a, a2b5db4 (986 tests). Scoped re-review next.
- Deploy blocked on Tailscale being off on the Mac (pi-deploy skill: never start it myself) — asked the owner to run open -a Tailscale. Fix-wave re-review a089ecc9beb731678 running.
- Fix-wave re-review: all 20 ADDRESSED; 3 new Important (client steamAppId on shared rows; import throttles break large imports; per-username login lockout). Ruling: one targeted follow-up round despite 'no second fix wave' — owner's 'make no mistakes' instruction outranks the skill's process rule — cost: time.
- Follow-up re-review: steamAppId, import throttles, register ADDRESSED; login cap still lets one IP lock owner out (global cap charged on refused attempts). Ruling: remove global per-username cap; atomic peek-then-take; Stop honoured during retry wait. Sent.
- Login fix fd36086 verified by controller (diff read: global cap removed, takeAllRates peek-then-take). Controller ran on HEAD fd36086: npm test 1004/1004, tsc OK, lint clean, build OK, smoke login + 65 routes OK.
- CODE READY TO SHIP. Blocked: Tailscale off on Mac.
- Tailscale back. Discovery: Pi already has a nightly cron (~/bin/backup-dbs.sh 04:17) dumping every postgres container into ~/backups/<db>/ with 14-day find -delete. Ruling: compose backup service becomes opt-in (profile "backup"); app reads the existing folder (status.json or newest *.dump) — avoids the cron exec-ing into our backup container and deleting weekly copies — cost if wrong: none (owner's backups already exist). Fix agent ad025df21b8aad024 dispatched.
- Rehearsal on a fresh prod dump (3 users, 39 activities) locally: SQL files ok, db push in sync (2nd push no-op), migrations 003/010/014 ok; diary backfill 4 entries (11 added-as-done rows skipped); activity count unchanged.
