# Bugs: ranking, organising and insights

Scope: tier list, Up next, Arena (section + year), franchises, section filters/sort, views, tags,
lists (custom, reference, `/s/<token>`), dashboard tiles, Tonight, calendar/releases, diary listing,
stats (overview, goals, taste, people, year review, compare periods), anime season.

Method: read every code path end to end plus its tests. Two findings (1, 6) were reproduced with a
scratch `tsx` script against the real pure functions (output quoted below). Nothing in the repo was
changed.

Summary: **0 critical, 3 important, 4 minor.**

---

## 1. A tier save from an out-of-date tab undoes every tier change made elsewhere since it loaded (important, high)

**Where:** `src/components/tier-board.tsx:155` (sends the whole board and the whole tray on every
change), `src/lib/tiers.ts:114-140` (`planTierSave`), `src/lib/actions/ranking.ts:62-94`. Season
tiers use the same board and planner: `src/lib/actions/seasons.ts:222-232`.

**Input/state:** desktop tab on `/movies/arena` loaded yesterday: `x` in S, `z` in the Unranked
tray. On the phone today the user places `z` in A and moves `x` to B. Back on desktop (the app router
does not refetch on focus), the user nudges any title in any tier, for example the ↑ on `y` in S.

**Wrong outcome:** the server moves `x` back to S **and** clears `z` out of A into the tray. All of
the phone's work is reverted without a message. After the response revalidates, the desktop shows
the reverted board as if nothing had happened. Reproduced with the real planner:

```
current DB: x=B@1000, y=S@1000, z=A@1000
planTierSave({S:['y','x'],…}, trayIds=['z'], current)
→ {"placed":[{"id":"x","tier":"S","rankOrder":2000}],"clearIds":["z"]}
```

**Why:** `persist()` sends `boardPlacement(next)` (every tier, as the stale tab sees it) and
`next.tray.map(id)` (every tray id), not just the moved item. `planTierSave` rewrites the tier of
every id in the placement and clears every tray id that is tiered in the DB. The header comment
promises that a stale tab "never clears items it does not know about". That holds only for ids the
tab has never seen. Ids it shows out of date are overwritten. The owner uses a phone and a desktop,
so this is the normal case. It also affects season tier lists.

**Test:** in `tiers.test.ts`, use `current = {x:B, z:A}` with placement `S:[x]` and `trayIds:[z]`,
where the client only moved `y`. Expect `x` and `z` to stay where they are. Today `x` comes back
re-tiered and `z` is cleared. (The fix needs the client to send only what changed, for example
`{id, from, to, index}`, or an expected-state check.)

---

## 2. Putting one title into a franchise by hand pulls its whole auto-group (or the target group) along with it (important, high)

**Where:** `src/lib/franchise/sync.ts:90-100` (locked nodes still link through their provider key
and title), `:114-121` and `:138-140` (`lockedChoice` wins, then every unlocked member is moved).
This runs after every add (`autoGroupAfterAdd`) and every Detect step.

**Input/state:** AniList puts Fate/Zero, Fate/stay night and Fate/Apocrypha in one auto franchise
"Fate" (same `franchiseKey anilist:N`, unlocked). The user wants Apocrypha on its own: title page →
Franchise → "New" (`assignFranchise(id,'new')`). That creates "Fate/Apocrypha" and locks Apocrypha
into it. Then the user adds any title.

**Wrong outcome:** `syncUserFranchises` moves Fate/Zero and Fate/stay night into
"Fate/Apocrypha". The old "Fate" franchise is left empty, with its score, notes and ranking
orphaned. The reverse also happens: moving one title T from group A into an existing group B
unions A and B through T. Whichever franchise the locked members point to (the mode) then absorbs
every unlocked member of the other. FEATURES §11 says grouping "never moves a title you placed by
hand". The hand-placed title stays put, but it drags dozens of titles the user did not touch.

**Why:** nodes with `franchiseLocked && franchiseId` are still linked by `k:`, `n:` and `f:` tokens,
so they join the provider component they were taken out of. `pickOrCreateFranchise` then prefers
the locked member's franchise, and `toMove` moves every unlocked member there. A locked node should
anchor only itself: skip its `k:`/`n:` links, or exclude locked nodes from union-find and from
`lockedChoice`.

**Test:** `syncUserFranchises` against a test DB (none exists for sync today). A1 and A2 are in F
(key k, unlocked). T has key k and is locked into N. After sync, expect A1 and A2 in F. Today they
are in N.

---

## 3. The section Arena doesn't guard its server actions: a network blip or a tunnel 502 crashes the page or fakes a recorded duel (important, high)

**Where:** `src/components/arena.tsx:73`, `:111-124`, `:127-131`. These are the only Arena calls
that don't go through `settle()`. Season tiers wrap the same calls in try/catch
(`season-tiers.tsx:72-90`). The same pattern is in `src/components/year-arena.tsx:51` (Shuffle) and
`src/components/stats/year-share.tsx:131-134` (AI verdict).

**Input/state and wrong outcome:**
- **Challenge tiers:** tap a card while the container restarts. Next 14 resolves the action with
  `undefined` on a non-RSC 502/524, as `action-result.ts` notes. `out.history` then throws a
  TypeError inside the transition.
- **Network failure** (phone loses signal) in either mode, on Shuffle, or on "Accept" →
  `nextChallenge`: the action rejects.

  In both cases the vendored React canary (`18.3.0-canary-…-20241218`) rethrows a failed transition
  into render, via `react-dom.development.js:12752-12766` (`chainThenableValue`). The app has no
  `error.tsx`, so the whole page becomes Next's "Application error: a client-side exception has
  occurred".
- **Order tiers on a 502:** `setMatchup(undefined)` shows "No duels available yet" and the toast
  still says "X wins the round", although nothing was saved. The same false toast and empty state
  appear when `submitMatchup` returns `null` because `recordDuel` refused, for example when a title
  was removed in another tab.

**Why:** these calls are plain `await action()` without `settle`/try-catch, unlike every other
caller in this area.

**Test:** a component test (jsdom) that mocks `submitChallenge` to resolve `undefined`. Clicking a
DuelCard should show an error toast and keep the matchup. Today it throws. Also, `submitMatchup`
resolving `undefined` should not fire `toast.success`.

---

## 4. "Your hoard" average rating is the mean of section means, not the mean of your scores (minor, high)

**Where:** `src/components/dashboard/tiles.tsx:145-149` (OverviewCard).

**Input/state:** 100 rated movies averaging 8.0 and one rated album scored 2.0.

**Wrong outcome:** the tile shows **5.0**. The real average over the 101 scores is 7.9. Each
section counts equally however many titles it has, and the inputs are means already rounded to one
decimal.

**Why:** `rated.reduce((sum, s) => sum + s.avgRating) / rated.length` over `CategoryStat` rows. The
per-section rated counts it would need are not carried.

**Test:** render OverviewCard with stats `[{avgRating: 8, …, ratedCount 100}, {avgRating: 2,
ratedCount 1}]`, or test the helper once extracted. Expect 7.9; today it is 5.0. Fix: carry
`ratedCount` and the rating sum in `sectionStat`.

---

## 5. "Now consuming" undercounts: the "+N" is capped at 7, and hidden sections are filtered after the DB limit (minor, high)

**Where:** `src/lib/data.ts:426-435` (`getNowConsuming(limit = 12)` uses `take: 12`), with
`src/app/(app)/dashboard/page.tsx:33,57` (filters hidden sections after the fetch) and
`src/components/dashboard/tiles.tsx:197-198` (`extra = items.length - 5`).

**Input/state:** (a) 20 titles in progress, so the tile shows 5 covers and "+7", not "+15".
(b) Music hidden in Settings and the 12 most recently touched in-progress titles are albums (common
with Last.fm listening): the tile shows "Nothing in progress" although books and TV are in
progress.

**Why:** the limit is applied in the query before the hidden-section filter, and the "+N" is
computed from the capped list.

**Test:** a dashboard data test with 20 CONSUMING rows (or 12 in a hidden section plus 3 visible)
that expects "+15" (or 3 covers). Fix: pass `hiddenSections` into the query, and take a real count
for the "+N".

---

## 6. Taste profile names the wrong "lowest" genre once more than 20 genres qualify (minor, high)

**Where:** `src/lib/stats/profile.ts:110-114` (`genreScores` sorted best first, then
`.slice(0, MAX_GENRE_SCORES = 20)`), `:224-225` (`worst = genreScores[last]`). The sentence also
feeds `tastePromptLines`, so the AI prompts get it too.

**Input/state:** a library across seven sections easily has more than 20 genres with 3 or more
rated titles (TMDB, IGDB and AniList genres plus OpenLibrary subjects). Reproduced with 22 genres
scored 10.0, 9.6, … 1.6:

```
Your best-rated genre is G0 (10.0); your lowest is G19 (2.4).   // real lowest: G21 (1.6)
```

**Why:** the list is cut to the top 20 before the lowest is picked, so the lowest becomes the 20th
best.

**Test:** in `profile.test.ts`, build 22 genres with 3 rated titles each at falling scores and
expect the sentence to name the lowest of all 22.

---

## 7. Franchise ranking: a save from a stale tab un-ranks franchises ranked elsewhere (minor, high)

**Where:** `src/lib/actions/franchise.ts:277-294` (`updateMany … id notIn ids → rankOrder:
null`), and `src/components/franchises-client.tsx:60-68`, which sends only its local `ranked` list.

**Input/state:** desktop `/franchises` Ranking tab shows [F1, F2]. On the phone the user adds F3 to
the ranking. On desktop they swap F1 and F2.

**Wrong outcome:** F3 silently drops out of the ranking (`rankOrder` null). This is the same class
as finding 1, but here custom lists (`isPermutation`) and Up next (missing ids keep their
positions) are both protected and this one is not.

**Test:** call `saveFranchiseRanking([F2, F1])` while F3 has `rankOrder` 3000. Expect F3 to stay
ranked (after F1 and F2). Today it is null. Fix: give "remove from ranking" its own action, and keep
ids missing from the list.

---

### Checked and found sound (no finding)

- **Up next:** stale-tab safety and the Not-out-yet merge (`mergeAvailableOrder`); appending at the
  bottom on PLANNED.
- **Arena:** neighbour pairing and the in-tier swap. Challenge history validation;
  `promoteFromChallenge` re-checks against the stored board.
- **Year arena:** P2002 retry.
- **Section filters:** queue order inside status grouping, tag AND (case-insensitive),
  ownership.
- **Saved views:** validation and bound swapping.
- **Shares:** public tier, list and year shares expose only titles and covers; revoked or deleted
  lists 404.
- **Custom list reorder:** permutation guard.
- **Stats maths:** goals, streaks (15-minute buckets, DST-safe day numbers), compare-period presets
  (month clamping), year summary, drop points (median), people.
- **Calendar:** grid, window and iCal all-day DTEND. `/calendar`, the dashboard's Coming up and
  Tonight's queues all read "today" in the user's time zone.
- **Anime season:** paging.
