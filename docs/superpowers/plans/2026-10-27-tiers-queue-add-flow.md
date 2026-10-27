# Tiers, Up next, Add Flow and Decimal Scores Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace "My ranking" with a hand-placed S–F tier list, add a reorderable Up next queue, make adding media a smooth two-choice flow, and move scores to one decimal.

**Architecture:** All new rules live in small pure modules (`src/lib/rating.ts`, `tiers.ts`, `queue.ts`, `search-nav.ts`) covered by Vitest; server actions and components call them. Schema changes go through the existing `prisma db push` entrypoint, preceded by an idempotent SQL step for the Int→Float rating change so `db push` never needs `--accept-data-loss`.

**Tech Stack:** Next.js 14 (App Router, server actions), React 18, Prisma 5 + Postgres 16, @dnd-kit (core 6.3.1 / sortable 10.0.0), Tailwind/shadcn, Vitest (new).

**Spec:** `docs/superpowers/specs/2026-10-27-tiers-queue-add-flow.md`

## Global Constraints

- Scores: 0.0–10.0, one decimal; displayed with one decimal ("8.0"); server rounds to one decimal and rejects values outside 0–10 (activities **and** franchises).
- Tiers: exactly `S`, `A`, `B`, `C`, `D`, `F`, per user and per category. Only COMPLETED and DROPPED items appear in the tier list. Nothing but the owner's own drag/select/accept actions ever changes an item's tier.
- Suggested tier: S ≥ 9.0, A ≥ 8.0, B ≥ 7.0, C ≥ 6.0, D ≥ 5.0, F < 5.0; unrated → no suggestion.
- "Want to …" labels: movies/tv/anime "Want to watch", books/manga "Want to read", games "Want to play", music "Want to listen". Done labels come from `statusLabel('COMPLETED', slug)`.
- Search-as-you-type: 350 ms debounce, minimum 2 trimmed characters.
- Order positions are written as 1000, 2000, … (existing `STEP` convention in `src/lib/actions/ranking.ts`).
- Every server action keeps the existing pattern: `requireUser()`, ownership check, `ActionResult`-style return, `revalidatePath` of `/<slug>`, `/<slug>/arena` (and `/franchises` where relevant).
- No new runtime dependencies. Dev-only: `vitest`.

## Review Focus

1. **Hidden tiers survive saves.** An item placed in tier A, then switched to CONSUMING (rewatch), must keep `tier`/`rankOrder` when the tier board is saved, and reappear in place once COMPLETED again. → test in Task 4 (`planTierSave` never touches ineligible ids) and Task 5 step.
2. **Stale search responses.** Typing "dune" quickly must never show results for "du" after "dune"'s arrive. → test in Task 7 (`isLatest` request guard).
3. **Existing data on first boot.** A database with integer ratings and old `rankOrder` values must boot without `db push` failing, and the old order must appear in the tray. → Task 2 SQL is idempotent (run twice), Task 4 tray-order test.
4. **Typing odd scores.** "8,5", "10.05", "", "-1", "abc" in the rating box. → `parseRatingInput` tests in Task 1.
5. **Re-adding a title already in the library** must not change its status or create a duplicate. → Task 7 `addToList` keeps the existing row untouched (asserted by reading the code path; covered by the library badge test).

---

### Task 1: Test harness and rating helpers

**Files:**
- Modify: `package.json` (add `"test": "vitest run"`, devDependency `vitest`)
- Create: `vitest.config.ts` (alias `@` → `./src`, `environment: 'node'`)
- Create: `src/lib/rating.ts`
- Test: `src/lib/rating.test.ts`

**Interfaces:**
- Produces:
  - `RATING_MIN = 0`, `RATING_MAX = 10`
  - `normalizeRating(v: number): number | null` — rounds to 1 dp; returns `null` if not finite or outside 0–10.
  - `parseRatingInput(text: string): number | null` — accepts `.` or `,` decimal separator, trims; `null` for empty/invalid/out of range.
  - `nudgeRating(v: number | null, delta: number): number` — `null` treated as 0; clamps to 0–10; 1 dp.
  - `formatRating(v: number | null): string` — `"8.0"`, `"7.5"`, `"—"` for null.

- [ ] **Step 1: Install Vitest and add config**

Run: `npm i -D vitest@2.1.8` and add the `test` script.

- [ ] **Step 2: Write the failing tests** in `src/lib/rating.test.ts`

```ts
expect(normalizeRating(8)).toBe(8);
expect(normalizeRating(7.25)).toBe(7.3);
expect(normalizeRating(10.04)).toBe(10);
expect(normalizeRating(10.05)).toBeNull();
expect(normalizeRating(-0.1)).toBeNull();
expect(normalizeRating(NaN)).toBeNull();
expect(parseRatingInput(' 8,5 ')).toBe(8.5);
expect(parseRatingInput('10.05')).toBeNull();
expect(parseRatingInput('')).toBeNull();
expect(parseRatingInput('-1')).toBeNull();
expect(parseRatingInput('abc')).toBeNull();
expect(nudgeRating(null, 0.1)).toBe(0.1);
expect(nudgeRating(9.95, 0.1)).toBe(10);
expect(nudgeRating(0, -0.1)).toBe(0);
expect(nudgeRating(7.9, 0.1)).toBe(8);   // no 7.999… float drift
expect(formatRating(8)).toBe('8.0');
expect(formatRating(null)).toBe('—');
```

- [ ] **Step 3: Run to see it fail** — `npm test` → FAIL (module not found).
- [ ] **Step 4: Implement `src/lib/rating.ts`** — round with `Math.round(v * 10) / 10`, compare after rounding.
- [ ] **Step 5: Run** — `npm test` → all pass.
- [ ] **Step 6: Commit** — `git commit -m "test: add vitest and decimal rating helpers"`

---

### Task 2: Schema, boot-time SQL and activity shape

**Files:**
- Modify: `prisma/schema.prisma` — add `enum Tier { S A B C D F }`; on `UserMediaActivity`: `rating Float?` (comment "user score, 0.0–10.0"), `tier Tier?`, `queueOrder Float?`, `@@index([userId, category, queueOrder])`; on `Franchise`: `rating Float?`. Update the header comment ("1–10 rating" → "0.0–10.0 score, tier, queue position").
- Create: `prisma/sql/001-decimal-ratings.sql`
- Modify: `docker-entrypoint.sh` — before `db push`, run every `prisma/sql/*.sql` in name order with `npx prisma db execute --file "$f" --schema prisma/schema.prisma`.
- No Dockerfile change: the runner stage already copies the whole `prisma/` folder (`Dockerfile:65`), so `prisma/sql` ships with it.
- Modify: `src/lib/types.ts` — `ActivityWithMedia` gains `tier: Tier | null` and `queueOrder: number | null` (import `Tier` from `@/lib/tiers` — create that file now with just `export const TIERS = ['S','A','B','C','D','F'] as const; export type Tier = (typeof TIERS)[number];`). Update the `Matchup.rating` comment to "shared whole-number score".
- Modify: `src/lib/data.ts:49-62` `flattenActivity` — map `tier: row.tier ?? null`, `queueOrder: row.queueOrder ?? null`.

**Interfaces:**
- Produces: DB columns `tier`, `queueOrder`; `ActivityWithMedia.tier`, `ActivityWithMedia.queueOrder`; `Tier`, `TIERS` from `src/lib/tiers.ts`.

- [ ] **Step 1: Write `001-decimal-ratings.sql`** — idempotent: a `DO $$ … $$` block that, for `"UserMediaActivity".rating` and `"Franchise".rating`, runs `ALTER TABLE … ALTER COLUMN rating TYPE DOUBLE PRECISION` only when `information_schema.columns.data_type = 'integer'`, and does nothing if the table doesn't exist yet (fresh DB).
- [ ] **Step 2: Edit schema, types, flatten, entrypoint** as listed.
- [ ] **Step 3: Verify schema** — `npx prisma validate && npx prisma generate` → "The schema … is valid", client generated.
- [ ] **Step 4: Verify against a real Postgres** — `docker run --rm -d --name hoard-pg -e POSTGRES_PASSWORD=p -p 55432:5432 postgres:16-alpine`; with `DATABASE_URL=postgresql://postgres:p@localhost:55432/postgres`: `git stash` the schema change, `npx prisma db push` (old schema, int ratings), insert one activity row with `rating = 8`; `git stash pop`; run the SQL file **twice** via `prisma db execute`; then `npx prisma db push` → completes without a data-loss prompt; `SELECT rating FROM "UserMediaActivity"` → `8`. Stop the container.
- [ ] **Step 5: Type-check** — `npx tsc --noEmit` → no errors.
- [ ] **Step 6: Commit** — `git commit -m "feat(db): decimal scores, tier and queue columns"`

---

### Task 3: Decimal rating input, display and validation

**Files:**
- Create: `src/components/rating-input.tsx`
- Modify: `src/components/rating-control.tsx` — becomes display-only: drop the interactive branch and `onChange`; render `formatRating(value)` + "/10".
- Modify: `src/components/activity-detail-dialog.tsx:307`, `src/components/franchise-dialog.tsx:130` — use `RatingInput`.
- Modify: `src/components/search-dialog.tsx:216` — temporarily use `RatingInput` (Task 7 rewrites this file).
- Modify display sites to use `formatRating`: `sortable-rank-list.tsx:151-154`, `ranking-list.tsx:64-67`, `franchise-group.tsx:41`, `rank-board.tsx:169`, `src/lib/actions/roast.ts:47`.
- Modify: `src/lib/actions/media.ts` `updateActivity` — when `data.rating` is a number, `normalizeRating`; `null` result → `{ ok: false, error: 'Score must be between 0 and 10.' }`.
- Modify: `src/lib/actions/franchise.ts:122-127` — same rule and message (replaces the 1–10 check).

**Interfaces:**
- Consumes: Task 1 helpers.
- Produces: `RatingInput({ value: number | null; onChange: (v: number) => void; onSkip?: () => void; autoFocus?: boolean })` — 10 pips (tap n → `n`), −0.1/+0.1 buttons via `nudgeRating`, a small text box committing `parseRatingInput` on Enter/blur (invalid → revert, no call), and a "Skip" button only when `onSkip` is given. Keep the existing pip sizing (44 px cells on phones, 28 px on sm+); pips ≤ `Math.floor(value)` are highlighted.

- [ ] **Step 1: Build `RatingInput`** and swap the three interactive call sites.
- [ ] **Step 2: Server validation + display sites** as listed.
- [ ] **Step 3: Verify** — `npx tsc --noEmit && npm run lint && npm test` → clean. Manually (`npm run dev` against the Task 2 container DB, `npx prisma db push` first): rate an item 7, nudge to 7.4, type "8,5" → shows 8.5/10 everywhere; type "11" → reverts.
- [ ] **Step 4: Commit** — `git commit -m "feat: one-decimal scores with pip, nudge and typed input"`

---

### Task 4: Tier rules (pure)

**Files:**
- Modify: `src/lib/tiers.ts`
- Test: `src/lib/tiers.test.ts`

**Interfaces:**
- Consumes: `ActivityWithMedia` (Task 2).
- Produces:
  - `isTierEligible(status: Status): boolean` — COMPLETED or DROPPED.
  - `suggestTier(rating: number | null): Tier | null` — thresholds from Global Constraints.
  - `tierIndex(tier: Tier | null): number` — S=0 … F=5, null=6.
  - `compareTierOrder(a, b): number` — by `tierIndex`, then `rankOrder` (nulls last), then rating desc, then `elo` desc, then title.
  - `interface TierBoardData { tiers: Record<Tier, ActivityWithMedia[]>; tray: ActivityWithMedia[] }`
  - `buildTierBoard(all: ActivityWithMedia[]): TierBoardData` — eligible items only; placed items sorted by `rankOrder` within their tier; tray = eligible with `tier === null`, sorted by `rankOrder` (legacy "My ranking" order) first, then rating desc, then elo desc.
  - `type TierPlacement = Record<Tier, string[]>` (ids best-first per tier)
  - `planTierSave(placement: TierPlacement, eligibleIds: Set<string>): { placed: { id: string; tier: Tier; rankOrder: number }[]; clearIds: string[] }` — ignores ids not in `eligibleIds`; `rankOrder` = (index+1)·1000 within each tier; `clearIds` = eligible ids not placed (→ `tier: null, rankOrder: null`). Ineligible ids appear in neither list.
  - `acceptSuggestions(board: TierBoardData): TierPlacement` — current placement plus every rated tray item appended to the bottom of its suggested tier in tray order; unrated tray items stay out.

- [ ] **Step 1: Write the failing tests** (build activities with a small `make({ id, status, rating, tier, rankOrder })` helper in the test file):

```ts
expect(suggestTier(9)).toBe('S'); expect(suggestTier(8.9)).toBe('A');
expect(suggestTier(5)).toBe('D'); expect(suggestTier(4.9)).toBe('F');
expect(suggestTier(null)).toBeNull();
// board
const board = buildTierBoard([
  make({ id: 'a', status: 'COMPLETED', tier: 'A', rankOrder: 2000 }),
  make({ id: 'b', status: 'COMPLETED', tier: 'A', rankOrder: 1000 }),
  make({ id: 'c', status: 'CONSUMING', tier: 'S', rankOrder: 1000 }), // rewatch: hidden
  make({ id: 'd', status: 'DROPPED', tier: null, rankOrder: null, rating: 9 }),
  make({ id: 'e', status: 'COMPLETED', tier: null, rankOrder: 3000, rating: 4 }), // legacy order
  make({ id: 'f', status: 'PLANNED', tier: null }),
]);
expect(board.tiers.A.map(x => x.id)).toEqual(['b', 'a']);
expect(board.tiers.S).toEqual([]);
expect(board.tray.map(x => x.id)).toEqual(['e', 'd']);
// save never touches hidden items
const plan = planTierSave({ S: [], A: ['a', 'c'], B: [], C: [], D: [], F: [] }, new Set(['a', 'b', 'd', 'e']));
expect(plan.placed).toEqual([{ id: 'a', tier: 'A', rankOrder: 1000 }]);
expect(plan.clearIds.sort()).toEqual(['b', 'd', 'e']);
// accept all keeps tray order inside a tier
expect(acceptSuggestions(board).A).toEqual(['b', 'a']);
expect(acceptSuggestions(board).S).toEqual(['d']);
expect(acceptSuggestions(board).F).toEqual(['e']);
```

- [ ] **Step 2: Run** — `npm test` → FAIL.
- [ ] **Step 3: Implement** the listed functions in `src/lib/tiers.ts`.
- [ ] **Step 4: Run** — `npm test` → PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat: pure tier rules"`

---

### Task 5: Tier list end to end (data, actions, Arena, board UI)

**Files:**
- Modify: `src/lib/data.ts` — replace `getRankBoard`/`isRankable`/`RankBoard` with `getTierBoard(slug): Promise<TierBoardData>` (= `buildTierBoard(await loadCategory(slug))`); `getRanking(slug)` → all tier-placed eligible items flattened S→F in board order, else rated items by `byRatingThenElo`; `getMatchup(slug)` → if any tier has ≥ 2 items, pick a random such tier and a random neighbour pair inside it (`ranks` = positions within the flattened ranking); else fall back to pairing two items with the same `Math.floor(rating)`. Extract `withinTierPairs(board: TierBoardData): [ActivityWithMedia, ActivityWithMedia][]` (pure, exported from `tiers.ts`) for the neighbour candidates.
- Modify: `src/lib/actions/ranking.ts` — remove `saveRanking`/`seedRanking`; add `saveTiers(slug, placement: TierPlacement): Promise<ActionResult>` (loads owned activities in the category, eligible set via `isTierEligible`, applies `planTierSave` in one `$transaction`) and `acceptSuggestedTiers(slug): Promise<ActionResult>` (= `saveTiers(slug, acceptSuggestions(await getTierBoard(slug)))`).
- Modify: `src/lib/actions/arena.ts:56-60` — swap `rankOrder` only when `winner.tier != null && winner.tier === loser.tier` and the loser sits above.
- Modify: `src/components/category-client.tsx` — sort mode `ranking` uses `compareTierOrder`, label `'Tier list'`; the `ranks` map numbers items in `compareTierOrder` order among tier-placed eligible items only.
- Test: `src/lib/tiers.test.ts` (add `withinTierPairs` test)

**Interfaces:**
- Consumes: Task 4.
- Produces: `getTierBoard`, `saveTiers`, `acceptSuggestedTiers`, `withinTierPairs`.

- [ ] **Step 1: Failing test** — `withinTierPairs` on a board with A=[b,a], B=[x] → `[[b, a]]` (ids), none across tiers.
- [ ] **Step 2: Run** → FAIL. **Step 3:** implement the data/actions/arena/category changes above, then the board UI below (the old `RankBoard` depends on the removed actions, so both land in this task).

**UI files:**
- Create: `src/components/tier-board.tsx` (replaces `rank-board.tsx`; delete the old file)
- Modify: `src/app/(app)/[category]/arena/page.tsx` — tabs: `Tiers` (default, `/{slug}/arena`), `Up next` (`?tab=queue`, wired in Task 6), `Arena` (`?tab=arena`); heading copy "Tier your {label}"; render `<TierBoard slug initial={await getTierBoard(slug)} />`.

**UI interface:**
- Produces: `TierBoard({ slug: CategorySlug; initial: TierBoardData })`.

Behaviour:
- Six labelled rows S…F (distinct accent colour per tier, readable in light/dark) plus the Unranked tray below.
- One `DndContext`; one `SortableContext` per tier and one for the tray (each a droppable container, `useDroppable` so empty tiers accept drops). `onDragOver` moves the item between containers in local state; `onDragEnd` reorders within the container and persists via `saveTiers` (optimistic, revert + toast on failure, same pattern as the old `RankBoard.persist`).
- Phone/keyboard fallback on every row: up/down arrows within its tier and a small tier picker (S A B C D F · Unranked).
- Tray rows show the suggestion chip ("A?", tap → place at the bottom of that tier); unrated rows show none. "Accept all suggestions" button appears when any tray item has a suggestion.
- Empty state: "Nothing to tier yet — finish something first."

- [ ] **Step 4: Verify** — `npx tsc --noEmit && npm run lint && npm test`; manually: with seeded legacy `rankOrder` rows, the tray shows them in old order with chips; Accept all places them; drag across tiers and within a tier, reload → persisted; set one to Watching in the detail dialog → disappears; set back to Watched → returns to the same spot; Arena only pairs within a tier.
- [ ] **Step 5: Commit** — `git commit -m "feat: S–F tier list replaces My ranking"`

---

### Task 6: Up next queue

**Files:**
- Create: `src/lib/queue.ts`; Test: `src/lib/queue.test.ts`
- Create: `src/lib/actions/queue.ts`
- Create: `src/components/up-next.tsx`
- Modify: `src/lib/data.ts` — `getQueue(slug)` = `orderQueue(await loadCategory(slug))`.
- Modify: `src/lib/actions/media.ts` `updateActivity` — status changes: leaving PLANNED → `queueOrder: null`; entering PLANNED → `queueOrder` = current max in category + 1000 (via `nextQueueOrder`).
- Modify: `src/app/(app)/[category]/arena/page.tsx` — `tab=queue` renders `<UpNext slug initial={await getQueue(slug)} />`.
- Modify: `src/components/category-client.tsx` — inside the PLANNED status section (and for `status` sort), PLANNED items are ordered with `orderQueue`; the section header gets an "Reorder" link to `/{slug}/arena?tab=queue`.

**Interfaces:**
- Produces:
  - `orderQueue(all: ActivityWithMedia[]): ActivityWithMedia[]` — PLANNED only; `queueOrder` asc, nulls last by `createdAt` asc.
  - `nextQueueOrder(maxQueueOrder: number | null): number` — `null` → 1000, else max + 1000.
  - `saveQueue(slug, orderedIds: string[]): Promise<ActionResult>` — owned PLANNED ids only, rewrites 1000, 2000, …
  - `UpNext({ slug; initial: ActivityWithMedia[] })` — `SortableRankList` rows; each row has a done button labelled `statusLabel('COMPLETED', slug)` that expands an inline `RatingInput` with Skip; choosing a score or Skip calls `updateActivity(id, { status: 'COMPLETED', rating })` (rating omitted on Skip) and removes the row.

- [ ] **Step 1: Failing tests**

```ts
expect(orderQueue([
  make({ id: 'x', status: 'PLANNED', queueOrder: null, createdAt: '2026-01-02' }),
  make({ id: 'y', status: 'PLANNED', queueOrder: 2000 }),
  make({ id: 'z', status: 'PLANNED', queueOrder: 1000 }),
  make({ id: 'w', status: 'COMPLETED', queueOrder: 500 }),
  make({ id: 'v', status: 'PLANNED', queueOrder: null, createdAt: '2026-01-01' }),
]).map(a => a.id)).toEqual(['z', 'y', 'v', 'x']);
expect(nextQueueOrder(null)).toBe(1000);
expect(nextQueueOrder(3000)).toBe(4000);
```

- [ ] **Step 2: Run** → FAIL. **Step 3:** implement. **Step 4:** `npm test && npx tsc --noEmit && npm run lint` → clean; manually reorder, reload → persisted; mark one done with 8.5 → it leaves the queue and appears in the tier tray with "A?".
- [ ] **Step 5: Commit** — `git commit -m "feat: per-category Up next queue"`

---

### Task 7: Smoother add flow

**Files:**
- Modify: `src/lib/status.ts` — add `addChoiceLabels(slug: CategorySlug): { done: string; want: string }`.
- Create: `src/lib/search-nav.ts`; Test: `src/lib/search-nav.test.ts`
- Modify: `src/lib/actions/media.ts` `addToList(slug, result, status: 'COMPLETED' | 'PLANNED')` — new rows get that status; PLANNED rows get `queueOrder` via `nextQueueOrder`; COMPLETED rows get `finishedAt = now`. An existing row is returned unchanged (no status change). Return type adds `existing: boolean`.
- Modify: `src/components/search-dialog.tsx` (rewrite)
- Modify: `src/components/category-client.tsx:219` — pass `library: Record<string, { status: Status; rating: number | null }>` keyed by `media.externalId`, built from `activities`.

**Interfaces:**
- Produces:
  - `nextHighlight(current: number, delta: 1 | -1, length: number): number` — wraps; `length === 0` → `-1`.
  - `shouldSearch(query: string): boolean` — trimmed length ≥ 2.
  - `createLatestGuard(): { next(): number; isLatest(id: number): boolean }` — monotonic request ids.
  - `libraryBadge(entry: { status: Status; rating: number | null }, slug): string` — `"In library · Watched 8.5"`, or without the score when unrated.

Dialog behaviour:
- Input `onChange` schedules a search 350 ms after the last keystroke when `shouldSearch`; Enter searches immediately; each request takes `guard.next()` and results are applied only if `guard.isLatest(id)`.
- ↑/↓ in the input move the highlight (`nextHighlight`), Enter on a highlighted row opens its choice buttons and focuses the first one.
- Row states: `library` hit → muted `libraryBadge` text, no buttons; fresh → two buttons `done` / `want`; after done → inline `RatingInput` with `onSkip` (autofocused), then a check + "Watched 8.5" / "Watched"; after want → check + "In Up next".
- `onOpenChange(false)` resets query, results, highlight, row states and cancels the pending timer.
- Toasts: one per add ("Added "Dune" as Watched." / "Added "Dune" to Up next."); none on rating (the row shows it).

- [ ] **Step 1: Failing tests**

```ts
expect(addChoiceLabels('books')).toEqual({ done: 'Read', want: 'Want to read' });
expect(addChoiceLabels('games')).toEqual({ done: 'Beaten', want: 'Want to play' });
expect(addChoiceLabels('music')).toEqual({ done: 'Listened', want: 'Want to listen' });
expect(nextHighlight(-1, 1, 3)).toBe(0);
expect(nextHighlight(2, 1, 3)).toBe(0);
expect(nextHighlight(0, -1, 3)).toBe(2);
expect(nextHighlight(0, 1, 0)).toBe(-1);
expect(shouldSearch(' d ')).toBe(false);
expect(shouldSearch('du')).toBe(true);
const g = createLatestGuard(); const a = g.next(); const b = g.next();
expect(g.isLatest(a)).toBe(false); expect(g.isLatest(b)).toBe(true);
expect(libraryBadge({ status: 'COMPLETED', rating: 8.5 }, 'movies')).toBe('In library · Watched 8.5');
expect(libraryBadge({ status: 'PLANNED', rating: null }, 'movies')).toBe('In library · Unwatched');
```

- [ ] **Step 2: Run** → FAIL. **Step 3:** implement helpers, action change and dialog. **Step 4:** `npm test && npx tsc --noEmit && npm run lint` → clean; manually: type "dune" quickly → results appear without pressing Search, never flicker back to older results; ↓ ↓ Enter → choices on the 2nd row; Watched → rate 8.5 → row confirms; Skip works; Want to watch → appears at the bottom of Up next; search "dune" again → "In library · Watched 8.5"; close + reopen → empty dialog.
- [ ] **Step 5: Commit** — `git commit -m "feat: two-choice add flow with search-as-you-type"`

---

### Task 8: Build check and deploy to the Pi

**Files:**
- Modify: `~/.claude/skills/pi-deploy/SKILL.md` — add a "Pi folder is not a git checkout" branch to step 3 (see below).
- Modify: `~/Desktop/BucketFillers/CLAUDE.md` — add hoard to the projects table (Next.js + Prisma/Postgres, `npm test`, deploy via pi-deploy).

Skill addition (one-time conversion, all over SSH, stop and ask on any surprise):
1. `docker ps` label shows the working dir (`~/hoard`); confirm `git -C ~/hoard rev-parse` fails.
2. Back up first: `docker compose -f <files> exec -T db pg_dump -U <POSTGRES_USER> <POSTGRES_DB> > ~/hoard-backup-<date>.sql` and check the file is non-empty.
3. `git clone https://github.com/Tim704/hoard.git ~/hoard.git-new`, copy `~/hoard/.env` into it, compare `docker-compose.yml` between the two (stop if they differ beyond the new code).
4. `mv ~/hoard ~/hoard.pre-git && mv ~/hoard.git-new ~/hoard` — same folder name, so the compose project (`hoard`) and its Postgres volume are reused.
5. Continue with the normal pull/rebuild/verify steps. Keep `~/hoard.pre-git` until Tim says it can go.

- [ ] **Step 1: Full local check** — `npm test && npx tsc --noEmit && npm run lint && npm run build` → all succeed.
- [ ] **Step 2: Update the skill and CLAUDE.md** as above.
- [ ] **Step 3: Ask Tim before pushing** (the repo is public) and before touching the Pi; then follow pi-deploy, including the conversion branch.
- [ ] **Step 4: Verify live** — `https://hoard.timhufnagel.org/login` returns 200; container logs show the SQL step and `db push` succeeded; log in and spot-check that existing scores show as "8.0" and the tier tray holds the old ranking order.
