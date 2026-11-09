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
| **Fixed, with a test that failed before** | <ul><li>Arena crash on a dropped connection, and a false "wins the round" (ranking #3)</li><li>A tab left open undid changes made elsewhere: title Save (library #2), tier list (ranking #1), franchise ranking (ranking #7), notification URLs (social #1), hidden sections</li><li>Read again kept the old progress (library #1)</li><li>The AniList pull was fooled by Up next drags (library #3)</li><li>A franchise placed by hand dragged its group along (ranking #2)</li><li>Steam revived put-down games (library #7)</li><li>Letterboxd "Blade Runner 2049" (library #6)</li><li>The review went to the wrong run (library #9)</li><li>A score at 00:01 missed the 23:59 finish (library #10)</li><li>The average rating (ranking #4)</li><li>The Now consuming count (ranking #5)</li><li>The lowest genre (ranking #6)</li><li>Job order after downtime (social #2)</li></ul> |
| **Left for later, with a reason** | <ul><li>Library #4 (an anime added before AniList knew its MAL id is duplicated later): needs the AniList id stored on the catalogue row (a schema change); rare.</li><li>Library #5 (AniList push rounding): can't happen until push keys are set on the server.</li><li>Library #8 (a TV rewatch vs season counts): needs a decision on what a rewatch tracks per season.</li></ul> |
| **Tim's call** | Social #3: Compare and Feed show a friend's score for a title they recommended to you before you've scored it. The design puts this "seal" in Stage 2. |

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

Not done yet (Rough, or bigger than a fix):
- **Ranking and organising (ui-B):**
  - collapse the Views builder on phones (10.2);
  - Undo for list removes (0.2, 8.2).
- **Shell and library (ui-A):**
  - let Fresh's brand row scroll away (S7);
  - one Favourites card on phones (D8);
  - Import sources as collapsible rows (I1);
  - single rules between title-page panels (T2).
- **Planning, insights, friends and settings (ui-C):**
  - send a recommendation from the Recommendations page (R2, a new feature);
  - sticky Anime season filters (A3);
  - the Stats year header (S5);
  - the Taste header (S9);
  - Compare's long shared list (CP2);
  - tappable Feed rows (F1), and merging duplicate Feed rows (F2);
  - a sticky Save in the dashboard tile editor (ST2);
  - the Sharing prose (ST5);
  - server notes shown to non-owners in Accounts (ST6);
  - the Settings tab strip fade (ST7).

## Try on your phone

1. Tap a text box (Add, Notes, a guess): the page should not zoom in.
2. Open ☰ and find Stats, Lists and Recommendations there; 🔍 opens Find in my hoard.
3. Up next: ⋮ on a row, then Reorder.
4. Recommendations: Watched / Want / Pass in one row; Pass, then Undo.
5. A TV show's popup: "Log episodes →".
