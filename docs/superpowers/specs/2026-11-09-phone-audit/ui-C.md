# Phone UI audit, area C: planning, insights, friends and settings

Auditor C. Pages: Tonight, Calendar, Diary, Anime season, Stats (all tabs + year), Compare, Watch together,
Feed, Recommendations, Settings (all tabs). 375px, Classic light/dark full page, plus the other three layouts'
first screens. Every page in my area looks the same across Classic, Minimal, Organised and Fresh. None of the
findings below is layout-specific.

Screenshot paths are short:
- `shots/` = `/private/tmp/claude-501/-Users-timhufnagel-Desktop-BucketFillers/f40924d7-2d36-4b36-a7a8-5e5caf8ab4c0/scratchpad/audit/run2/shots/`
- `states/` = `/private/tmp/claude-501/-Users-timhufnagel-Desktop-BucketFillers/f40924d7-2d36-4b36-a7a8-5e5caf8ab4c0/scratchpad/audit/states1/`

Code paths are relative to `hoard/src/`.

**Gaps in what the screenshots show:**
- The demo seed has **no diary entries**. The Diary rows, the populated Year in review and the Goals progress
  therefore come from reading the code, not from screenshots. The automated tap-target check also never saw
  the Diary row buttons (see D1).
- Watch together results need a tap, so none were captured.
- The Calendar List view and a picked calendar day were not captured.

Grades: **Broken** (wrong or unusable), **Confusing** (works, but people will get it wrong), **Rough** (looks or
feels off).

---

## Recommendations (redesigned this week, reviewed strictly)

### R1. Confusing: the answers to one pick are split in two places, and "✓ Watched" looks already ticked
`shots/recommendations-light.png`, `-dark.png`, `-organised.png`
- In "Recommended to you", **Pass** sits top-right beside the friend's note. **Watched / Want to watch** sit at
  the bottom, inside a second bordered box within the card.
- The three answers to one question are in two places, and the thumb has to reach the top corner to decline.
- "✓ Watched" is a filled grey button with a check. On a phone that reads as a state ("you watched this"), not
  as an action.

**Fix:**
- `components/recommendations-client.tsx:155-165`: remove Pass from the header row.
- Draw one answer row at the bottom of the card, full width on phones: `grid grid-cols-3 gap-2` with
  `[+ Want to watch] [Watched] [Pass]`.
- `AddResultRow` needs two props for this:
  - `bare`, which drops `rounded-md border p-2` at `components/add-row.tsx:163`, so the inbox is not a card
    inside a card;
  - `extraAction`, a slot appended to the button group at `add-row.tsx:219-228`. The inbox passes its Pass
    button there (`recommendations-client.tsx:183-198`).
- `add-row.tsx:220`: change the Done button from `variant="secondary"` to `variant="outline"`, so neither
  answer looks pre-selected.
- This one change also fixes the same look on Anime season, Compare's S tier and the Add/Search rows.

### R2. Confusing: there is no way to send a recommendation from the Recommendations page
`shots/recommendations-light.png`
- The page shows the inbox, Sent, Received and the record, but has no "Send" action.
- Sending means: open a section, find the title, open it, then "Send to a friend". That is 3 to 4 taps on
  another page. The empty state's copy (line 75) admits this.

**Fix:**
- In the header at `app/(app)/recommendations/page.tsx:18-24`, add a `Send a title` button (outline, `Send`
  icon) next to the h1.
- It opens a library picker dialog: reuse the "Search your library…" list from `components/diary-client.tsx`
  `AddDialog` (lines 456-490).
- Picking a title opens the existing send form from `components/title/recommend-panel.tsx`.

### R3. Rough: the verdict strip is squeezed into the text column
`shots/recommendations-light.png` (Sent → Alien)
- "Their score / Your guess / Your score" sit in about 75px cells, so every label wraps onto two lines.
- The strip also stops 40px short of the card edge, because it lives beside the chevron.

**Fix:**
- `recommendations-client.tsx:321`: render `VerdictStrip` after the `flex items-start gap-3` row (after line
  324), at the full row width with `pl-14`, like the Take back row at line 326.
- On phones, shorten the labels to "Them · Guess · You", keeping the full text in `sr-only`
  (lines 382-389).

### R4. Rough: "Your guess: 7.0" on a sent pick reads like a score
`shots/recommendations-light.png` (Sent → Stalker)

**Fix:** `recommendations-client.tsx:366-370`: change the copy to "You guessed they'd give it 7.0".

---

## Anime season

### A1. Confusing: titles are cut to about 12 characters
`shots/anime_season-light.png` (all 50 rows), `anime_season-organised.png`, `anime_season-dark.png`
- Rows read "Cyberpunk: E…", "The Apotheca…", "Reborn as a S…", "Nia Liston: Th…".
- The two stacked buttons take half the row width, so you cannot tell which show it is.

**Fix:**
- `components/add-row-list.tsx:30`: pass `fullTitle` to `AddResultRow`. The title then wraps and the buttons
  go in one row under it, which is how the Recommendations inbox already draws it (`add-row.tsx:164, 180,
  219`).
- This also fixes "More by the same people", which uses the same list.

### A2. Confusing: "✓ Watched" looks like a status
`shots/anime_season-light.png`
- Same issue as R1, but here it is on 50 rows at once.
- **Fix:** the same as R1, at `add-row.tsx:220`.

### A3. Rough: the filters scroll away on a 5,500px list
`shots/anime_season-light.png`
- Changing the season or format means scrolling all the way back up.
- "More" is a small button at the very end of the list.

**Fix:**
- `components/anime-season-client.tsx:98`: make the filter grid sticky:
  `sticky top-[var(--topbar-h)] z-10 -mx-[var(--page-pad)] bg-background/95 px-[var(--page-pad)] py-2 backdrop-blur`.
- At line 176, make "More" `w-full`.

---

## Tonight

### T1. Confusing: "Another" does nothing when three or fewer titles fit
`shots/tonight-light.png`
- The demo fits only 2 titles. Tapping Another redraws the same two picks.
- The header copy also promises "Three picks".
- Cause: `pickTonight` returns the whole pool when `pool.length <= count` (`lib/tonight.ts:154`), but the
  button is only disabled at 0 picks.

**Fix:**
- `components/tonight-client.tsx:50`: compute `const pool = tonightPool(queues, base)`.
- Line 130: `disabled={pool.length <= 3}`.
- When the pool is that small, add a muted line under the list: "That's everything that fits."
- `app/(app)/tonight/page.tsx:21`: change "Three picks" to "Up to three picks".

### T2. Confusing: you can't tell which toggle chips are on (also Watch together and Notifications)
`shots/tonight-light.png`, `tonight-dark.png`, `together-light.png`, `settings_tab_notifications-light.png`
- On Tonight, the time chips show a ✓ when chosen. The Section and Genre chips don't.
- In dark Classic, "on" is a slightly lighter grey than "off".
- When every chip in a group is on (Sections; "Push these"), nothing shows what "off" would look like.
- Settings → General uses filled primary + ✓. Settings → Sections uses an eye and line-through. Hoard has three
  different "selected" looks.

**Fix:**
- Use one toggle-chip look everywhere: **on** = accent fill + `Check` icon; **off** = `border-dashed`, the
  style Notifications already uses.
- Where to change it:
  - `tonight-client.tsx:31-35`: let `chip()` take the check, and render
    `{on && <Check className="h-3.5 w-3.5" />}` in the Section (102-104) and Genre (116-118) buttons;
  - `components/together-client.tsx:66-71`;
  - `components/settings-notifications.tsx:159-164`.

### T3. Rough: the answer sits below a 470px filter card
`shots/tonight-light.png`
- The first screen is mostly filters. The picks start at y≈535, and the third pick is below the fold.
- Each pick card is a bare link with an empty right half.

**Fix:**
- `tonight-client.tsx:71-149`: keep the "How much time?" chips at the top. Move the `Tonight's picks` section
  directly under them.
- Put Sections and Genres after the picks, inside `<details><summary>Filters</summary>`.
- Line 112: change the copy "(any of them; none = all)" to "(optional)".

### T4. Confusing: the empty state gives no next step
`states/empty_tonight.png`
- It says "Plan a few titles…" but has no link or button.

**Fix:** `tonight-client.tsx:63-67`: add a `Button asChild` to `/add` labelled "Add something to watch",
under the copy.

---

## Calendar

### C1. Confusing: on a phone the month is only dots, and the day you tap shows up off screen
`shots/calendar-light.png`
- Each day shows coloured dots. Nothing says you can tap a day.
- The picked day's list renders below the legend, at y≈745 of an 812px screen, so it opens under the fold.

**Fix:**
- `components/calendar-client.tsx:194-203`: move the picked-day block to just after the grid (after line
  183), above the legend.
- When no day is picked, show the shown month's items on phones (`sm:hidden`), headed "This month", using the
  existing `ItemRow`. Tapping a day narrows the list to that day.
- Line 185: on phones, hide the legend (`hidden sm:flex`). Every row already says "Release · …", so the legend
  is redundant there.

### C2. Confusing: an empty calendar is a blank grid with a legend and no message
`states/empty_calendar.png`

**Fix:** `calendar-client.tsx:183`: when `items.length === 0`, render the List view's empty copy (lines
208-211) under the grid.

### C3. Rough: the "Subscribe in your cale…" link is truncated
`shots/calendar-light.png`, `calendar-fresh.png`

**Fix:** `calendar-client.tsx:106`: on phones, use
`<span className="sm:hidden">Subscribe</span><span className="hidden sm:inline">…full text…</span>`.

### C4. Rough: the right and bottom edges of the grid have a double border
`shots/calendar-light.png`
- Each cell has `border-r border-b`, inside a container that also has `border`
  (`calendar-client.tsx:133, 151`).

**Fix:**
- At line 133, use `gap-px bg-border` on the grid.
- Give the cells `bg-background` with no borders.
- Give outside-month cells `bg-muted/40`.

---

## Diary (rows reviewed from code: the seed has no entries)

### D1. Confusing: crowded rows with one-line titles and two 32px icons
Screenshots: none (the demo diary is empty). Code: `components/diary-client.tsx:143-181`.
- Each row holds: the day (32px), a cover (40px), the title, and Edit + Delete icons (`h-8 w-8`, no `tap-area`).
- That leaves about 150px for a `truncate` title, roughly 18 characters.
- The phone check never measured those two buttons, because the seed has no diary rows.

**Fix:**
- Make the whole row a `button` that opens the Edit dialog. That dialog already has every field.
- Remove the two icons (lines 167-181).
- Add a destructive `Delete` on the left of the Edit dialog footer (`EntryDialog`, lines 370-389). It opens the
  existing confirm.
- Line 149: change the title to `line-clamp-2 break-words`.

### D2. Rough: the empty state's text touches the dashed border, and the filters filter nothing
`states/empty_diary.png`, `shots/diary-light.png`

**Fix:**
- `diary-client.tsx:125` and `131`: add `px-6`.
- When `entries.length === 0`, hide the "0 entries" line (79-81) and the two selects (96-121).
- Put the "Log a past one" button inside the empty state instead.

---

## Stats

### S1. Confusing: a brand-new account scrolls through about 3,000px of zeros
`states/empty_stats.png`
- Seven all-zero section cards and six "Nothing yet" chart boxes, instead of one message.

**Fix:** `app/(app)/stats/page.tsx:85`: in `Overview`, if every `sec.total === 0`, render one dashed empty
state instead: "Stats fill in as you track titles", with a button to `/add`. Skip the rest.

### S2. Rough: Overview is a 3,400px scroll for a little information
`shots/stats-light.png`
- The three streak tiles stack one per row, about 107px each for a single number.
- Every section gets a 180px card, even with 0 tracked (Manga, Albums).
- Empty charts keep a 170px box.

**Fix:**
- `stats/page.tsx:89`: use `grid-cols-3` at every width. In `StatTile` (164-174), use value
  `text-xl sm:text-2xl` and hint `hidden sm:block`.
- Line 115: render only `data.sections.filter((s) => s.total > 0)`, plus one muted line "Nothing tracked in
  Manga, Albums".
- `components/stats/chart-kit.tsx:105`: change the empty message from `py-8 text-center` to
  `py-2 text-left`, so empty charts collapse to a line.

### S3. Confusing: in Status mix, "Completed" and "Dropped" are both green
`shots/stats-light.png`, `stats-dark.png`
- The colours are `#1baf7a` and `#008300`. The Movies bar reads as one green block.
- Cause: `statusColor` indexes `VIZ` by status order, so DROPPED gets `--viz-6`.

**Fix:** `components/stats/stats-charts.tsx:27`: use an explicit map that gives DROPPED `var(--viz-7)`
(violet, unused).

### S4. Rough: the stats tab bar pokes past the right gutter
`shots/stats-light.png`, `stats_tab_*-light.png`
- The tab bar is `w-max` at about 354px against 343px of content. It overhangs the cards by about 11px and
  scrolls by a few pixels.
- It also looks unlike Settings' tab strip.

**Fix:** `components/stats/stats-tabs.tsx:21`: below `sm`, use `grid w-full grid-cols-5` with links
`px-1 text-center`. Keep `flex w-max` from `sm`.

### S5. Rough: the tab bar jumps when you switch to Year
`shots/stats_year_2026-light.png` vs `stats-light.png`
- The Year page has its own header (no Recommend button), so the tabs move up 55px.

**Fix:**
- `app/(app)/stats/year/[year]/page.tsx:61-64`: render the same header as `/stats` (h1 "Stats" +
  `RecommendAcrossButton`).
- Show "2026 in review" as an h2 under the year chips.

### S6. Confusing: Goals → Delete removes a goal at once, with no confirm and no undo
`shots/stats_tab_goals-light.png`
- Delete sits right next to "Change target".

**Fix:** `components/stats/goals-client.tsx:119-129`: on success, call `toastUndoable('Goal deleted.', …)`
the way `recommendations-client.tsx:129` does. The undo calls
`createGoal({ year, category: g.category, metric: g.metric, target: String(g.target) })`.

### S7. Confusing: the Target box shows "50", yet Add goal is disabled
`shots/stats_tab_goals-light.png`
- The grey "50" is a placeholder, but it reads as a value.

**Fix:** `goals-client.tsx:261`: change it to `placeholder="e.g. 50"`.

### S8. Rough: the goal line repeats its unit and will truncate on a phone
`shots/stats_tab_goals-light.png`
- It reads "All sections · titles finished **0** / 24 titles finished".
- A goal like "Video Games · hours played" plus "0 / 200 hours played" truncates the label.

**Fix:** `goals-client.tsx:39-44`:
- Put the label on its own line (no `truncate`).
- Put "0 / 24" right-aligned on the bar's line, without the unit, since the label already names the metric.

### S9. Rough: Taste is squeezed in two places
`shots/stats_tab_taste-light.png`
- The "Your taste profile" subtitle wraps to 4 lines beside the Refresh button.
- The date footnote breaks inside ISO dates ("2025-12-⏎31").

**Fix:**
- `stats/page.tsx:251`: use `flex-col sm:flex-row` for the header so Refresh drops below on phones.
- `components/stats/compare-periods.tsx:94`: format the dates with `formatYmd` and wrap each range in
  `whitespace-nowrap`.

### S10. Rough: the Drop rate subtitle is a formula
`shots/stats-light.png`
- It reads "Dropped ÷ (finished + retired + dropped)".

**Fix:** `stats-charts.tsx:190`: change it to "Of the titles you ended, the share you dropped". The formula
stays in the table.

---

## Compare

### CP1. Confusing: long titles become identical one-liners
`states/long-compare.png`
- Four rows read "The Extraordinarily …", and you cannot tell them apart.

**Fix:**
- `app/(app)/compare/[username]/page.tsx:149`: change `truncate` to `line-clamp-2 break-words`.
- Do the same in `components/together-client.tsx:112`, `app/(app)/feed/page.tsx:125` and
  `components/calendar-client.tsx:56`.

### CP2. Rough: the same titles appear twice, as big cards, and the gap is not shown
`shots/compare_demo2-light.png`
- "Biggest disagreements" (up to 10) is followed by "Titles you both have", up to `SHARED_LIST_LIMIT = 300`
  cards of 80px each, which repeats them. Between a real pair of users that can be thousands of pixels.
- The disagreement rows make you do the subtraction yourself.

**Fix:**
- `compare/[username]/page.tsx:84-88`: show the top 5 on phones.
- Add a gap badge to `SharedRow` (lines 154-163) using `d.gap`, which is already on `DisagreementView`, for
  example a muted "±3.0" pill.
- Lines 103-123: on phones, render "Titles you both have (11)" as a `<details>`, closed by default, with compact
  rows: no cover, one line "Title · You 8.8 · demo2 7.0".

### CP3. Confusing: "50%" compatibility reads as "half alike"
`shots/compare_demo2-light.png`
- The page needs "(50% means no link either way)" to explain itself.

**Fix:**
- `compare/[username]/page.tsx:60-64`: under the number, add a word: ≥70 "Very alike", 55-69 "Somewhat alike",
  45-54 "No clear pattern", under 45 "Opposite tastes".
- Drop the parenthetical.

### CP4. Confusing: the S-tier rows truncate ("Mob Psycho 1…")
`shots/compare_demo2-light.png`, `states/long-compare.png`

**Fix:** `components/compare-s-tier.tsx:28`: pass `fullTitle`, which has the same cause as A1.

---

## Watch together

### W1. Rough: the results take an extra tap, and one friend still gets a dropdown
`shots/together-light.png`
- Nothing shows until you tap "Find what we both want".
- With one friend (Tim's case), "With" is a one-option `<select>`.

**Fix:**
- `components/together-client.tsx`: run `compare()` in a `useEffect` on `[other, chosen]`, and drop the button
  (lines 77-80), as Tonight does.
- When `users.length === 1`, render "With demo2" as plain text instead of the select (lines 43-54).

(The chip state is covered in T2, and title truncation in CP1.)

---

## Feed

### F1. Confusing: feed rows look like the tappable cards elsewhere but do nothing
`shots/feed-light.png`, `states/empty_feed.png`
- You cannot open a friend's finish or add it.
- `FeedItem` has no `externalId` (`lib/data-feed.ts:44-56`).

**Fix:**
- Add `externalId`, plus the viewer's own `myActivityId` when they have the title, to `FeedItem`.
- In `app/(app)/feed/page.tsx:112-142`, wrap the row in `TitleLink` when `myActivityId` is set.
- Otherwise show a small outline `+ Want` button that calls `addToList(slug, result, 'PLANNED')`, like
  `compare-s-tier.tsx`.

### F2. Rough: one moment shows up as two cards
`shots/feed-light.png`
- Example: "demo2 watched Aliens 9.5" and "demo2 put in S tier Aliens", from the same day.

**Fix:**
- `feed/page.tsx:69-73`: merge neighbours with the same username, slug, title and day into one row:
  "demo2 watched · S tier", with both icons.

### F3. Rough: the bare number on the right doesn't say whose score it is

**Fix:** `feed/page.tsx:136-140`: prefix it with a muted "scored", or use the star form of `Score`.

---

## Settings

### ST1. Confusing: Revoke on a share link is one tap and can't be undone
`shots/settings_tab_sharing-light.png`
- The card says a revoked link answers "not found" for good, yet there is no confirm.
- On a phone, Revoke sits next to Copy and Open.

**Fix:**
- `components/settings-sharing.tsx:81-84`: use the two-step inline confirm from
  `recommendations-client.tsx:333-352`: "Revoke? [Yes, revoke] [Keep it]".
- Lines 72-79: show the "Copy" and "Open" labels on phones too; there is room.

### ST2. Confusing: "Changes save as you make them", except where they don't
`shots/settings_tab_themes-light.png`, `settings_tab_notifications-light.png`
- Dashboard tiles and the notification URLs need Save.
- The tiles' Save button is at the bottom of a 14-row list. Leave the tab without tapping it and you lose the
  changes silently.

**Fix:**
- `components/dashboard/tile-editor.tsx:270`: while there are unsaved changes, make the Reset/Cancel/Save row
  `sticky bottom-0 -mx-4 border-t bg-card px-4 py-3`.
- `components/settings-shell.tsx:82`: change the copy to "Most changes save as you make them."

### ST3. Rough: reordering Dashboard tiles is fiddly (a reorderable row)
`shots/settings_tab_themes-light.png`, `settings_tab_themes-dark.png`
- 14 rows of [grip][☐ label][↑][↓]. The arrows are 36px drawn with 4px between them.
- Moving the bottom tile to the top takes 12 taps.

**Fix:**
- `tile-editor.tsx:93`: change `CONTROL` to `h-10 w-10`.
- `tile-editor.tsx:285`: give `ROW` `gap-2`.
- The grip stays (dnd-kit's `touch-none` drag works on touch).
- With the sticky Save from ST2, this list becomes usable one-handed.

### ST4. Confusing: notification push chips have no visible on/off and no effect without a URL
`shots/settings_tab_notifications-light.png`
- Every chip is lavender with no check.
- They toggle and save even when neither an ntfy nor a Discord URL is set.

**Fix:**
- `components/settings-notifications.tsx:146-165`: use the T2 chip look.
- When `!saved.ntfyUrl && !saved.discordWebhook`, disable the group and say "Add an ntfy or Discord URL first".

### ST5. Rough: the one checkbox on Sharing's Compare card sits under 13 lines of prose
`shots/settings_tab_sharing-light.png`
- The same applies to the Activity feed card.

**Fix:**
- `components/settings-social.tsx:55-71`: put the toggle row right under the title.
- Keep the first sentence of each description.
- Move the rest into `<details><summary>What others see</summary>`.

### ST6. Rough: Accounts shows server setup instructions to everyone
`shots/settings_tab_accounts-light.png`
- Every user sees env-var names (STEAM_API_KEY, ANILIST_CLIENT_ID…), and the owner is told to "ask the owner".

**Fix:**
- `app/(app)/settings/page.tsx:46` already has `isOwner`. Pass it to `SettingsAccounts`.
- Non-owners see "Not available on this server" (`settings-accounts.tsx:190, 275, 376-385`).
- The owner sees the env-var steps inside a `<details>`.

### ST7. Rough: the tab strip hides 4 of its 7 tabs with no hint beyond a cut-off "N…"
`shots/settings-light.png`

**Fix:** `settings-shell.tsx:90`: add `edge-fade` and reuse `syncStrip` from `lib/tab-strip.ts`, as Fresh's
top bar does (`components/shell/top-bar.tsx:107`).

### ST8. Rough: the System jobs list is not in time order
`shots/settings_tab_system-light.png`
- The order runs 03:30, 04:00, 06:00, 04:30…

**Fix:** sort `jobs` by schedule before `components/settings-system.tsx:95`.

---

## Counts

| Grade | Count | Findings |
|---|---|---|
| Broken | 0 | none |
| Confusing | 21 | R1, R2, A1, A2, T1, T2, T4, C1, C2, D1, S1, S3, S6, S7, CP1, CP3, CP4, F1, ST1, ST2, ST4 |
| Rough | 22 | R3, R4, A3, T3, C3, C4, D2, S2, S4, S5, S8, S9, S10, CP2, W1, F2, F3, ST3, ST5, ST6, ST7, ST8 |

## The 5 changes that would most improve this area on a phone

1. **Show whole titles.**
   - Pass `fullTitle` in `add-row-list.tsx:30` and `compare-s-tier.tsx:28`.
   - Use `line-clamp-2` instead of `truncate` in the Compare, Together, Feed, Calendar and Diary rows.
   - This fixes Anime season (50 rows of "The Apotheca…"), Compare and the S tier (A1, CP1, CP4, D1).
2. **One answer row, with no fake "selected" button.**
   - In the add row, change `Watched` from filled to outline.
   - In the Recommendations inbox, put Want / Watched / Pass together in one bottom row, with no card inside the
     card.
   - This covers R1 and A2, and the Add and Search rows benefit too.
3. **A phone agenda on the Calendar.**
   - The month's items (or the tapped day's) sit right under the grid.
   - Empty months say so.
   - This covers C1 and C2.
4. **Make one-tap destructive actions safe.**
   - Inline confirm on Revoke share link (ST1).
   - Undo toast on Delete goal (S6).
   - Sticky Save for Dashboard tiles, so edits aren't lost (ST2).
5. **Put Stats Overview on a diet.**
   - 3-up streak tiles, no zero sections, collapsed empty charts.
   - One empty state for new accounts.
   - Distinct colours for Completed and Dropped.
   - A tab bar that fits.
   - This covers S1 to S5.
