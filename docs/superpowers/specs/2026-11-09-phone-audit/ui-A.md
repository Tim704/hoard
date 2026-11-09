# Phone UI audit A: the shell and the library

Auditor A. Area: the shell in all four layouts, Dashboard, section pages, adding titles, Import, a
title (popup, full page, season tiers). Screenshots are 375px wide at 2×, so pixel positions in the
images ÷ 2 = CSS px.

Shots are under `/private/tmp/claude-501/-Users-timhufnagel-Desktop-BucketFillers/f40924d7-2d36-4b36-a7a8-5e5caf8ab4c0/scratchpad/audit/`:
`shots/` = `run2/shots/`, `states/` = `states1/`.

Grades: **Broken** (wrong or unusable) · **Confusing** (works, people will get it wrong) · **Rough**
(looks or feels off). Findings are ranked within each page, most important first.

---

## 1. Shell (top bar, drawer, user menu, notifications, search, palette, login)

### S1 · Confusing: no search on a phone's top bar
- Shots: `shots/dashboard-light.png`, `-minimal`, `-organised`, `-fresh`, `states/user-menu.png`
- On a phone, the only way to search is avatar, then Search (or Command palette). Search is a
  main action, but it is hidden under a round initial that reads as "account". Both top bars have
  plenty of empty room between HOARD and the avatar.
- **Fix:** add a ghost icon button (lucide `Search`, `aria-label="Search"`, same 40px `size="icon"`
  as the hamburger) just before the avatar in `src/components/shell/mobile-bar.tsx:70-72`, and in
  Fresh's phone row at `src/components/shell/top-bar.tsx:136-138` (`md:hidden`). It should open
  the **palette** (`useGlobalSearch().openPalette`). The palette already finds your own titles and
  pages, and it ends with "Search everything for …", so one button covers both searches.

### S2 · Confusing: half the pages hide in the avatar menu while the drawer is half empty
- Shots: `states/drawer.png`, `states/user-menu.png`
- In Classic and Minimal, the hamburger drawer lists only Dashboard, Franchises and the 7 sections,
  then shows about 400px of nothing. Tonight, Calendar, Diary, Stats, Lists, Tags, Views, the
  Friends pages and Import are in the avatar menu instead. That menu has about 20 entries and fills
  710 of 812px (it scrolls on an iPhone SE). People look for "Stats" in the ☰ menu and don't
  find it.
- **Fix:** on phones only, the drawer takes the menu's page links and the avatar menu keeps account
  things.
  - `src/components/shell/app-shell.tsx:116-120`: build `drawerGroups` from `nav.primary` plus the
    link entries of `nav.menu`'s `track`, `organise`, `friends` and `account` (Import) sections, as
    labelled groups. Use `NAV_GROUP_LABELS`; `NavList` already draws Organised-style group headings.
  - `mobile-bar.tsx:71`: pass a new `UserMenu` prop (`pagesInDrawer`) that skips the link sections
    in `user-menu.tsx:238-243`, leaving Notifications · Search · Command palette · Dark mode ·
    Settings · Log out.
  - Desktop sidebars and Fresh are unchanged. Fresh has no drawer, so it keeps the full menu.

### S3 · Confusing: "Search" and "Command palette" mean nothing on a phone
- Shot: `states/user-menu.png`
- The menu offers both. "Search" actually opens *Search everything*, which adds new titles from
  providers. "Command palette" is the one that finds titles already in your library. The names
  promise the opposite, and "Command palette" is desktop jargon.
- **Fix:** relabel in `src/components/shell/user-menu.tsx`. Line 181 `Search` → `Add a title`
  (keep the `/` shortcut). Line 287 `Command palette` → `Find in my hoard` (keep ⌘K). Use the same
  words in `global-search.tsx`'s header comment and FEATURES.md.

### S4 · Confusing: the palette's quick actions are unreachable by touch
- Shots: `states/palette.png`, `states/palette-typed.png`
- "Mark as done" and "Top of Up next" only render on the highlighted row
  (`src/components/command-palette.tsx:297-314`). Only arrow keys or `onMouseMove` (line 278) move
  the highlight, so on a phone only the first match ever shows them. Sticky touch-hover also paints
  a second row as if selected. In `palette-typed.png`, "Settings" and "Settings · Data" both look
  picked.
- **Fix:**
  - Lines 297-314: render the action buttons on every title row. Use
    `cn('shrink-0 gap-1', active ? 'flex' : 'hidden [@media(pointer:coarse)]:flex')` and drop the
    `active &&` guard.
  - Line 267: `hover:bg-accent/50` → `[@media(hover:hover)]:hover:bg-accent/50`. Apply the same to
    the `onMouseMove` highlight, or ignore pointerType `touch`.

### S5 · Rough: every palette page row has the same icon and the word "Page"
- Shot: `states/palette.png`
- Fourteen identical document icons, each with "Page" on the right, make a long grey list. The
  drawer next to it uses distinct icons for the same pages.
- **Fix:** `command-palette.tsx:108-120`: keep `link.icon` in `pages`. Lines 329-331: render
  `iconFor(icon)` instead of `FileText`, and drop the "Page" tag on phones (`hidden sm:inline`).

### S6 · Rough: the Search everything sheet puts the minor field first and grows under your thumb
- Shots: `states/search-open.png`, `states/search-typed.png` (the field jumps the same way the Add
  sheet does in `states/add-open.png` → `add-typed.png`)
- The search field sits at the very bottom edge. Above it, the secondary "Paste a link" field has
  a placeholder cut to "Paste a link (TMDB, IMDb, Ar". The sheet is auto-height and docked to the
  bottom, so when results arrive it grows upward and the field you're typing in jumps about 400px
  up.
- **Fix:** `src/components/search-everything.tsx`:
  - Line 296: on phones give the sheet a fixed height (`h-[92dvh] sm:h-auto`). Its top then never
    moves, and the field stays put.
  - Lines 303-306: put `SearchEverythingPanel` first and the link field second.
  - Better: drop `PasteLinkField` from the dialog and let the search field take links. In
    `SearchEverythingPanel.run` (lines 51-69), when `isLink(q)` call `resolveLink` and show
    `<LinkResult>`, the way `search-dialog.tsx:143-152` already does.
  - Line 264: placeholder `Paste a link…`. The provider list already appears in the /add header.

### S7 · Rough: Fresh's sticky header takes 101px of the phone screen
- Shots: `shots/*-fresh.png` (for example `shots/movies-fresh.png`)
- Brand row (56px) plus chip row (44px) stay pinned. That is 12% of an 812px screen, and 15% of
  an SE screen, on every page. The other layouts pin 57px.
- **Fix:** let the brand row scroll away and keep the chips. In
  `src/components/shell/top-bar.tsx:91`, `sticky top-0` →
  `sticky top-[calc(-3.5rem-env(safe-area-inset-top))] md:top-0` (the brand row's height, notch
  included), and set `--topbar-h` for Fresh phones to the chip row (`globals.css:287-289`, about
  `2.8125rem`). The avatar scrolls off with the brand. That is fine once S1's search button
  lives in the same row and also scrolls; scrolling up brings both back.

### S8 · Rough: an empty notifications sheet still offers "Mark all read"
- Shot: `states/notifications.png`
- A greyed "Mark all read" sits next to the close ×. "No notifications yet." doesn't say what
  would arrive here.
- **Fix:**
  - `src/components/shell/notifications-sheet.tsx:166-175`: render the button only when
    `notes.items.length > 0`.
  - Line 94: change the copy to "Nothing yet. Recommendations from friends and release reminders
    show up here."

### S9 · Rough: sheet headings are centred in some sheets and left-aligned in others
- Shots: `states/search-open.png`, `states/add-open.png` (centred) vs `states/popup-top.png`,
  `states/customize.png` (left)
- Every phone sheet docks to the bottom the same way, but titles jump between centred and left.
- **Fix:** add `text-left` to the `DialogHeader` in `search-everything.tsx:297` and
  `search-dialog.tsx:330`, as the popup (`title-popup.tsx:87`) and Customize
  (`customize-dashboard.tsx:55`) already do. Alternatively, change the default in
  `src/components/ui/dialog.tsx:62` to `text-left`.

### S10 · Rough: Register doesn't say the rules until you fail them
- Shot: `states/register.png`
- Username rules (3–32 letters, digits, `. _ -`) and the 8-character password minimum appear only
  as errors after submitting.
- **Fix:** in `src/components/auth-form.tsx:63-87`, when `mode === 'register'`, add a
  `text-xs text-muted-foreground` hint under each field. Username: "3–32 letters, numbers, dots,
  dashes or underscores". Password: "At least 8 characters". Tie each hint to its field with
  `aria-describedby`. Login is fine as it is.

---

## 2. Dashboard

### D1 · Confusing: a brand-new account sees eight "Nothing yet" cards and no next step
- Shot: `states/empty_dashboard.png` (2,037px of empty tiles)
- Nothing says "add your first title", and there is no Add or Import button. "Now consuming" says
  "Start something from your backlog" to someone with no backlog. The greeting says "Welcome
  back" on the first visit.
- **Fix:** in `src/app/(app)/dashboard/page.tsx`, compute
  `const fresh = allStats?.every((s) => s.total === 0)`. When it is true:
  - render a welcome card above the grid with "Your hoard is empty." and two buttons: **Add a
    title** (a small client button calling `useGlobalSearch().openSearch('')`) and **Import from
    another site** (link to `/import`);
  - skip the `cat:*` tiles and Now consuming;
  - at line 86, say "Welcome" instead of "Welcome back".

### D2 · Confusing: what you're in the middle of is two screens down
- Shots: `shots/dashboard-light.png` (Now consuming starts at about 1,750px),
  `states/long-dashboard.png`
- On phones, every section tile is a full-width card about 175px tall, in one column (8 tiles plus
  the overview). The two tiles you'd act on, Now consuming and Coming up, come after all of them.
- **Fix (small redesign; the user's own order is untouched):**
  - **Default order on phones:** Your hoard, then Now consuming and Coming up, then the sections.
    Add `defaultOrder && 'order-first lg:order-none'`-style order classes to `NowConsumingCard` and
    `ComingUpCard`, the way `OverviewCard` does at `src/components/dashboard/tiles.tsx:164`. Pass
    `defaultOrder` in from `page.tsx:51-63`.
  - **Section tiles two per row on phones:** in `page.tsx:104`, `grid-cols-1` → `grid-cols-2`.
    Give the full-width tiles `col-span-2 sm:col-span-1` (Overview, Now consuming; Coming up,
    Goals and Favourites are already `col-span-full`).
  - In `CategoryCard` (`tiles.tsx:340-396`), use the Organised padding on phones
    (`p-4 pb-2` / `px-4 pb-4`) and drop the headline to `text-xl` with the unit on its own line.
    The status line already turns into icons under 14rem (line 368).
  - Result: the page goes from about 2,900px to about 1,600px.

### D3 · Rough: the greeting cuts your own name ("Welcome back, dem…")
- Shots: `shots/dashboard-light.png` ("dem…"), `shots/dashboard-minimal.png` ("de…"),
  `states/empty_dashboard.png` ("empt…")
- The h1 shares its row with the two header buttons, so even a 4-letter name is truncated and the
  👋 never shows.
- **Fix:** in `src/app/(app)/dashboard/page.tsx:83-98`, make the header
  `grid grid-cols-[minmax(0,1fr)_auto] gap-x-3`. The h1 gets `col-span-2 sm:col-span-1`, so it
  has the full width on phones. The subtitle and the buttons share the second row. From `sm` the
  layout is the same as today (buttons `sm:row-span-2 sm:self-end`).

### D4 · Confusing: two unlabelled icon buttons in the header (a wand and sliders)
- Shots: `shots/dashboard-*.png`
- On a phone, the ✨ wand (Recommend across media) and the sliders (Customize) carry only a
  tooltip, and tooltips never open on touch. The wand in particular gives no hint that it asks the
  AI for picks.
- **Fix:**
  - `src/components/dashboard/header-button.tsx:37-58`: below `sm`, show a short label, e.g.
    `<span className="sm:hidden">{short}</span>`, with `short` = "Picks" / "Customize", and let
    the button size to its text.
  - D3's layout gives these buttons their own row. To keep that row to one line, hide the subtitle
    on phones (`page.tsx:88`, `hidden sm:block`).

### D5 · Broken: Now consuming and Favourites posters don't open the title
- Shots: `shots/dashboard-light.png` (Now consuming, Favorites)
- Tapping a poster goes to the whole section page (`href={`/${a.category}`}`), where you have to
  find the title again. Coming up, in the same dashboard, opens the title. The posters also show
  no title or progress; the name is only in a hover `title`.
- **Fix:**
  - `src/components/dashboard/tiles.tsx:214-218` and `285-288`: use
    `<TitleLink slug={a.category} id={a.id}>`, the same as `ComingUpCard` at line 103.
  - Optional, in the Now consuming poster: a thin progress bar like Fresh's card
    (`media-card.tsx:265-269`).

### D6 · Rough: "Your hoard" lands between Video Games and TV Shows
- Shot: `shots/dashboard-light.png`
- In the default order the overview moves first from `sm` (`sm:order-first`). On phones it stays
  fifth, in the middle of the section tiles, where it looks random.
- **Fix:** `src/components/dashboard/tiles.tsx:164`:
  `defaultOrder && 'sm:order-first lg:order-none'` → `defaultOrder && 'order-first lg:order-none'`.

### D7 · Rough: empty sections take a full card each
- Shots: `shots/dashboard-light.png` (Manga, Albums), `states/empty_dashboard.png`
- "Nothing yet / 0 ongoing 0 planned 0 done / No ratings yet" is 175px of zeros per section.
- **Fix:** in `CategoryCard` (`tiles.tsx:346-396`), when `empty`, render only the header and
  "Nothing yet" (`text-base`), and skip the status and rating lines. With D2's two-per-row grid,
  the empty tiles shrink to small cells.

### D8 · Rough: Favourites uses a whole card per section for one poster
- Shot: `shots/dashboard-light.png` (Books → Dune, Movies → Alien, Anime → Cowboy Bebop: three
  cards, about 180px each)
- **Fix:** in `FavouritesRow` (`tiles.tsx:269-309`), on phones render **one** card with a row per
  section: a small label ("Books", linked), then its `grid-cols-4` posters. Keep the per-section
  cards from `sm`, e.g. two render paths with `sm:hidden` / `hidden sm:grid`.

### D9 · Rough: the Goals tile cuts its own label and repeats the unit
- Shot: `shots/dashboard-light.png` ("All sections · titles fini…  0 / 24 titles finished")
- **Fix:** in `src/components/stats/goals-client.tsx:40` (`GoalBar`, shared with Stats → Goals,
  auditor C's area), show only the section ("All sections" / "Books"). The right-hand count
  already names the metric. Alternatively, let the row wrap (`flex-wrap`).

### D10 · Rough: different words for the same things
- Shots: `states/customize.png` ("Overview"), `shots/dashboard-light.png` ("Your hoard", "5/7
  domains", "across all seven domains")
- Customize calls the tile "Overview", but on the page it is "Your hoard". The dashboard says
  "domains", while the rest of the app (Settings, Goals, the menu) says "sections".
- **Fix:**
  - `src/lib/dashboard-tiles.ts:144`: `'Overview'` → `'Your hoard'`.
  - `tiles.tsx:154`: `'domains'` → `'sections'`.
  - `page.tsx:90`: "…across all seven sections."

*Customize sheet (`states/customize.png`): no phone problems. Its rows, sticky footer and disabled
Save read well.*

---

## 3. Section pages (Books, Movies, TV, Anime, Manga, Games, Albums)

### L1 · Confusing: on phones, a section has no visible way to its tier list or Up next
- Shots: `shots/books-*.png`, `states/more-menu.png`
- In every layout, phones fold **Tiers** (and AI Critic, and the view switch) into "⋯"
  (`src/components/section/section-toolbar.tsx:48-61`). Tiers is Hoard's ranking feature, but on a
  phone you only find it by opening a generic overflow menu. Up next is only reachable through a
  small grey "Reorder" on the Unread heading (L5).
- **Fix:** in `src/components/category-client.tsx:173-183`, add phone-only links to the meta line,
  next to Anime's existing "Browse this season":
  `7 items · Tiers · Up next` (`sm:hidden`, same `tap-area underline` style, to `/${slug}/arena` and
  `/${slug}/arena?tab=queue`). Leave the ⋯ entries as they are.

### L2 · Confusing: the empty section points at a button that isn't there
- Shots: `states/empty_books.png`, `shots/music-light.png`
- "Use “Add Book” to search OpenLibrary". The button above says "Add" in Classic and is a bare "+"
  in the other three layouts. The empty box has no button of its own.
- **Fix:** in `src/components/category-client.tsx:200-206`, put a `SearchDialog` with the default
  trigger ("+ Add Book") inside the empty state (it is reusable; `library` is empty). Change the
  copy to "Search {config.source} to add your first {singular}."

### L3 · Rough: Classic cards say the status three times and show no progress
- Shots: `shots/books-light.png`, `shots/tv-light.png`, `shots/anime-light.png`,
  `states/long-books.png`
- Under a "Reading" heading, each Classic card repeats the status as a poster chip *and* a pill
  badge. That costs a line on every card of a 2-column phone grid. Meanwhile an ongoing book shows
  no "120/240 pages", which Organised and Fresh do show. Because the badge group is pushed down
  (`mt-auto`), a card without a rating also sits its badge lower than its neighbour's (Snow Crash
  vs Hyperion).
- **Fix:** in `src/components/media-card.tsx` `PlainCard` (lines 102-141), use the
  `inStatusSection` prop it already receives. When true:
  - skip `<StatusBadge>` (line 135);
  - for `CONSUMING`, show `useCardBadge(activity)`'s progress pill instead (as `OneBadgeCard` does
    at line 205);
  - drop `mt-auto` (line 134), so the rows line up.

### L4 · Rough: the ⋯ menu's text doesn't line up, and Classic shows the same icon twice
- Shot: `states/more-menu.png`
- "Tiers", "Roast my taste" and "Recommend a gem" start 8px to the right of "Grid view", "List
  view" and "Compact view". `DropdownMenuItem` already has `gap-2`, and the icons add `mr-2` on top.
  In Classic, Tiers uses `Rows3`, which is also the List view icon, two rows below.
- **Fix:** in `src/components/section/section-toolbar.tsx`:
  - drop `mr-2` from the icons at lines 225 and 235 (keep it on the radio items, line 247, which
    have no gap);
  - in the menu, always use `Trophy` for Tiers (line 225). The bar's labelled button can keep
    `Rows3`.

### L5 · Rough: "Reorder" doesn't say what it reorders
- Shot: `shots/books-light.png` (on the Unread heading)
- It opens the Up next queue on the Tiers page, but reads like "reorder these cards here".
- **Fix:** in `src/components/category-client.tsx:226`, change the label `'Reorder'` →
  `'Up next order'`, or drop it once L1 adds the Up next link.

---

## 4. Adding titles (the Add sheet, Search everything, /add)

### A1 · Confusing: result titles are cut to a dozen letters
- Shot: `states/add-typed.png` ("Dune Messiah…", "Children of Du…", "God Emperor …", "Frank
  Herbert · 1…")
- On phones, the two stacked buttons (✓ Read / + Want to read) take about 45% of each row, so
  similar editions can't be told apart and the year is cut off. You can add the wrong one.
- **Fix:** `AddResultRow` already has a wrapping layout (`fullTitle`, used by Recommendations).
  Make it the phone default in `src/components/add-row.tsx`:
  - line 164: `fullTitle ? 'flex-wrap items-start' : 'flex-wrap items-start sm:flex-nowrap sm:items-center'`;
  - line 180: `line-clamp-2 sm:truncate` (instead of `truncate`);
  - line 219: buttons `w-full flex-row` below `sm`, two equal `flex-1` buttons under the title
    (`'flex w-full gap-1.5 sm:w-auto sm:shrink-0'`).
- This also fixes the rows in Search everything and on /add, which use the same component.

### A2 · Rough: the Add sheet jumps as you type, and its results scroll inside a scrolling sheet
- Shots: `states/add-open.png` → `states/add-typed.png`
- Opened, the sheet is short and the field sits at 692px. Once results land, the sheet grows and
  the field leaps to 286px under your thumb. The results list has its own `max-h-[50dvh]` scroll
  inside the sheet's scroll. Only about 3½ results show, behind a sticky footer.
- **Fix:** in `src/components/search-dialog.tsx`:
  - line 329: add `h-[92dvh] sm:h-auto` (a fixed-height sheet on phones);
  - line 458: `max-h-[50dvh]` → `sm:max-h-[50vh]` only, so on phones the sheet scrolls as one and
    the footer (line 503, already sticky) stays put.
- Apply the same to Search everything (S6).

### A3 · Confusing: an unlabelled ✓≡ icon next to the search field
- Shot: `states/add-open.png`
- The "Select several" button is icon-only below `sm` (`search-dialog.tsx:426-427`). Nobody will
  guess it turns on multi-select.
- **Fix:** on phones, move it out of the field's row into the line under it, beside "Scan a
  barcode…", as a text link styled like that one ("Select several").
  `search-dialog.tsx:412-428` → render it in the `slug === 'books'` row's position, for every
  section.

### A4 · Rough: keyboard instructions on a touch screen
- Shot: `states/add-open.png` ("Use ↑/↓ and Enter to pick a result.")
- **Fix:** in `search-dialog.tsx:337`, wrap the second sentence in
  `<span className="hidden sm:inline">`.

### A5 · Rough: /add lists the providers twice and has two near-identical fields
- Shots: `shots/add-light.png`, `shots/add-fresh.png`
- The header lists nine providers, the link field repeats them in a placeholder cut mid-word ("…,
  Ar" / "…, Anil"), and the main search field comes second.
- **Fix:**
  - Same as S6: one field that takes a title or a link (`src/components/add-by-link.tsx:28-33`
    renders only `SearchEverythingPanel` once it detects links), with the shorter placeholder from
    S6.
  - `src/app/(app)/add/page.tsx:33-36`: "Search every section, or paste a link from TMDB, IMDb,
    AniList, Goodreads, Letterboxd and more."

---

## 5. Import

### I1 · Rough: ten instruction cards, about 3,100px of scrolling, to find your one source
- Shots: `shots/import-light.png`, `shots/import-dark.png`, `states/empty_import.png`
- On phones the `md:grid-cols-2` grid becomes one column of ten full cards, each with bullets,
  warnings and a button. The common sources (Goodreads, Letterboxd) sit 1,000–1,500px down,
  behind a Hoard-CSV restore that a newcomer doesn't need first.
- **Fix (redesign sketch)** in `src/components/import/import-client.tsx:359-417`:
  - On phones, render each source as a `<details>` row: the name plus `s.what` as the summary
    (about 56px), with the bullets, warnings and button inside. Ten rows fit on one screen. Keep
    the cards from `md`.
  - Reorder `SOURCES` (line 50) by what people use: Goodreads, StoryGraph, Letterboxd, Trakt,
    AniList, MyAnimeList, Steam, Paste a list, Any other CSV, then Hoard CSV last.

### I2 · Confusing: unavailable sources look available and show server jargon
- Shots: `shots/import-light.png` (Steam, Trakt, Paste a list, Letterboxd's TMDB warning)
- Tim's friend sees "(STEAM_API_KEY)", "(TRAKT_CLIENT_ID)" and "(GEMINI_API_KEY)" in amber
  between the working sources, next to greyed buttons.
- **Fix:**
  - `import-client.tsx:378-386`, `461-467`: drop the env-var names from the copy; the owner sees
    them in Settings → System.
  - Sort unavailable sources to the end of the list (or into a closed "Not set up on this server"
    `<details>`).

---

## 6. A title: the popup

### P1 · Confusing: a TV show's popup can't log an episode
- Shot: `states/popup-top.png` ("26 / 36 episodes  Tracked by seasons")
- For a show you're watching, the one thing you open it for is "+1 episode". The popup shows
  progress as read-only with the hint "Tracked by seasons", but no seasons and no link to them. You
  have to find "Open full page" and scroll about 1,600px (T1).
- **Fix:**
  - `src/components/progress-field.tsx:179-183`: when `readOnlyHint` is set and an `onOpenSeasons`
    callback is passed, render the hint as a link button, "Log episodes →".
  - `src/components/title/title-popup.tsx:116-124`: pass `onOpenSeasons={() => { editor.handOff();
    onClose(); router.push(href + '#seasons'); }}`.
  - Give the Seasons panel `id="seasons"` (`title-page.tsx:254`).

### P2 · Rough: a solid red Remove dominates the popup's footer
- Shots: `states/popup-top.png`, `states/popup-bottom.png`
- In the thumb zone, the loudest button is the destructive one. It is solid red and as big as
  Save. Remove has an undo toast, so it isn't dangerous, but it draws the eye away from Save.
- **Fix:** in `src/components/title/title-popup.tsx:130`, `variant="destructive"` →
  `variant="ghost"` with `className="text-destructive hover:bg-destructive/10"`. Keep the label
  and icon. Save stays the one filled button.

---

## 7. A title: the full page

### T1 · Confusing: Progress and Seasons come last, about two screens down
- Shots: `shots/tv_title_demo_activity_tv_expanse-light.png` (Progress at about 1,510px, Seasons
  at about 1,630px), `-dark`
- On a phone the order is: basics, Notes, History, Tags, Lists, Friends, **Progress, Seasons**,
  More by. For anything in progress (episodes, pages, chapters), the control you came for is
  below five panels that are usually empty.
- **Fix:** in `src/components/title/title-page.tsx`, move the Progress / Seasons / Format block
  (lines 237-286) up to sit right after `</header>` (before line 202's Notes | History). The order
  becomes: basics, progress, seasons, then notes and the rest. Desktop benefits too; if not
  wanted there, wrap the page body in `flex flex-col` and give that block `order-first
  md:order-none` (the container at line 132 is `space-y-6`, so switch it to `flex flex-col
  gap-6`).

### T2 · Rough: stacked bands with grey gaps and double rules
- Shots: `shots/tv_title_demo_activity_tv_expanse-light.png` (middle), `-dark.png` (pairs of
  lines with nothing between them)
- Each panel is a full-bleed band with `border-y`, separated by 24px gaps of page background. On
  a phone that reads as two hairlines, a grey strip, two hairlines. The effect is loudest in dark
  mode, and stronger still around near-empty bands ("History: No history yet.").
- **Fix:** on phones, let bands abut with a single rule:
  - `PANEL` (`title-page.tsx:66-67`): `border-y` → `border-b sm:border-y`;
  - the wrappers at lines 132 / 202 / 223 / 237: `gap-6` → `gap-0 sm:gap-6` (and `space-y-0
    sm:space-y-6` for the page column, keeping the header's own spacing).
- Optionally hide History on phones while it's empty (line 215 branch).

### T3 · Rough: the header says "3 seasons · 36 episodes" twice
- Shot: `shots/tv_title_demo_activity_tv_expanse-light.png` (meta line, then "Episodes: 36",
  "Seasons: 3")
- **Fix:** in `src/components/title/title-fields.tsx:111-118`, skip the `episodes`,
  `episodeCount` and `seasonCount` rows when `mediaSubtitle` already includes them (TV and anime).
  Or drop those rows from `MediaExtras` entirely, since the meta line always has them.

### T4 · Confusing: a season row's "All" button is unexplained
- Shot: `shots/tv_title_demo_activity_tv_expanse-light.png` (Seasons: `3 / 13  [+1] [All] ⌄`)
- "All" marks every episode watched in one tap, with no label saying so and no undo.
- **Fix:** in `src/components/tv-seasons.tsx:262-273`, label it "✓ All" with
  `aria-label={`Mark all ${total} episodes of ${row.name} watched`}`. After the change, show an
  undo toast with the previous count (`undo-toast.ts` has the pattern).

---

## 8. Season tiers page (`/tv/seasons/…`)

### ST1 · Rough: the unranked season sits under four empty tier rows
- Shots: `shots/tv_seasons_demo_activity_tv_expanse-light.png`, `-dark`
- The season you need to place (Unranked, with an "A?" suggestion) is about 300px below four
  empty B–F rows. The duel ("Which season is better?") comes after that. The intro also uses
  "The Arena" with no explanation.
- **Fix:**
  - Page copy at `src/app/(app)/[category]/seasons/[activityId]/page.tsx:34-37`: "…S to F. Not
    sure? Compare two seasons below."
  - The tier rows and tray are the shared `tier-board.tsx` (auditor B's area): collapse empty
    tiers to a thin row on phones, and give the icon-only "Accept all suggestions" wand
    (`tier-board.tsx:267-279`) a short label below `sm`. Listed here so B can check it isn't
    missed.

---

## Not reviewed (no screenshot)

Import review after choosing a file (`import-review.tsx`), the section list and compact views,
and the Add sheet's manual-entry form. None of these appear in the shots.

---

## The 5 changes that would most improve this area on a phone

1. **A real phone shell.** Add a 🔍 button in the top bar that opens the palette, which falls
   through to Search everything. Move the menu's pages into the ☰ drawer, so the avatar holds only
   account things. Rename the menu items "Add a title" and "Find in my hoard". (S1, S2, S3, S4)
2. **A phone dashboard.** Show the full-width greeting with labelled buttons, then Now consuming
   and Coming up first, then the section tiles two per row, with empty tiles compact. Make the
   posters open their titles. Give a new account a welcome card with Add and Import. (D1–D7)
3. **Add-title sheets that hold still.** Use a fixed-height sheet with the field on top and one
   scroll. Stack result rows so titles wrap and the two buttons sit below. Use one field for a
   title or a link, and label "Select several". (A1, A2, A3, S6, A5)
4. **Progress first on a title.** On the full page, move Progress and Seasons directly under the
   basics. In the popup, turn "Tracked by seasons" into "Log episodes →". Band the panels with
   single rules. (T1, P1, T2)
5. **Sections that show their tools.** Add phone links "Tiers · Up next" under the heading. Give
   the empty state its own "+ Add Book" button. Let the Classic card swap its redundant status pill
   for progress. (L1, L2, L3)
