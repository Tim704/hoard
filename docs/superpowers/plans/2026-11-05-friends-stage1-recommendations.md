# Friends Stage 1: Recommendations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One person sends another a title with a note and a hidden guess; it lands in an inbox, and when the recipient scores or drops it, both see the verdict and a running record.

**Architecture:** A new `Recommendation` table holds only what the interaction created (note, guess, response). Scores and statuses are read live from each person's `UserMediaActivity`. Pure rules live in `src/lib/recommendations.ts`, reads in `src/lib/data-recommendations.ts`, settling and notifying in `src/lib/recommendations-server.ts`, and client-callable writes in `src/lib/actions/recommendations.ts`.

**Tech Stack:** Next.js 14 App Router, Prisma + Postgres (`prisma db push`), Vitest (fake prisma via `vi.mock`, as in `src/lib/data-activity.test.ts`), playwright-core smoke test.

**Spec:** `docs/superpowers/specs/2026-11-05-friends-interactions-design.md` (read "Rules that apply to every feature" and "Stage 1").

## Global Constraints

- Every read and write involving another person re-checks `compareOptIn` on both sides with `canCompare` (`src/lib/together.ts`). An unknown user and an opted-out user get the identical answer.
- Copy nothing: never store a score, tier or status in `Recommendation`.
- The guess never reaches the recipient (page, action result or export) before a verdict exists.
- Notification title and body carry only a username and a title: never a score, guess or note. Kind is `friends`; the URL is `/recommendations`.
- A verdict exists once the recipient's title-level `rating` is set or their status is `DROPPED`. TV season scores don't count.
- Note: up to 500 characters. Guess: 0 to 10, via `normalizeRating` (`src/lib/rating.ts`).
- Manual entries (`isManualId`) can't be sent.
- Titles display via the viewer's `titleLanguage` (`displayTitle`), status wording via `statusLabel(status, slug)`.
- Pages work in all four layouts and at 375px wide with no sideways scrolling. Touch targets follow the existing buttons.
- There is no `typecheck` script in Hoard: use `npx tsc --noEmit`.
- Commit messages follow the repo's style (`feat:`, `fix:`, `docs:`) and end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

**Differences from the spec, both forced by build order:**
- The "already scored" refusal points to Compare, because Their take arrives in Stage 2.
- The optional trade link column is added in Stage 3's plan (`db push` makes it additive).

## Review Focus

1. **The recipient scores through import or the nightly AniList pull**, which don't call the settle helper: the sender still gets exactly one verdict notification, from the nightly job. Pinned in Task 4.
2. **The recipient scores, clears the score, then re-scores:** the verdict disappears and returns with the new score, and no second notification goes out. Pinned in Task 3.
3. **Either person turns the switch off between send and verdict:** the recommendation is hidden from both, no notification goes out, and it's delivered when the switch comes back on. Pinned in Tasks 3 and 4.
4. **Either person removes the title from their library:** nothing crashes. The sender's own score is left out; a recipient who removes it has no verdict, and the sender sees "Removed from their library". Pinned in Tasks 1 and 3.
5. **Double-clicking Send, or two tabs sending at once:** the unique index turns the second into a friendly "Already sent", not a 500. Pinned in Task 3.

---

### Task 1: Table and pure rules

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `src/lib/recommendations.ts`
- Test: `src/lib/recommendations.test.ts`

**Interfaces:**
- Produces (from `@/lib/recommendations`, client-safe with no prisma import):
  - `NOTE_MAX = 500`
  - `type RecResponse = 'PENDING' | 'ADDED' | 'PASSED'`
  - `interface LibraryState { status: Status; rating: number | null }`
  - `type Verdict = { kind: 'scored'; score: number } | { kind: 'dropped'; score: number | null }`
  - `verdictOf(recipient: LibraryState | null): Verdict | null`
  - `parseRecommendInput(input: { note?: unknown; guess?: unknown }): { ok: true; note: string | null; guess: number | null } | { ok: false; error: string }`
  - `canWithdraw(response: RecResponse, recipient: LibraryState | null): boolean`
  - `visibleGuess(guess: number | null, verdict: Verdict | null): number | null`
  - `waitingLabel(response: RecResponse, recipient: LibraryState | null, slug: CategorySlug): string` (the sender's line before a verdict)
  - `interface RecordRow { id: string; response: RecResponse; guess: number | null; recipient: LibraryState | null; createdAt: Date }`
  - `interface RecommendationRecord { sent: number; added: number; finished: number; passed: number; averageScore: number | null; averageGuessMiss: number | null; bestId: string | null; worstId: string | null }`
  - `buildRecord(rows: RecordRow[]): RecommendationRecord`

- [ ] **Step 1: Add the model to `prisma/schema.prisma`**, after `CustomListMember`, with a header comment in the file's style:

```prisma
model Recommendation {
  id                String    @id @default(cuid())
  fromId            String
  toId              String
  category          String // section slug, like CustomListItem
  mediaId           String // row id in that section's media table
  note              String?
  guess             Float? // hidden from the recipient until a verdict exists
  response          String    @default("PENDING") // PENDING|ADDED|PASSED
  createdAt         DateTime  @default(now())
  respondedAt       DateTime?
  verdictNotifiedAt DateTime?

  from User @relation("RecommendationsSent", fields: [fromId], references: [id], onDelete: Cascade)
  to   User @relation("RecommendationsReceived", fields: [toId], references: [id], onDelete: Cascade)

  @@unique([fromId, toId, category, mediaId])
  @@index([toId, createdAt])
  @@index([toId, category, mediaId])
  @@index([verdictNotifiedAt])
}
```

Add to `User`: `recommendationsSent Recommendation[] @relation("RecommendationsSent")` and `recommendationsReceived Recommendation[] @relation("RecommendationsReceived")`. Run `npx prisma generate`.

- [ ] **Step 2: Write the failing tests**

```ts
describe('verdictOf', () => {
  it('needs a score or a drop', () => {
    expect(verdictOf(null)).toBeNull();
    expect(verdictOf({ status: 'PLANNED', rating: null })).toBeNull();
    expect(verdictOf({ status: 'COMPLETED', rating: null })).toBeNull(); // finished, not scored yet
    expect(verdictOf({ status: 'CONSUMING', rating: 6 })).toEqual({ kind: 'scored', score: 6 });
    expect(verdictOf({ status: 'DROPPED', rating: null })).toEqual({ kind: 'dropped', score: null });
    expect(verdictOf({ status: 'DROPPED', rating: 4 })).toEqual({ kind: 'dropped', score: 4 });
  });
});

describe('parseRecommendInput', () => {
  it('trims the note and turns blanks into null', () => {
    expect(parseRecommendInput({ note: '  ', guess: null })).toEqual({ ok: true, note: null, guess: null });
    expect(parseRecommendInput({ note: ' hi ', guess: 7.5 })).toEqual({ ok: true, note: 'hi', guess: 7.5 });
  });
  it('refuses a long note, a guess out of range, and non-numbers', () => {
    expect(parseRecommendInput({ note: 'x'.repeat(501) }).ok).toBe(false);
    expect(parseRecommendInput({ note: 'x'.repeat(500) }).ok).toBe(true);
    expect(parseRecommendInput({ guess: 10.5 }).ok).toBe(false);
    expect(parseRecommendInput({ guess: '7' }).ok).toBe(false);
  });
});

describe('canWithdraw', () => {
  it('only while nothing has happened', () => {
    expect(canWithdraw('PENDING', null)).toBe(true);
    expect(canWithdraw('PENDING', { status: 'PLANNED', rating: null })).toBe(true); // it was already on their list
    expect(canWithdraw('ADDED', { status: 'PLANNED', rating: null })).toBe(false);
    expect(canWithdraw('PASSED', null)).toBe(false);
    expect(canWithdraw('PENDING', { status: 'CONSUMING', rating: 5 })).toBe(false);
  });
});

describe('visibleGuess', () => {
  it('stays hidden until a verdict', () => {
    expect(visibleGuess(8, null)).toBeNull();
    expect(visibleGuess(8, { kind: 'dropped', score: null })).toBe(8);
  });
});

describe('waitingLabel', () => {
  it('describes where the pick stands', () => {
    expect(waitingLabel('PENDING', null, 'movies')).toBe('Not answered yet');
    expect(waitingLabel('PENDING', { status: 'CONSUMING', rating: null }, 'movies')).toBe(statusLabel('CONSUMING', 'movies'));
    expect(waitingLabel('PASSED', null, 'movies')).toBe('Passed');
    expect(waitingLabel('ADDED', null, 'movies')).toBe('Removed from their library');
    expect(waitingLabel('ADDED', { status: 'COMPLETED', rating: null }, 'movies')).toBe('Finished, not scored yet');
    expect(waitingLabel('ADDED', { status: 'PLANNED', rating: null }, 'movies')).toBe(statusLabel('PLANNED', 'movies'));
  });
});

describe('buildRecord', () => {
  const row = (id: string, response: RecResponse, guess: number | null, recipient: LibraryState | null) =>
    ({ id, response, guess, recipient, createdAt: new Date(`2026-11-0${id}`) });
  it('counts, averages and picks best and worst by the recipient score', () => {
    const r = buildRecord([
      row('1', 'ADDED', 8, { status: 'COMPLETED', rating: 9 }),
      row('2', 'ADDED', null, { status: 'DROPPED', rating: 3 }),
      row('3', 'ADDED', 5, { status: 'DROPPED', rating: null }),
      row('4', 'PASSED', 7, null),
      row('5', 'PENDING', 7, null),
    ]);
    expect(r).toEqual({ sent: 5, added: 3, finished: 1, passed: 1, averageScore: 6, averageGuessMiss: 1, bestId: '1', worstId: '2' });
  });
  it('is empty without verdicts', () => {
    expect(buildRecord([])).toEqual({ sent: 0, added: 0, finished: 0, passed: 0, averageScore: null, averageGuessMiss: null, bestId: null, worstId: null });
  });
  it('breaks score ties towards the newest pick', () => {
    const r = buildRecord([row('1', 'ADDED', null, { status: 'COMPLETED', rating: 7 }), row('2', 'ADDED', null, { status: 'COMPLETED', rating: 7 })]);
    expect(r.bestId).toBe('2');
    expect(r.worstId).toBe('2');
  });
});
```

`finished` counts recipients in `COMPLETED` or `RETIRED`. A guess counts towards the miss only when both the guess and a score exist.

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run src/lib/recommendations.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 4: Implement `src/lib/recommendations.ts`** with the signatures above. Use `normalizeRating`; `waitingLabel` falls back to `statusLabel`.

- [ ] **Step 5: Run to verify it passes**, then `npx tsc --noEmit`.

Expected: all PASS, no type errors.

- [ ] **Step 6: Commit** (`feat: Recommendation table and its pure rules`).

### Task 2: A setting that closes sign-up

**Files:**
- Modify: `src/lib/auth-rules.ts`, `src/lib/actions/auth.ts`, `src/app/register/page.tsx`, `docker-compose.yml`, `README.md` (Configuration table)
- Test: `src/lib/auth-rules.test.ts`

**Interfaces:**
- Produces: `signupClosed(env?: Record<string, string | undefined>): boolean` in `@/lib/auth-rules`, defaulting to `process.env`.

- [ ] **Step 1: Write the failing test**

```ts
describe('signupClosed', () => {
  it('is on only for HOARD_SIGNUP_CLOSED=1', () => {
    expect(signupClosed({})).toBe(false);
    expect(signupClosed({ HOARD_SIGNUP_CLOSED: '0' })).toBe(false);
    expect(signupClosed({ HOARD_SIGNUP_CLOSED: '1' })).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/auth-rules.test.ts`
Expected: FAIL, `signupClosed` isn't a function.

- [ ] **Step 3: Implement it.**
  - Add the function.
  - `registerAction` returns `{ error: 'Sign-up is closed on this Hoard.' }` first thing, before validation.
  - The register page replaces the form with that sentence and the sign-in link when closed. Keep its `getCurrentUser` redirect.
  - Add `HOARD_SIGNUP_CLOSED: ${HOARD_SIGNUP_CLOSED:-}` to the app's environment in `docker-compose.yml`, and a README table row.

- [ ] **Step 4: Run to verify it passes**, then `npx tsc --noEmit`.

- [ ] **Step 5: Commit** (`feat: HOARD_SIGNUP_CLOSED closes sign-up`).

### Task 3: Sending, reading and settling on the server

**Files:**
- Create: `src/lib/recommendations-server.ts`, `src/lib/data-recommendations.ts`, `src/lib/actions/recommendations.ts`
- Modify: `src/lib/prefs.ts` (`NOTIFY_KINDS` gains `friends`), `src/components/settings-notifications.tsx` (label `friends: 'From friends'`), `src/lib/rate-limit.ts` (`recommend: { perMinute: 10, perDay: 100, noun: 'recommendations' }` in `ACTION_LIMITS`)
- Test: `src/lib/recommendations-server.test.ts`, `src/lib/data-recommendations.test.ts`, `src/lib/actions/recommendations.test.ts`

**Interfaces:**
- Consumes: Task 1's rules; `notify`, `canCompare`, `comparableUsernames`, `parsePrefs`, `displayTitle`, `isManualId`, `takeActionRate`, `publicError`, `requireUser`.
- Produces:
  - `@/lib/recommendations-server` (not `'use server'`; trusts its arguments, like `src/lib/library/add.ts`):
    - `settleRecommendationsForTitle(userId: string, slug: CategorySlug, mediaId: string): Promise<void>`, which never throws
    - `settleRecommendationsForActivity(userId: string, activity: { category: string } & Partial<Record<FkField, string | null>>): Promise<void>`, which never throws
    - `settleAllRecommendations(): Promise<{ checked: number; notified: number }>`
  - `@/lib/data-recommendations`:
    - `interface RecView { id: string; other: string; note: string | null; response: RecResponse; createdAt: string; slug: CategorySlug; title: string; imageUrl: string | null; year: number | null; externalId: string; fields: Record<string, unknown>; myActivityId: string | null; verdict: { kind: Verdict['kind']; recipientScore: number | null; guess: number | null; senderScore: number | null } | null; waiting: string | null; withdrawable: boolean }`
    - `getRecommendationsPage(meId: string): Promise<{ ok: true; inbox: RecView[]; received: RecView[]; sent: RecView[]; mine: RecommendationRecord; theirs: RecommendationRecord; bestWorst: Record<string, string> } | { ok: false; reason: 'me-off' }>`, where `inbox` is to-me, PENDING and with no verdict; `received` is the rest of to-me; and `bestWorst` maps a record's best and worst ids to display titles
    - `getRecommendContext(meId: string, activityId: string): Promise<{ friends: { username: string; alreadySent: boolean }[]; recommendedBy: { from: string; note: string | null }[] }>`, empty when `me` is off or the activity isn't mine
  - `@/lib/actions/recommendations`:
    - `sendRecommendation(activityId: string, username: string, input: { note?: unknown; guess?: unknown }): Promise<ActionResult>`
    - `passRecommendation(id: string): Promise<ActionResult>`
    - `withdrawRecommendation(id: string): Promise<ActionResult>`
    - `loadRecommendContext(activityId: string): Promise<ActionResult & { context?: ... }>`

Exact copy:
- `'That user isn't available.'` for unknown, self or opted out.
- `'They've already made up their mind on this one. See Compare.'` when `verdictOf(recipient)` is set.
- `'You've already sent them this.'` on a duplicate, including Prisma `P2002`.
- `'Hand-made entries can't be sent.'`
- New: title `` `${from} recommended ${title}` ``, body `Open Recommendations to see it.`, dedupeKey `` `rec-new:${id}` ``.
- Verdict: title `` `${to}'s verdict on ${title} is in` ``, the same body, dedupeKey `` `rec-verdict:${id}` ``, sent to the sender, with the title in the sender's `titleLanguage`.

- [ ] **Step 1: Write the failing tests**, using a fake prisma as in `src/lib/data-activity.test.ts`, and mocking `@/lib/notify` and `@/lib/session`:

```ts
// actions/recommendations.test.ts
it('sends, and tells the recipient without the note or guess', async () => {
  const res = await sendRecommendation('a1', 'sam', { note: 'secret note', guess: 8 });
  expect(res.ok).toBe(true);
  const [, msg] = notifyMock.mock.calls[0];
  expect(msg.kind).toBe('friends');
  expect(JSON.stringify(msg)).not.toContain('secret note');
  expect(JSON.stringify(msg)).not.toMatch(/\b8\b/);
});
it('answers unknown, self and opted-out users identically', async () => { /* three calls, same error */ });
it('refuses when I am opted out', ...);
it('refuses someone else's activity as Not found', ...);
it('refuses a manual entry', ...);
it('refuses when the recipient scored or dropped it', ...);
it('allows a title I have not scored', ...);
it('allows a title on their list unscored, and leaves it PENDING so the inbox can say Already on your list', ...);
it('turns a duplicate (P2002) into the friendly message', ...);
it('never re-sends a passed title', ...);
it('only the recipient can pass; only the sender can withdraw, and only while canWithdraw', ...);

// data-recommendations.test.ts
it('hides the guess from the recipient until a verdict, then shows it', ...);
it('never puts the recipient's rating or status in a view before a verdict except through `waiting`', ...);
it('shows both scores once there is a verdict, even if the viewer has not scored', ...);
it('leaves senderScore null when the sender removed the title or never scored it', ...);
it('says Removed from their library when the recipient removed it', ...);
it('hides recommendations when the other person is opted out, and returns me-off when I am', ...);
it('skips a row whose catalogue title no longer exists', ...);

// recommendations-server.test.ts
it('marks PENDING as ADDED when the title was added after the recommendation was sent', ...);
it('leaves PENDING alone for a title they already had when it was sent', ...);
it('notifies the sender once on the first verdict', ...);
it('does not notify again after clearing and re-scoring', ...);
it('holds the notification while either switch is off, and sends it once back on', ...);
it('never throws when the database fails', ...);
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/lib/actions/recommendations.test.ts src/lib/data-recommendations.test.ts src/lib/recommendations-server.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement.** Notes where the signature leaves a choice:
  - Derive `slug` and `mediaId` from the activity via `CATEGORY_LIST` (`dbCategory` to `fkField`).
  - `ADDED` means added because of the recommendation: set it only when the activity's `createdAt` is at or after the recommendation's. A title they already had stays PENDING until they pass on it or a verdict moves it out of the inbox.
  - Claim the verdict notification with `updateMany({ where: { id, verdictNotifiedAt: null }, ... })`, and notify only when `count === 1`.
  - Load media rows the way `loadMedia` does in `data-compare.ts`. Read the other person's activity with only `status` and `rating` selected, never notes.
  - `fields` follows the `theirS` shape in `data-compare.ts:173-182`, so the inbox can feed `AddResultRow`.

- [ ] **Step 4: Run to verify they pass**, then `npx tsc --noEmit` and `npm test`.

Expected: all PASS. If `prefs.test.ts` or settings tests list kinds, update them to include `friends`.

- [ ] **Step 5: Commit** (`feat: send, read and settle recommendations`).

### Task 4: Settling from every path that changes a score

**Files:**
- Modify: `src/lib/actions/media.ts` (`addToList`, `updateActivity`, `restoreActivity`, `restoreActivityState`), `src/lib/jobs/times.ts`, `src/lib/jobs/index.ts`
- Test: `src/lib/recommendations-server.test.ts`, `src/lib/jobs/times.test.ts`

**Interfaces:**
- Consumes: `settleRecommendationsForActivity`, `settleRecommendationsForTitle`, `settleAllRecommendations` from Task 3.
- Produces: job `recommendations` at `JOB_TIMES.recommendations = '05:50'`, after `anilist-sync` (05:30), so the night's pulled scores are included.

- [ ] **Step 1: Write the failing tests**

```ts
it('settleAll notifies for a score written by an import or sync, once', async () => {
  // a row with verdictNotifiedAt null, recipient rating set directly in the fake
  expect(await settleAllRecommendations()).toEqual({ checked: 1, notified: 1 });
  expect(await settleAllRecommendations()).toEqual({ checked: 0, notified: 0 });
});
it('settleAll skips rows whose people have the switch off, and leaves them for later', ...);
it('settleAll marks PENDING as ADDED for a title imported after it was sent', ...);
```

In `times.test.ts`: `expect(minutes(JOB_TIMES.recommendations)).toBeGreaterThan(minutes(JOB_TIMES['anilist-sync']))`.

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/lib/recommendations-server.test.ts src/lib/jobs/times.test.ts`
Expected: FAIL on `JOB_TIMES.recommendations` and the new `settleAll` cases.

- [ ] **Step 3: Wire it in.** Call after the transaction commits and before returning, only when status or rating changed (`updateActivity`) or a row was created or restored (the others). Register the job in `src/lib/jobs/index.ts` next to `lastfm`.

- [ ] **Step 4: Run to verify they pass**, then `npm test` and `npx tsc --noEmit`.

- [ ] **Step 5: Commit** (`feat: verdicts settle after score changes and nightly`).

### Task 5: The Recommendations page

**Files:**
- Create: `src/app/(app)/recommendations/page.tsx`, `src/components/recommendations-client.tsx`
- Modify: `src/lib/nav-model.ts`, `src/lib/nav-model.test.ts`, `src/components/icons.ts` if the icon is missing, `src/components/settings-social.tsx`, `prisma/seed.ts`, `e2e/routes.json`

**Interfaces:**
- Consumes: `getRecommendationsPage`, `passRecommendation`, `withdrawRecommendation`, `AddResultRow` and `useAddRows`, `Cover` (`compare-parts.tsx`), `Score` (`prefs-provider`).
- Produces: route `/recommendations`; nav item `{ id: 'recommendations', label: 'Recommendations', href: '/recommendations', icon: 'Send', group: 'friends', gate: 'compare' }`.

- [ ] **Step 1: Write the failing test.** In `nav-model.test.ts`, add `'recommendations'` to the expected ids after `'together'`, and `['recommendations', 'compare']` to the gated list.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/nav-model.test.ts`
Expected: FAIL on both expectations.

- [ ] **Step 3: Add the nav item and build the page**, in the plain style of `/feed` and `/compare`.
  - **Me-off:** the same prompt `/compare` gives, linking to Settings.
  - **Recommended to you (`inbox`):** cover, "from {other}", note, then `AddResultRow` and Pass. When `myActivityId` is set, show "Already on your list" with a link via `titleHref` instead of Add.
  - **Your record:** two small blocks, "Your picks" and "Their picks", from `mine` and `theirs`: sent, added, finished, passed, average score, average guess miss, best and worst title. Hide a block when `sent` is 0.
  - **Sent and Received:** each row shows the title, note, and either `waiting` or the verdict. The verdict line shows their score ("dropped it" for a drop), your guess and your score, each only when present. Withdraw appears when `withdrawable`.
  - **Empty state:** "Nothing yet. Open any title and choose Send to a friend."
  - After Pass or Withdraw, `router.refresh()`, with errors through `settle` and a toast.

- [ ] **Step 4: Update the Settings wording.** In `SettingsCompare`, replace the last sentence ("Never your notes, reviews, dates or other statuses.") with this exact copy:

  > You can also send each other recommendations. When someone recommends you a title, they see whether you added or passed on it, how far you've got, and your score once you've scored it. Never your notes, reviews or dates.

- [ ] **Step 5: Seed and routes.** Extend `seedFriend` (only filling what's missing, with `verdictNotifiedAt` set so nothing fires):
  - one `demo2` to `demo` PENDING on a title `demo` lacks (`solaris`), with a note;
  - one `demo` to `demo2` ADDED on `alien`, with guess `8`, which shows a verdict.

  Add `"/recommendations"` to `e2e/routes.json`, which brings it into the sweep at 375px in every layout.

- [ ] **Step 6: Verify**

Run: `npm test && npx tsc --noEmit`
Expected: PASS. Then start the local server, seed, and run `BASE_URL=http://localhost:3000 npm run smoke`; expected: no failures on the new route.

- [ ] **Step 7: Commit** (`feat: the Recommendations page`).

### Task 6: Sending from the title view

**Files:**
- Create: `src/components/title/recommend-panel.tsx`
- Modify: `src/components/title/title-popup.tsx`, `src/components/title/title-page.tsx`

**Interfaces:**
- Consumes: `loadRecommendContext`, `sendRecommendation`.
- Produces: `<RecommendPanel activityId={string} slug={CategorySlug} />`, which renders nothing when there are no friends and no `recommendedBy`.

- [ ] **Step 1: Build `RecommendPanel`.** It loads its context in an effect, the way `use-has-seasons.ts` does, guarding against a stale id.
  - "Recommended by {from}" and the note, for each entry.
  - A "Send to a friend" button that expands to: a friend select (preselected and shown as plain text when there's only one), a note textarea (`maxLength={500}`), an optional guess input labelled "Your guess at their score, hidden until they've scored it", and Send.
  - Friends with `alreadySent` are disabled and marked "Sent".
  - Use `settle` and toasts. The Send button is disabled while pending, which covers double-clicks.

- [ ] **Step 2: Place it.** In the popup, after `NotesField` inside the scrolling area. On the full page, in a new `<Panel label="Friends">` after "Lists"; the panel's `empty:hidden` removes it when nothing renders, so a user with the switch off sees no change. Update the popup's header comment and the Panel doc comment's list.

- [ ] **Step 3: Add the end-to-end smoke step** in `e2e/smoke.mjs`, after the Compare checks near line 1392. The spec's demo-to-demo2 flow can't repeat, because a sent and scored title stays that way and smoke has no database access, so use two throwaway accounts:
  1. Register `smoke-a-<timestamp>` and `smoke-b-<timestamp>` in separate contexts, and turn on the switch at `/settings?tab=sharing` for both.
  2. Each adds a title from `/compare/demo2`'s S-tier list. `a` opens one title that `b` hasn't added, and sends it to `b` with the note and guess `8`.
  3. `b` opens `/recommendations`, sees the note but not the guess (assert the page's HTML doesn't contain the guess line), clicks Add, and scores the title `6` from the title view.
  4. `a` opens `/recommendations` and sees the verdict: `6` and the guess `8`.
  5. `b` turns the switch off; `a` no longer sees the item on reload. `a` turns the switch off too, so these accounts don't clutter the picker for later steps.

- [ ] **Step 4: Verify**

Run: `npm test && npx tsc --noEmit && BASE_URL=http://localhost:3000 npm run smoke`
Expected: all PASS, including the new step and the existing sweep of every route at 375px.

- [ ] **Step 5: Commit** (`feat: send a title to a friend from its title view`).

### Task 7: Export and docs

**Files:**
- Modify: `src/lib/export-full.ts`, `src/lib/export-full.test.ts`, `src/lib/data-export.ts`, `FEATURES.md` (sections 18 and 19), `README.md`, `ROADMAP.md`

**Interfaces:**
- Produces: `shapeFullExport` gains `recommendationsSent` and `recommendationsReceived`.

- [ ] **Step 1: Write the failing test** in `export-full.test.ts`, with a titled input row for each direction:

```ts
it('exports sent picks with their guess, and received picks without one', () => {
  const out = shapeFullExport({ ...base, recommendationsSent: [{ to: 'sam', title: 'Dune', note: 'n', guess: 8, response: 'ADDED', fromId: 'x', toId: 'y' }], recommendationsReceived: [{ from: 'sam', title: 'Heat', note: 'm', guess: 9, response: 'PENDING', fromId: 'y', toId: 'x' }] });
  expect(out.recommendationsSent[0]).toMatchObject({ to: 'sam', guess: 8 });
  expect(out.recommendationsReceived[0]).toMatchObject({ from: 'sam', note: 'm' });
  expect(out.recommendationsReceived[0]).not.toHaveProperty('guess');
  expect(JSON.stringify(out.recommendationsSent)).not.toContain('fromId');
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/export-full.test.ts`
Expected: FAIL on the missing properties.

- [ ] **Step 3: Implement it**, including the two queries in `getFullExport` and the catalogue title lookup, and add `[]` to any existing fixture. Update the doc comment listing what's exported.

- [ ] **Step 4: Update the docs.**
  - `FEATURES.md` section 19: a Recommendations entry. Section 18: `From friends` notifications.
  - `README.md`: `HOARD_SIGNUP_CLOSED`, if Task 2 didn't cover every place.
  - `ROADMAP.md`: a "Shipped since" note pointing at the spec.

- [ ] **Step 5: Verify**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: PASS.

- [ ] **Step 6: Commit** (`feat: recommendations in the full export; docs`).

---

## After the last task

Shipping is a separate decision for Tim: a whole-branch review, then merge and deploy with the `pi-deploy` skill, after a database backup. `prisma db push` adds the table at container start. Tim sets `HOARD_SIGNUP_CLOSED=1` once his friend has an account.
