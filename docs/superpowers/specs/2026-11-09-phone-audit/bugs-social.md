# Bug review: people, settings and the server

Reviewer area: friends features (Compare, Watch together, Feed, Recommendations), settings and prefs,
layouts and navigation, auth, sessions, rate limits, notifications and pushes, the job scheduler and
jobs, backups status, the full export, and the public API. Read-only review on 2026-11-09.

**Result: 3 findings, all minor (0 critical, 0 important).** This area is in good shape. The gates,
locks, dedupe keys and allow-lists hold up when you trace them end to end. The three below are
real, but each needs an unusual sequence of events.

| # | Severity | Confidence | One line |
|---|---|---|---|
| 1 | minor | high | A Settings → Notifications tab left open puts back an old ntfy/Discord URL (or old kinds) when a single kind is toggled |
| 2 | minor | high | After downtime, the catch-up tick runs `recommendations` before `anilist-sync`, so verdicts from that night's AniList pull are held back a day |
| 3 | minor (design gap) | high | The recipient can see the sender's score for a recommended title on Compare (and Feed) before any verdict, though Recommendations hides it |

---

## 1. A stale Notifications tab writes back old push URLs (or old kinds)

- **Where:** `src/components/settings-notifications.tsx:60-62` and `:81-82` (`persist(saved, next)`),
  `src/lib/prefs.ts:78-82` (`NotifyPatchSchema` is a full object, not partial),
  `src/lib/prefs.ts:231-234` (`applyPrefsPatch` merges only the top level, so `notify` is replaced as a whole).
- **Input → wrong outcome:** Settings → Notifications is open on the desktop with ntfy URL **A**.
  On the phone, Tim changes the ntfy URL to **B** and saves. Later he goes back to the desktop tab,
  which was never reloaded, and taps the "New seasons" chip to switch that kind off. `toggleKind`
  calls `persist(saved, next)`, where `saved` is the tab's own copy `{ntfyUrl: A, discordWebhook, …}`. The server
  stores `notify = {ntfyUrl: A, discordWebhook: <old>, kinds: next}`, so **every later push goes back to
  topic A**. Nothing on either device shows this. The reverse also happens: pressing Save for a URL on a
  stale tab puts back that tab's old `kinds`.
- **Why:** `changePrefs` locks the row so two saves can't overwrite each other. But the patch
  granularity defeats the lock: the client must send the whole `notify` object, built from state that
  can be hours old, and the server replaces the stored object with it. ntfy.sh topics are readable by
  anyone who knows the name. If someone changed topic because the old one was exposed, a stale tab
  quietly sends titles and friends' names to it again.
- **Same pattern, lower stakes:** `src/components/settings-form.tsx:92-97` sends the whole
  `hiddenSections` array from a possibly stale tab. Hide Books on the phone, then hide Manga on an old
  desktop tab, and Books comes back.
- **Test to prove it:** a unit test on the patch path: store `notify = {ntfyUrl: 'B', …, kinds: []}`,
  apply `updatePrefs({ notify: { kinds: ['releases'] } })`, which today fails `NotifyPatchSchema`, and
  expect `ntfyUrl` to stay `'B'`. Alternatively, a component test that renders `SettingsNotifications`
  with `ntfyUrl: 'A'`, clicks a kind chip, and asserts that the `updatePrefs` payload has no `ntfyUrl`
  or `discordWebhook`. (Fix idea: make `NotifyPatchSchema` partial, merge `notify` field by field in
  `applyPrefsPatch`, and have `toggleKind` send only `kinds`.)

## 2. Catch-up after downtime runs `recommendations` before `anilist-sync`

- **Where:** `src/lib/jobs/index.ts:56-69` (registration order: `recommendations` is registered before
  `anilist-sync`), `src/lib/jobs/scheduler.ts:129-131` (`tick` runs `dueJobs` in registry order), and
  `src/lib/jobs/schedule.ts:136-143`.
- **Input → wrong outcome:** The Pi is down overnight, for example a power cut from 03:00 to 07:10
  Berlin. On the first tick, `dueJobs` returns `[metadata, new-seasons, releases, steam, lastfm,
  recommendations, anilist-sync, airing]`. I reproduced this with the real `dueJobs` and `JOB_TIMES` via
  `tsx`. The verdict sweep therefore runs before that night's AniList pull. Scores the pull brings in
  (in Hoard, imports and syncs are how scores arrive without `settleRecommendations` running) get no
  verdict notification and no PENDING→ADDED promotion until the next night's 05:50 run, a day late.
  `src/lib/jobs/times.ts:12` says recommendations must run "After anilist-sync, so the night's pulled
  scores are included". The schedule keeps that order only when the jobs run at their own times.
- **Why:** catch-up order is `Map` insertion order, not `JOB_TIMES` order. The only ordering the
  current registration gets right is `releases` before `airing`, and that is by luck of the order.
- **Test to prove it:** in `schedule.test.ts`, or a new scheduler test, build the job list from
  `registeredJobs()`, set every last run to yesterday 09:30, call `dueJobs` at 07:10, and expect
  `anilist-sync` before `recommendations` and `releases` before `airing`. (Fix idea: sort the due
  jobs by their time of day before running them, or register them in `JOB_TIMES` order.)

## 3. Compare (and Feed) show the sender's score before the verdict

- **Where:** `src/lib/data-compare.ts:163-186` (the other user's `rating` for every shared title, any
  status) and `src/app/(app)/compare/[username]/page.tsx:139-163`. Compare with
  `src/lib/data-recommendations.ts:157-160`, whose header says "a sender's library isn't read at all
  for a recipient until a verdict exists".
- **Input → wrong outcome:** Tim (score 9.0) sends "Paprika" to demo2 with a guess. demo2 taps **Add**,
  so the title is PLANNED with no score. demo2 opens `/compare/tim`: "Titles you both have" lists
  Paprika with Tim's **9.0** before demo2 has watched or scored it. If Tim finished it in the last 30 days
  with the feed on, `/feed` also shows "tim watched Paprika · 9.0". The Recommendations page carefully
  hides the sender's score until the verdict, but these two pages give it away.
- **Why:** The design spec (`docs/superpowers/specs/2026-11-05-friends-interactions-design.md`,
  "Sealed scores") puts the seal helper for Compare and Feed in Stage 2. Stage 1 shipped without it, so
  the rule as stated for this review ("nothing private, such as scores before a verdict, leaks") does
  not hold yet. Tim should decide whether this waits for Stage 2 or needs an interim fix. One option:
  hide `theirRating` on Compare for titles that have an open recommendation from them.
- **Test to prove it:** a `compareLibraries` test with a mocked prisma. User B has a PENDING
  recommendation from A for title X, B holds X as PLANNED and unscored, and A scored X 9.0. Expect
  B's view of A to show `theirRating: null` for X. Today it is 9.0.

---

## Checked and found sound

These paths were traced end to end with no concrete bug found:

- **Opt-in gates:** `canCompare` is re-checked on every read and action in `data-compare`,
  `data-together`, `actions/together`, `data-recommendations` and `actions/recommendations`. Opted-out,
  unknown and own usernames all get the same answer. Feed re-filters by `allowed` and checks
  `a.userId === e.userId`. Feed uses its own `feedOptIn` by design (spec: "feedOptIn stays separate").
- **Guesses and notes:** the guess reaches the recipient only through `visibleGuess` inside a
  verdict. It is left out of the received rows in the full export (`export-full.ts:127`).
  Notification text carries only a name and a title.
- **Auth:** the safe `next` path (open-redirect checks, including dot-segment collapse); login and
  register rate limits, where a refused attempt charges no budget; `HOARD_SIGNUP_CLOSED` checked in both
  the page and the action; `redirect()` kept out of the try blocks and `publicError` rethrowing
  `NEXT_REDIRECT`; session expiry check; logout clears title drafts.
- **API:** Bearer only, token hash lookup, IP failure brake checked before any lookup, per-token limit,
  every query scoped to the token owner, explicit field allow-list in `api-shape.ts`, stable
  `(createdAt, id)` cursor, `400` for a bad cursor.
- **Notifications:** the `(userId, dedupeKey)` unique index plus P2002 handling. The verdict is
  claimed with `updateMany` on `verdictNotifiedAt: null` and given back if the notification couldn't be
  saved. Backup warnings go only to the owner. Push targets are re-checked by `isAllowedPushUrl`, with
  `allowed_mentions: []` on Discord.
- **Scheduler:** advisory lock held by the transaction, the in-process `running` set, seeding on first
  sighting, one catch-up run per missed slot. DST checked for 03:30–06:30 in Europe/Berlin: on both
  change days every slot resolves to a single instant. `airing` correctly runs after `releases`, as
  `times.ts` intends.
- **Export:** every user-owned model is present. No password hashes, sessions, token hashes, OAuth
  tokens or share ids. Other people appear only by username. Settings are reduced to
  `exportablePrefs` (no push URLs, no calendar token).
- **Prefs:** writes lock the row (`changePrefs`). Reads are lenient per field, writes strict. The
  instant layout switch (`display-overlay`, `save-batch`) handles superseded saves and rollback.

## Considered but dropped (couldn't make concrete)

- `data-feed.ts:39`: `{ meta: { path: ['undo'], equals: Prisma.AnyNull } }` has to match events whose
  `meta` object has no `undo` key, such as `{via:'suggestions'}` from "Accept all suggestions". If
  Prisma 5.22 maps AnyNull on a path to `= 'null'::jsonb` only, those S-tier placements never appear in
  the Feed. Status drops have `meta` NULL and are unaffected. I couldn't check the generated SQL without
  a database. **Worth one integration check:** run the Feed query against a seeded event with
  `meta = {"via":"suggestions"}`.
- The notifications sheet shows only the newest 15 (`BELL_LIMIT`). With more than 15 unread, the older
  ones can only be cleared with "Mark all read", never read. This is a design limit, not a defect.
