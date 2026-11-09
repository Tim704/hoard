# Phone UI audit B: ranking and organising

Auditor B. Pages: tier list, Up next, Arena, year Arena, Franchises, Lists (index, custom, reference),
Tags, Views, public share page. Screenshot prefixes:
`shots/` = `scratchpad/audit/run2/shots/`, `states/` = `scratchpad/audit/states1/`
(scratchpad = `/private/tmp/claude-501/-Users-timhufnagel-Desktop-BucketFillers/f40924d7-2d36-4b36-a7a8-5e5caf8ab4c0/scratchpad`).
Line numbers are against HEAD `09caca9` on `bugs-wave`. The screenshots were taken just before
`77ca25f` (phone basics), so every finding was checked against the current code too.

Counts: **Broken 2 · Confusing 12 · Rough 12.**

---

## 0. Reorderable rows: phone redesign (Up next, custom lists, franchise ranking, franchise watch order)

All four use `SortableRankList` (`src/components/sortable-rank-list.tsx`). Callers:
`up-next.tsx:210`, `custom-list-client.tsx:118`, `franchises-client.tsx:207`, `franchise-dialog.tsx:264`.

### 0.1 Titles are cut to a few letters (Broken)
`shots/books_arena_tab_queue-light.png` ("Founda…"), `shots/movies_arena_tab_queue-light.png`
("Stal…"), `states/long-queue.png` ("The Ext…"), `states/long-list.png` ("The Extraordi…"),
`shots/lists_demo_list_comfort-light.png`.
You can't tell which title a row is. The row is one line (`:123`) holding grip (24px) + rank (28) +
cover (44) + stacked arrows (28) + × (24) + five 12px gaps, with the title `truncate` (`:158`) in
whatever space is left over. At 375px that leaves **113px** in a custom list, **~75px** in Up next
(the "Read" button, `up-next.tsx:216-225`), **~52px** with "Watched", and **~50px** in franchise
ranking (the rating star sits in the row too). Inside the franchise dialog it's narrower again.

### 0.2 Remove is one unguarded tap next to the arrows, with no undo (Confusing)
`shots/lists_demo_list_comfort-light.png`, `states/list-edit.png`.
The × (`:199-210`) is 12px from the down arrow and removes at once: `custom-list-client.tsx:90-100`
and `franchises-client.tsx:213` show no toast and offer no undo, though Hoard offers Undo after
removes everywhere else (`undo-toast.ts`, spec 1.6). Its label is also wrong in custom lists:
"Remove X from ranking" / title "Remove from ranking" (`:204-205`).

### Proposed phone layout (below `sm`; the desktop row stays as it is)

```
Titles · 12                                   [⇅ Reorder]
┌──────────────────────────────────────────────────────┐
│ 1  ▯  The Extraordinarily Long and Winding        ⋮  │   ⋮ = 44px, opens a menu:
│    ▯  Title of a Book That Never…                    │     Move to top
│       Movie · 1979                                   │     Move up
│       [✓ Read]            ← Up next only, own line   │     Move down
└──────────────────────────────────────────────────────┘     Move to bottom
                                                             ───────────
                                                             Remove from list   (red)
After tapping "Reorder", every row becomes:
│ 1  ▯  The Extraordinarily Long and     [ ▲ ] [ ▼ ]  │   two 44×44 buttons side by side
│       Winding Title of a Book…                       │   (never stacked), actions hidden
                                                    [Done]
```

- **Read mode (default):** no grip, no arrows, no × on the row. Rank (w-6) + cover (40) + text +
  one 44px `MoreVertical` menu button (`DropdownMenu`, already used in `views-client.tsx`). The title
  wraps: `line-clamp-2 break-words sm:truncate`. That leaves ~177px × 2 lines instead of 50–113px × 1.
  The menu covers big jumps (Move to top/bottom) in two taps, and puts Remove out of fat-finger
  reach. Give the menu items `min-h-11` on touch.
- **Reorder mode:** a `Reorder`/`Done` toggle above the list (`sm:hidden`, only with 2+ items). Each
  row shows ▲ and ▼ as two separate 44×44 buttons in a row, so their tap areas never overlap; the
  ⋮ menu and the actions are hidden. That leaves the title ~137px × 2 lines. After a move, flash
  `ring-2 ring-primary/60` on the row for ~600ms and `scrollIntoView({ block: 'nearest' })` so your
  eye can follow it.
- **Actions** (Up next's "Read" plus its RatingStep): on phones, put them on their own line under
  the text. In the flex-wrap `li` that's `order-last basis-full pl-[4.5rem] sm:order-none
  sm:basis-auto sm:pl-0` on a wrapper around `{actions}` (`:197`). No API change.
- **Undo:** after Remove, show "Removed "X" from the list." with an **Undo** button (8s, like
  `toastRemoved`). For franchise ranking, undo is just `persist(prev)`. For custom lists, add a
  `restoreListItem(listId, { category, mediaId, position })` action, since
  `removeListItem` hard-deletes (`lists.ts:194-206`).
- **Code shape:** add `moveTo(index, to)` next to `move` (`:71-75`) and a `removeLabel` prop
  ("Remove from list" / "Remove from ranking"). Desktop keeps the grip, arrows and × behind
  `hidden sm:flex`; the phone controls sit behind `sm:hidden`, so it's all CSS and SSR-safe.
  Up next can call `moveToQueueTop` (`actions/queue.ts:62`) for "Move to top". Moves still go
  through the existing whole-order saves; mind `bugs-ranking.md` #7 for franchises.

---

## 1. Tier list (`/[category]/arena`, Tiers tab)

### 1.1 The Unranked tray, the thing you came to sort, is at the very bottom (Confusing)
`shots/books_arena-light.png`, `shots/anime_arena-light.png`, `states/long-tiers.png`.
New finishes land in "Unranked", under all six tiers (`tier-board.tsx:249-292`). Each placed title is
~117px tall on a phone, so with 60 placed books the 2 new ones are ~7,000px down, and nothing at
the top says they're there.
**Fix:** on phones, show the tray first when it has items. Wrap both sections in
`flex flex-col` and give the tray section `order-first sm:order-none`. The tier picker and the "A?"
chip make drag unnecessary for tray → tier. Optionally add a one-line link at the top when the tray
is shown last on desktop.

### 1.2 "Accept all suggestions" is a bare wand icon on phones (Confusing)
`shots/books_arena-light.png` (icon right of "Score these · 1").
A magic-wand button with no text (`tier-board.tsx:268-280`, `w-9 px-0 … hidden sm:inline`) next to
an amber text link: people won't guess it moves every title into its suggested tier.
**Fix:** on phones, drop the icon button from the heading row and put a full-width button as the
first line of the tray: `Place {n} in their suggested tiers` (`sm:hidden`, `variant="outline"`). Keep
the current button for `sm+`.

### 1.3 Rows in the same tray lay out differently, and the title gets squeezed (Rough)
`states/long-tiers.png` ("The Extra…", "1992 · Demo …" vs the row above it at full width),
`shots/books_arena-light.png` (Snow Crash).
The title block is `basis-48` (`tier-board.tsx:424`). When the controls fit beside it (no
suggestion chip, no arrows), they stay on line 1 and the title shrinks to ~9 letters. When they
don't fit, they wrap and the title gets the full width.
**Fix:** `basis-full sm:basis-48` on that div, so on phones every row is title line + controls line,
every time.

### 1.4 ~310px of header and ~290px of empty tiers before any content (Rough)
`states/tiers-top.png`, `shots/books_arena-light.png`.
Back link, h1, a two-line description, tabs and the Download/Share row fill the first 310px. Each
empty tier is still a 73px box (`min-h-[4.5rem]`, `tier-board.tsx:368`), so B–F empty = ~370px.
**Fix:** use `min-h-12 sm:min-h-[4.5rem]` on tier containers (still a fine drop target); move
`<TierShare>` below the board on phones (`page.tsx:92-93`: render it after `TierBoard` with
`order-last sm:order-none`, or just after it); hide the description on phones (`hidden sm:block`,
`page.tsx:48`). See 2.1 for the description text.

### 1.5 Empty board: no next step, and "Share link" is live for nothing (Rough)
`states/empty_books_arena.png`.
"Nothing to tier yet — finish something first." (`tier-board.tsx:115`) has no link. Download PNG is
disabled but Share link isn't (`tier-share.tsx:89` vs `:93`), so you can share an empty list.
**Fix:** add a link `Go to {Books}` → `/${slug}` under the text; disable Share link when
`placed === 0` (or hide TierShare entirely when the board is empty).

---

## 2. Up next (`?tab=queue`)

### 2.1 The page is still titled "Tier your books" on Up next and Arena (Confusing)
`shots/books_arena_tab_queue-light.png`, `shots/movies_arena_tab_queue-light.png`,
`shots/books_arena_tab_arena-light.png`.
The section page's "Reorder" link (`category-client.tsx:226`) lands on a page headed "Tier your
books / Place every finished book in a tier…", which describes neither the queue nor the duels.
**Fix:** per-tab h1 + line in `[category]/arena/page.tsx:47-51`:
Tiers → "Tier your books" (current text); Up next → "Up next" / "Books you plan to read, in the
order you'll get to them."; Arena → "Arena" / "Pick the better of two to settle the order inside a
tier."

(The row truncation on this tab is 0.1.)

---

## 3. Arena (`?tab=arena`)

### 3.1 The ranking shows an unlabelled "1200" that eats the title (Confusing)
`shots/books_arena_tab_arena-light.png`, `states/arena-order.png` ("Neuromanc…  ★8.5/10  1200").
The Elo (`ranking-list.tsx:77-79`) has no label; on a phone it's jargon and takes 56px from the
title.
**Fix:** `hidden sm:inline` on that span and `title="Arena score"` on desktop; on phones, put the
duel count where it already is (`:63-67`).

### 3.2 Order mode duels a title that isn't in the ranking under it, and the modes aren't explained (Confusing)
`states/arena-order.png`: Hyperion (Unranked) vs Neuromancer; the Ranking below lists only Dune and
Neuromancer. `states/arena-challenge.png`.
With no in-tier neighbours, `matchupFrom` falls back to "both scored 8.x" pairs from the whole
section (`lib/data.ts:373-384`). Picking Hyperion changes nothing you can see, while the page says
the Arena "helps order a tier". "Order tiers / Challenge tiers" (`page.tsx:108-131`) only
explains itself after you pick one.
**Fix:** one muted line under the toggle per mode: "Settle the order inside each tier" / "Test the
border between two tiers". For a fallback pair, say so in the subtitle (`arena.tsx:176-181`):
"Both scored 8.0–8.9 · not tiered yet". Or limit the fallback to placed titles when any are placed.

### 3.3 The contenders' titles are below the fold on a 375×667 phone (Rough)
`shots/books_arena_tab_arena-light.png`, `states/arena-challenge.png`.
Header (~300px) + mode toggle + "Which is better?" push the cards to ~395–695px. A poster-height
card (`aspect-[2/3]`, `arena.tsx:219`) puts the title and year at ~660px, under Safari's toolbar.
**Fix:** with 1.4/2.1 (description hidden on phones) and `aspect-[3/4] sm:aspect-[2/3]` on the
poster, both cards and their titles fit on the first screen.

---

## 4. Best of the year (`/arena/year/[year]`)

Note: `arena_year_2026-dark.png` is one screen tall (an empty state). The page isn't long or heavy,
so the light full-page timeout looks like a capture problem, not the page.

### 4.1 Two stacked empty boxes, and the second gives the wrong advice (Confusing)
`shots/arena_year-light.png`, `shots/arena_year_2026-dark.png`.
"Not enough finishes in 2026" is followed by "Nothing ranked yet / Rate some items and run a few
duels" (`ranking-list.tsx:22-25`). Rating doesn't help here; finishing in that year does. Neither
box links anywhere.
**Fix:** in `arena/year/[year]/page.tsx:62-67`, skip the Ranking section when
`data.ranking.length === 0`. In `year-arena.tsx:25-35`, add a `Back to the diary` / `Open
{previous year}` link. Give `RankingList` an optional `empty` text for other callers.

### 4.2 A lone year chip, and ranking rows that don't say which section (Rough)
`shots/arena_year-light.png`.
The year picker (`page.tsx:39-55`) shows one selected chip when there is one year: decoration that
looks like a control. This ranking mixes books, films and games, but rows show only "1965 · 0
duels" (`ranking-list.tsx:63-67`).
**Fix:** render the nav only when `years.length > 1`. Add a `showSection` prop to `RankingList`
that prefixes `CATEGORIES[a.category].singular` ("Book · 1965 · 3 duels"), and pass it from the
year page.

---

## 5. Franchises (`/franchises`)

### 5.1 Empty state: tabs for nothing, and the button it tells you to press is elsewhere (Confusing)
`states/empty_franchises.png`, `shots/franchises-light.png` (demo also has none).
"All franchises / Ranking" (`franchises-client.tsx:117-138`) switch between two empty states. "Run
'Detect franchises'…" sits 200px below the button.
**Fix:** render the tab switcher only when `franchises.length > 0`. Put the Detect button (with its
progress text) inside the empty state, and keep the header button only once franchises exist.

(Ranking-tab rows: see 0.1/0.2; there the title gets ~50px.)

---

## 6. Lists index (`/lists`)

### 6.1 The third tab is cut to "Referen…" (Confusing)
`shots/lists-light.png`, `shots/lists_tab_shared-light.png`, `shots/lists_tab_ref-light.png`,
`states/empty_lists.png`.
The tab bar scrolls sideways inside itself (`lists-client.tsx:54`) with no cue, so "Reference
lists" looks broken or missing.
**Fix:** on phones, `grid grid-cols-3` with no icons and short labels: My lists · Shared ·
Reference (`TABS`, `:37-41`; render `label` as `<span className="sm:hidden">{short}</span><span
className="hidden sm:inline">{label}</span>` and the icon `hidden sm:block`). All three fit in
114px columns.

### 6.2 Reference tab: a screen of things you can't use (Rough)
`shots/lists_tab_ref-light.png`.
Three of five "Start from a classic" cards just say "TMDB/IGDB isn't configured on this server"
(`lists-client.tsx:261-264`), and the AI checkbox is a disabled control with its note in a second
column ("Let the AI pick out / the titles" | "(not configured on this server)", `:452-463`).
**Fix:** list only the configured built-ins as cards, then one muted line: "Also available once
TMDB/IGDB is set up: TMDB top rated movies, TMDB top rated TV, IGDB top 100 games." Don't render
the AI checkbox when `!aiConfigured`.

---

## 7. Custom list (`/lists/[id]`)

(Rows: 0.1/0.2.)

### 7.1 "Add titles" is only reachable by scrolling past the whole list (Rough)
`shots/lists_demo_list_comfort-light.png`, `states/list-edit.png`.
On phones the aside (`custom-list-client.tsx:135-138`) comes after every title, so with 30 titles
the main editing action is ~3,500px down.
**Fix:** for editors, add an `Add titles` button to the owner button row (`:240`). For editors who
aren't owners, add it next to the "Titles · n" heading (`:108`). It links to `#list-search`
(give the section that id and `scroll-mt-20`) and focuses the search input.

---

## 8. Reference list (`/lists/ref/[id]`)

### 8.1 Titles cut to 3–4 letters (Broken)
`shots/lists_ref_demo_reflist_scifi-light.png` ("Alien (…", "Stalker…", "Sol…"),
`…-fresh.png` ("Sola…").
`AddResultRow` puts the library badge ("In library · Watched 8.8", `add-row.tsx:201-204`) or the two
stacked buttons on the same line as a `truncate` title (`:180`). The row is narrowed further by the
number gutter (w-8) and the × outside the card (`ref-list-client.tsx:163-165`, `:181-192`).
**Fix:** pass `fullTitle` from `ref-list-client.tsx:167` (the title wraps and the buttons go full
width underneath, as built for this). For the badge, render it as the second text line inside the
title column when `fullTitle` is set, instead of as a right-hand `shrink-0` span (`add-row.tsx:201`).
Move the position number inside the card, like custom lists.

### 8.2 × removes a title at once, no undo (pasted lists) (Confusing)
Same screenshot. `removeItem` (`ref-list-client.tsx:55-64`) deletes on one tap; the only feedback is
the row vanishing after a refresh.
**Fix:** move Remove into the same ⋮ menu pattern as section 0 (one 44px button, no ×), and toast
"Removed X." with an Undo button. That needs a small `restoreRefListItem(listId, snapshot)` action
that puts the row back at its old position. `addPastedRefItems` would re-match by title and year
and append the title at the end.

---

## 9. Tags (`/tags`)

### 9.1 Tapping a tag shows its titles under every other tag (Confusing)
`shots/tags-light.png` (code path: `tags/page.tsx:88-129` renders after the list at `:48-86`).
With 20+ tags, a tap only re-borders one card. The "Tagged 'x' · 3" results are below every
card, so it looks like nothing happened.
**Fix:** when `selected.length > 0`, render the results section **above** the tag list (swap the
two blocks), with the selected tags as removable chips in its heading. Add `id="tagged"` and
append `#tagged` in `tagHref` (`:16-17`) so the page lands on them.

### 9.2 Phone chips are now 40px-tall pills around 12px text (Rough)
`shots/views-light.png` ("+ New view", "Sci-fi favourites" pills); same class on the tag's section
chips, `tags/page.tsx:76` (`py-3 … sm:py-0.5`).
The tap-size fix padded the pill itself, so these look like swollen bubbles beside the h-8
rectangular toggles right under them (Views).
**Fix:** keep the look (`py-1`) and grow the hit area invisibly: `relative tap-area`, as the
other phone fixes do (`views-client.tsx:206, :219`, `tags/page.tsx:76`).

---

## 10. Views (`/views`)

### 10.1 Section/Status toggles look selected after you deselect them; selected is faint (Confusing)
`shots/views-light.png`, `states/views-top.png`, `shots/views-minimal.png` (the selected "New
view" pill is a barely-grey pill in Minimal).
Selected is `bg-accent text-accent-foreground` (`views-client.tsx:243, :262`), exactly the outline
button's hover (`ui/button.tsx:16`). Phones keep :hover after a tap, and Tailwind 3 here doesn't
gate hover (`tailwind.config.ts` has no `hoverOnlyWhenSupported`). So tapping "Books" off leaves it
looking on. In Minimal light, accent (0 0% 95%) on white is barely visible even when it is on.
**Fix:** a selected style that hover can't fake: `border-primary bg-primary/10 text-foreground` plus
a leading `Check` icon when `aria-pressed`. Also add `future: { hoverOnlyWhenSupported: true }` to
`tailwind.config.ts`. That's app-wide and cures sticky hover everywhere; flag it to the other
auditors.

### 10.2 The filter builder fills 1.3 screens before any result (Rough)
`shots/views-light.png` (results start ~1,050px down), `states/views-top.png`.
Opening a saved view from the nav shows the builder, not the titles. The desktop builder
(`:231-406`) is stacked as-is.
**Fix:** on phones, collapse the builder into a summary row: `Filters · 3 on  [Edit]` (chips of
the active filters, `sm:hidden`). Start it collapsed when `selected` is set and expanded for a new
view. The saving row stays inside. Results then start on screen one.

### 10.3 Empty library: a full builder, with the message below the fold (Rough)
`states/empty_views.png`.
**Fix:** when `library.length === 0` (`:415`), render only the header and the empty state, with a
link to `/books` (or the search). Hide the builder and the "0 titles" row.

---

## 11. Public share page (`/s/[token]`)

### 11.1 "Neuromancer" is clipped to "Neuromanc" with no ellipsis (Rough)
`shots/s_demo_share_books-light.png`, `-dark`, `-fresh` (cut mid-glyph).
One long word overflows the 64px cover column (`s/[token]/page.tsx:88`, `:105`) and gets chopped.
This is the page friends see.
**Fix:** add `[overflow-wrap:anywhere] hyphens-auto` to `:105` and `:225` (the PNG export already
uses `overflowWrap: 'anywhere'`, `tier-share.tsx:218`).

### 11.2 Empty tiers are full-height boxes with a dash (Rough)
Same screenshots: B–F = 4 × 73px of "—".
**Fix:** `min-h-10` for empty rows (`:84`), with a smaller tier letter. Or skip empty tiers, since
the header already says "2 titles".

---

## Top 5 for this area on a phone

1. **Rebuild the reorderable rows (section 0):** a ⋮ menu (Top/Up/Down/Bottom/Remove) by default,
   a Reorder mode with side-by-side 44px ▲▼, two-line titles, and Undo on remove. That fixes Up
   next, custom lists, franchise ranking and watch order at once.
2. **Reference list rows (8.1):** pass `fullTitle` and move the library badge under the title, so
   titles stop being 3 letters.
3. **Tier list order on phones (1.1–1.4):** the Unranked tray first, "Place n in suggested tiers" as
   a labelled button, rows always title-then-controls, compact empty tiers, share row last.
4. **Say what each tab is (2.1, 3.1, 3.2):** per-tab heading on the tier page; no bare Elo; explain
   the arena modes and the fallback pairs.
5. **Views and Tags show results first (10.1, 10.2, 9.1):** a selected style that sticky hover can't
   fake (plus `hoverOnlyWhenSupported`), a collapsed filter summary on phones, and tag results above
   the tag list.
