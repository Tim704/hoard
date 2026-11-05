# Hoard: things two friends can do together (design)

Status: approved by Tim, 5 Nov 2026. The build plan is written from it, one stage at a time.

## Context and why

Hoard's user features today (Compare, Watch together, Feed, shared custom lists) let you
*look at* someone else's data. Apart from editing a shared list, nobody can do anything *to
or with* another person. Tim wants that to change, for a very small group: "just me and my
friend". The moment he cares about most is passing things along ("you have to watch this"),
then talking about what you've both seen, then doing things together.

He explicitly does not want the "followers / social media part". This is two people, not a
network.

## Goals

- Eleven features in three stages, each stage shipped to the Pi and usable on its own.
- Interactions end in a payoff that feeds the ranking: a score, a verdict, a comparison.
- Works for two people with no setup beyond one Settings switch.

## Non-goals

No friend requests, followers or public profiles. No direct messages. No real-time or
WebSockets (normal requests and notifications only). No spoiler handling on comments. No
badges or streaks. No AI in these features for now. Daily duels, Settle it and Our tier list
(the "ranking against each other" group) were not picked and stay out.

## Anti-goals (a failure even if it works)

- A friend's action changing your scores, tiers, queue or Arena standing. The only things
  that add to your library without an add click are accepting a trade or a shared run, and
  the accept screen says so.
- Your private notes ever being visible to someone else.
- Anything still showing after someone turns the switch off (see "Copy nothing"). The one
  exception is notifications already delivered, which can't be recalled from ntfy or Discord
  anyway, so they carry only a name and a title (see "Notifications").
- Interaction features that make the app feel busier for someone who hasn't opted in: they
  see no new navigation or panels.

## Approaches considered

1. **Dedicated tables per feature, scores read live. Chosen by Tim.** Matches the schema's
   stated design (first-class tables, no catch-all) and Feed's rule of copying nothing.
   Stats such as "average score of my picks" stay simple queries. Costs the most code.
2. One general "social item" table with a type and JSON. Fewer schema changes, but no
   database checks, awkward stats, and it goes against the schema's design note.
3. Stretch what exists (shared lists, Notifications, Watch together). Fastest rough version,
   but guesses, verdicts and the record have nowhere to live, so most of it gets rewritten.

## Rules that apply to every feature

**The switch.** *(Claude's call.)* Everything is gated on the existing `compareOptIn`, on both
sides, re-checked on every read and write with `canCompare` (`src/lib/together.ts`). No new
switch. The Settings wording in `src/components/settings-social.tsx` changes to say what it now
covers. `feedOptIn` stays separate and still only controls the Feed. The friend picker is
`comparableUsernames` (`src/lib/data-together.ts`); with one other user it preselects them.

**Copy nothing.** Scores, tiers and statuses are always read live from the owner's
`UserMediaActivity`. Feature tables hold only what the interaction itself created (a note, a
guess, a comment). Turning the switch off hides your data from the other person at once; your
rows stay and return if you turn it back on.

**Unavailable users.** A missing or opted-out person gets the same answer as an unknown one,
as Compare does today, so names can't be probed. Items involving them are hidden rather than
deleted.

**Sealed scores.** A single pure helper decides this and every surface calls it: if the viewer
has this title in their library with no score, the other person's score, tier and review are
hidden behind a Reveal button. Titles the viewer doesn't have are visible, because that's how
you discover things. Reveal lasts for that view only; once you score the title it's open for
good. *(Claude's call: a `sealScores` pref, default on, lets someone turn this off.)* Surfaces:
Their take, Compare's shared list, Feed entries, and Us in 2026. Compare's disagreements and
compatibility only use titles both have scored, so they're unaffected.

Two things interact with the seal. *(Claude's calls.)*
- **A verdict overrides it.** A recommendation's verdict screen always shows both scores, even
  if the viewer hasn't scored the title, because the verdict is the reveal. Stage 1 therefore
  doesn't need the helper, which arrives in Stage 2.
- **An open trade holds a score everywhere.** The helper takes "this title is in an open trade"
  as an input from Stage 3, so a trade pick's score stays hidden on every surface until the
  trade reveals, not only on the trade screen. Otherwise Feed or Compare would give it away.

**What "scored" means.** The title-level `rating` only. *(Claude's call.)* TV season scores
don't count, since `src/lib/actions/seasons.ts` doesn't roll them up to the show. A finished show
with only season scores reads "finished, not scored yet" and has no verdict until it's scored.

**Titles.** Recommendations, trades and runs point at the catalogue by section slug and media
row id, like `CustomListItem`. Manual entries (`isManualId`) can't be sent, since they belong
to their maker; Compare already applies this rule. Titles display per the viewer's own
`displayTitle` preference, and wording follows the medium (`src/lib/status.ts`).

**Notifications.** Everything goes through `notify()` (`src/lib/notify.ts`) under one new kind,
`friends`, added to `NOTIFY_KINDS` and the labels in `settings-notifications.tsx`, using
`dedupeKey` so nothing sends twice. Reactions send no notification, to avoid push noise.
Notification text carries only the person's name and the title, never a score, guess, note or
comment text ("Sam's verdict on Paprika is in"); you open the page to see the rest. Stored
notifications aren't recalled if someone later turns the switch off. *(Claude's calls: this keeps
spoilers and private text off ntfy and Discord, and avoids changing the shared notification code.)*

**Other existing conventions.** Server actions use `requireUser`, `publicError`, and a rate
limit in `ACTION_LIMITS`. New pages join the Friends navigation gated by `social` in
`src/app/(app)/layout.tsx`, and must work in all four layouts and at 375px wide. Everything you
own goes in the full JSON export (`src/lib/export-full.ts`). Deleting a user cascades.

## Stage 1: Recommendations

**Sending.** "Send to a friend" in the title view (`title-popup.tsx` and `title-page.tsx`),
with an optional note (up to 500 characters) and an optional hidden guess at their score. In
this version you can only send titles from your own library.

**Arriving.** A notification, plus a "Recommended to you" inbox on a new `/recommendations`
page. Each item shows the cover, who sent it and the note, and offers Add (the existing
`AddResultRow` from `src/components/add-row.tsx`) or Pass. The title view then shows
"Recommended by X" with the note.

**Edge cases.** *(Claude's calls.)*
- They've already scored it: sending is refused, with a pointer to Their take.
- It's in their library unscored: it arrives as normal, and shows "Already on your list"
  instead of Add.
- One recommendation per sender, recipient and title. A passed title can't be re-sent.
- The sender can withdraw it while nothing has happened yet.
- You can send any title in your library, scored or not, so "we should both see this" works. A
  pick the sender hasn't scored simply leaves that comparison out. Averages and best and worst
  pick use the recipient's score, so they aren't affected.

**The verdict.** A recommendation has a verdict once the recipient has scored or dropped the
title. Both people then see their score, the guess, and the sender's own score. The display is
read live, so a later re-score updates it, but the notification fires once
(`rec-verdict:<id>`). The guess stays hidden from the recipient until then. Because several
paths can write scores and statuses (`updateActivity`, imports, nightly sync, others listed in
the plan), the builder calls a `settleRecommendations` helper after commit from the common user
paths and adds a nightly job through the existing scheduler to catch the rest.

**The record.** On `/recommendations`, for each direction: picks sent, added, finished and
passed, average score, average guess miss, and best and worst pick.

**New table.** `Recommendation`: from, to, section, media id, note, guess, response (pending,
added, passed), timestamps, verdict-notified time, and an optional trade link (stage 3).

**Sign-up.** Tim accepted a small setting that closes sign-up (for example
`HOARD_SIGNUP_CLOSED=1`), checked in `registerAction` with the register page showing a closed
message. It ships off, and Tim sets it once his friend has an account.

## Stage 2: Talking about titles

**Their take.** A panel in the title view showing the other person's status, score, tier and
latest diary review for that title, sealed as above. This shares more than the switch does
today (status and reviews were not visible before), so the new Settings wording must say so.
Notes stay private.

**Sealing Compare and Feed.** Apply the helper. A Feed "put in S tier" entry on a sealed title
says they ranked it without naming the tier.

**Reactions and comments.** Both attach to a `DiaryEntry`, meaning a specific finish or review.
- Reactions: one per person per entry, from a fixed set of five emoji.
- Comments: plain text up to 1000 characters. Authors can delete their own, and the entry's
  owner can delete any on their entry. No threads and no editing.
- Shown under finish entries in the Feed, in Their take, and on the owner's `/diary`.
- A new comment notifies the entry's owner, and also the other commenter.
- *(Claude's call.)* If an entry is deleted, for instance by undoing a finish, its comments and
  reactions go with it. Feed drops and S-tier placements have no diary entry, so they can't be
  commented on.

**New tables.** `Reaction` and `Comment`, cascading from `DiaryEntry`.

## Stage 3: Doing it together

Build in this order. **Us in 2026 comes first so it's live before the year ends.**

**Us in 2026** (`/compare/<username>/year/<year>`). A joint year page for any year you both have
diary entries: titles you both finished, your biggest splits, new S-tier titles each, each
person's best and worst recommendation, who guesses closer, and counts of trades and runs. Reuse
`yearBounds` and the year loaders in `src/lib/data-year.ts`. Non-goals: AI verdict, PNG, public
share link. Trades and runs appear once they exist.

**Title trades.** One person proposes their pick for the other, with a note, guess and deadline.
The other accepts by choosing a pick in return, or declines. Accepting puts both titles on the
two people's Up next. Proposing counts as agreeing to whatever comes back, and the proposal
screen says so; there's no second approval step. *(Claude's call.)* A pick the person already has
stays exactly where it is, with no status or queue change; one they've already scored can't be
picked, as with recommendations. Each pick is a `Recommendation` linked to a `Trade` row. Verdicts
stay hidden on every surface until both are in or the deadline passes, then are revealed together. A daily job sends
a reminder three days before the deadline and marks missed trades, which show on the record with
no other penalty.

**Tonight's pick** (upgrades `/together`). Either person starts a round, choosing a section and
optionally the time available (`estimateMinutes` in `src/lib/tonight.ts`). The deck is your
overlapping planned titles (`rankOverlap`), up to `TOGETHER_LIMIT`, and each person swipes whenever
they like (touch, buttons, arrow keys). Swipes stay private. The first title you've both said yes
to is the match, which notifies both and ends the round. With no match, it offers your top combined
queue title. Rounds expire after 48 hours, with one open round per pair. The current ranked overlap
list stays below. New tables: `PickRound`, `PickSwipe`.

**Shared runs.** Pick one title together, with an optional target date. Accepting adds it to the
other person's library, unless they already have it, in which case its status and queue stay as they
are. TV runs cover a whole show, not one season. *(Claude's call.)* A `/together/runs` page and a title
view panel show progress side by side, read live from the title's `progress`, which already includes
season episodes. Sections with no progress counter
(films, for example) show status only. A "pace" line appears if there's a target date. Finishing
notifies the other person; when both finish, both scores are shown side by side. Runs can be
abandoned by either person. New table: `SharedRun`.

**Rewatches count (Tim's decision).** Someone who has already finished the title can join by starting
a repeat run through Hoard's existing Watch again (`rewatching`, `src/lib/diary.ts`), which shows you
showing a friend a favourite. Their fresh progress and new finish are what the run tracks. Each person's
finish in a run is a diary entry dated on or after the day they joined, so an old finish never counts.
The run stores only that date, in keeping with "copy nothing"; the scores stay in their libraries. The
seal still applies, so the friend watching for the first time can't see the rewatcher's old score until
they've scored it themselves.

## Left to the builder

Exact schema details and indexes; page layouts and component splits; the emoji set; Tonight's pick
touch details; the full list of score-writing paths for `settleRecommendations`; copy, following
the plain style of `FEATURES.md`.

## Verification (each stage)

- `npm test` with new Vitest suites for pure logic: the sealing helper, verdict and record maths,
  trade state changes, swipe matching, and pace.
- `npm run typecheck`.
- Add new routes to `e2e/routes.json` and two-user flows to `e2e/smoke.mjs`, using seeded `demo` and
  `demo2` (extend `prisma/seed.ts`). Stage 1's flow: `demo` sends with a guess, `demo2` adds and scores
  it, `demo` sees the verdict.
- Privacy tests: with either person's switch off, each new read and action returns the "unavailable"
  answer and leaks nothing; a sealed score doesn't reach the page.
- Check every new page in all four layouts at 375px.
- Update `FEATURES.md` section 19, `README.md` and `ROADMAP.md`.
- Deploy each stage with the `pi-deploy` skill, after a database backup. New tables are additive and
  applied by `prisma db push` at container start.
