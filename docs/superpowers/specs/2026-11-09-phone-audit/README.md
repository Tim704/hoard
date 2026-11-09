# Phone and bugs audit (2026-11-09)

Tim asked for "no bugs, and a phone UI that is intuitive and looks good" across the whole app.
This folder holds what the audit found and what happened to each finding. The plan was approved
on 2026-11-09.

## How it was found

- **Phone checks.** Every page was measured at 375px in all four layouts and at 360px in Classic.
  The checks were: sideways scroll, text boxes under 16px (iPhone zoom), controls under 40px to tap,
  text under 12px, and an axe-core pass (serious and critical) in light and dark. These checks are
  now part of `npm run smoke` (`e2e/phone-checks.mjs`), so they stay true.
- **Screenshots.** Three auditors read the screenshots of every page, plus menus, dialogs, a new
  account and pages with very long titles. Their reports are `ui-A.md` (shell and library),
  `ui-B.md` (ranking and organising) and `ui-C.md` (planning, insights, friends and settings), written
  to the brief in `ui-audit-brief.md`.
- **Code review.** Three reviewers read the code for correctness. Their reports are
  `bugs-library.md`, `bugs-ranking.md` and `bugs-social.md`.

Safari's engine (Playwright WebKit) can't run on this Mac (macOS 12), so the checks use Chrome only.
Check the keyboard on a real iPhone (see "Try on your phone").

## Bugs: 20 found

| Status | Bugs |
|---|---|
| **Fixed, with a test that failed before** | <ul><li>An anime added before AniList knew its MAL id was duplicated later (library #4): the `al-` row now moves to the MAL id</li><li>AniList push rounding read back as a conflict (library #5)</li><li>A TV rewatch kept the old season counts (library #8): Watch again starts the seasons again, and Undo restores them</li><li>Compare and Feed showed a friend's score on a title they recommended to you before you'd scored it (social #3): now hidden behind a lock until you score it</li><li>Arena crash on a dropped connection, and a false "wins the round" (ranking #3)</li><li>A tab left open undid changes made elsewhere: title Save (library #2), tier list (ranking #1), franchise ranking (ranking #7), notification URLs (social #1), hidden sections</li><li>Read again kept the old progress (library #1)</li><li>The AniList pull was fooled by Up next drags (library #3)</li><li>A franchise placed by hand dragged its group along (ranking #2)</li><li>Steam revived put-down games (library #7)</li><li>Letterboxd "Blade Runner 2049" (library #6)</li><li>The review went to the wrong run (library #9)</li><li>A score at 00:01 missed the 23:59 finish (library #10)</li><li>The average rating (ranking #4)</li><li>The Now consuming count (ranking #5)</li><li>The lowest genre (ranking #6)</li><li>Job order after downtime (social #2)</li></ul> |

All 20 are fixed. Rulings made along the way: a TV rewatch starts every season's count at 0
(the old counts come back on Undo); library #4 is fixed without a schema change, by moving
the `al-` row to the MAL id when AniList reports both.

## Phone UI: 108 findings (3 Broken, 48 Confusing, 57 Rough)

All three Broken findings and most Confusing ones are done:

| Area | What changed |
|---|---|
| Everywhere | <ul><li>16px text boxes</li><li>40px tap areas</li><li>12px minimum text</li><li>Contrast</li><li>Left-aligned sheet headings</li><li>No sticky hover on touch</li><li>Add rows wrap the title and put the buttons below</li></ul> |
| Shell | <ul><li>A search button in the phone top bar</li><li>The drawer lists every page in groups</li><li>Menu items renamed "Add a title" and "Find in my hoard"</li><li>Quick actions in Find in my hoard work by touch</li></ul> |
| Dashboard | <ul><li>Greeting on its own line</li><li>Labelled buttons</li><li>Now consuming and Coming up first</li><li>Two section tiles a row</li><li>A welcome for a new account</li><li>Posters open their title</li></ul> |
| Sections, Add, Import | <ul><li>Tiers and Up next links on phones</li><li>Add sheets that hold still</li><li>An Add button in the empty state</li><li>Plainer Import</li></ul> |
| A title | <ul><li>Progress, Seasons and Format first</li><li>"Log episodes →" from the popup</li><li>A quiet Remove</li><li>No repeated meta</li></ul> |
| Ranking | <ul><li>Reorderable rows: a ⋮ menu and a Reorder mode</li><li>Tier list: tray first, a labelled "Place n in suggested tiers", slim empty tiers</li><li>Each tab names itself</li><li>Arena modes explained</li></ul> |
| Lists, Tags, Views | <ul><li>Three equal list tabs</li><li>Only the classics this server can build</li><li>Tag results first</li><li>Picked toggles look picked</li></ul> |
| Plan and insights | <ul><li>Tonight shows its picks first</li><li>Calendar month list on phones</li><li>Diary rows with one Edit</li><li>Stats: an empty state, three tiles across, no zero sections, distinct colours, tabs that fit, Undo on goal delete</li></ul> |
| Friends and settings | <ul><li>Recommendations: one answer row, full-width verdict</li><li>Compare: compatibility in words, two-line titles</li><li>Watch together: one friend as text</li><li>Share links ask before Revoke</li><li>Notification chips show on and off</li></ul> |

The rest, done in a second pass:

| Area | What changed |
|---|---|
| Shell and library | <ul><li>Fresh's brand row scrolls away on phones; the chips stay (S7)</li><li>One Favourites card on phones (D8)</li><li>Import sources as rows that open in place (I1)</li><li>Title-page panels touch, one rule between them (T2)</li></ul> |
| Ranking and organising | <ul><li>The Views builder folds behind Edit on phones (10.2)</li><li>Undo after removing a title from a custom or pasted list, or unranking a franchise (0.2, 8.2)</li><li>The Arena says why a pair comes from your scores (3.2)</li></ul> |
| Planning and insights | <ul><li>Sticky Anime season filters (A3)</li><li>The Stats year page keeps the Stats header (S5)</li><li>The Taste header stacks on phones (S9)</li></ul> |
| Friends | <ul><li>**Send a title** on the Recommendations page (R2)</li><li>Compare: the shared list folds, and each disagreement shows its size (CP2)</li><li>Feed rows open your copy (F1), and a finish plus its S-tier placement is one row (F2)</li></ul> |
| Settings | <ul><li>The dashboard tiles' Save sticks to the bottom while there are changes (ST2)</li><li>Sharing says what others see in a fold (ST5)</li><li>Server setup notes only for the owner (ST6)</li><li>The tab strip fades where more tabs are (ST7)</li></ul> |

Left as they are, on purpose: Classic's cards keep no badges (the smoke test pins that design),
and the tile editor's arrows were already 40px to tap (ST3).

## Try on your phone

1. Tap a text box (Add, Notes, a guess): the page should not zoom in.
2. Open ☰ and find Stats, Lists and Recommendations there; 🔍 opens Find in my hoard.
3. Up next: ⋮ on a row, then Reorder.
4. Recommendations: Watched / Want / Pass in one row; Pass, then Undo.
5. A TV show's popup: "Log episodes →".
6. Recommendations → **Send a title**: search, pick, send.
7. Fresh layout: scroll a page; the brand row goes, the chips stay.
