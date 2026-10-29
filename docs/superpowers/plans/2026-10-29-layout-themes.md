# Hoard: switchable layout themes and UI clean-up

## Context

After the roadmap release (main 624f3ff, live since 29 Oct 2026), the owner doesn't like the UI:
- the sidebar has about 22 links;
- the title details popup has about 25 sections;
- section-page controls wrap onto several lines, under an amber "Score these" banner and above a crowd panel;
- cards are busy;
- browser-default scrollbars clash with the app;
- "Where to watch" is unwanted.

Through 23 multiple-choice answers he asked for **switchable layouts in a Settings → Themes tab**, with Classic (the pre-update look) as the default. Everything below is binding unless marked as a recommendation.

**Owner's decisions:**
- **Remove from the UI:**
  - Where to watch / streaming everywhere (details, badges, the Settings card, Tonight's "on my services").
  - Sub-scores.
  - The Score these banner and the crowd panel on section pages. The Score these dialog stays reachable only from the tier-list tray.
- **Layouts:** four of them, Classic (default), Minimal, Organised, Fresh, picked from thumbnails with an instant switch you can undo. Each layout sets navigation, card detail, density, and colours & fonts. Fresh is "cinematic dark".
- **Navigation:**
  - Minimal: the sidebar holds the 7 sections only; a top bar holds Dashboard and an avatar menu.
  - No new page needs one-click access in any layout; they live in menus and Cmd+K.
- **Header:** no search button and no bell. Search is `/` and Cmd+K on desktop; on phones it is "Search" and "Command palette" in the avatar menu. Notifications move into the avatar/user menu.
- **Section toolbar:** one line that never wraps. Classic gets labelled buttons; the other layouts get icons with tooltips. Advanced filters go in a Filters popover.
- **Cards:** how much a card shows depends on the layout.
- **Title view:** a user toggle in Themes, independent of layout: a short popup or a full page.
- **Dashboard:** the user picks which tiles show and in what order.
- **Settings:** a side sub-menu.
- **Scrollbars:** thin and themed.
- **Devices:** phone and desktop equally (375 px and up).
- **New packages:** `@radix-ui/react-popover` and `@radix-ui/react-tooltip` are approved.

## Approach

### 1. Data model (prefs JSON only; no schema change)
- **New fields in `src/lib/prefs.ts`:**
  - `layout: 'classic'|'minimal'|'organised'|'fresh'` (default classic)
  - `titleView: 'popup'|'page'` (default popup)
  - `dashboard: {order: string[], hidden: string[]}`
  - Reads are lenient. The patch is strict, with `z.enum` on layout ids and tile ids.
- **Client-safe constants:** go in the zod-free `src/lib/display-prefs.ts`. Add `layout` and `titleView` to `DisplayPrefs` and `toDisplayPrefs` (pinned by `prefs.test.ts`).
- **Exports:** remove `streamingServices` from `PrefsPatchSchema` (it stays readable and exportable). Add the new fields to `exportablePrefs` in `src/lib/export.ts`.
- **No flash on load:** the root `src/app/layout.tsx` reads the cached `getPrefs` (`src/lib/request-cache.ts`) and renders `<html data-layout=…>`. Never put `className` on `<html>`, because that would wipe the `dark` class.
- **Fresh forces dark:** the bootstrap script sets `dark = layout==='fresh' || hoard-theme || OS`. The light/dark toggle is hidden in Fresh, and `hoard-theme` is left untouched.
- **Instant switch with Undo:** add an optimistic overlay to `src/components/prefs-provider.tsx` and a `useSetDisplayPref()` hook. It applies `data-layout` and the dark class straight away, saves through the existing `updatePrefs`, and shows an Undo toast (pattern: `src/components/undo-toast.ts`). It rolls back if the save fails.

### 2. Layout architecture: one set of pages, four skins
- **Layout config:** `src/lib/layouts.ts` (pure) defines `LAYOUTS[id] = {nav, card, density, toolbar, forceDark, gridCols}`, plus `resolveLayout()` and a `useLayout()` hook.
- **Colours, fonts and density live in CSS:** `src/app/globals.css` gets `[data-layout=…]` blocks that override the shadcn variables (`--primary`, `--radius`, `--background`, a glassy `--card` for Fresh) plus `--page-pad` and `--grid-gap`. Classic keeps today's tokens; its reference is commit `73859c7`.
- **Tailwind variants:** `addVariant` in `tailwind.config.ts` adds `classic:`, `minimal:`, `organised:` and `fresh:`, so shared components style themselves without JS branches.
- **Fonts:** Fresh and Minimal each get one display font through `next/font/google`, downloaded at build time like Inter, with `preload:false`.
- **Scrollbars:** set `color-scheme` per theme, `scrollbar-width:thin`, and themed `--scrollbar` and `::-webkit-scrollbar` styles everywhere. The existing `.scrollbar-thin` becomes an alias.

### 3. Navigation and shell
- **Nav model:** `src/lib/nav-model.ts` (pure) holds `NAV_ITEMS` and a placement table per layout. `navFor(layout, {hidden, social})` returns `{primary groups, top, menu}`.

  | Layout | Sidebar / tabs | Top bar | User menu |
  |---|---|---|---|
  | Classic | Dashboard, Franchises, 7 sections | none | everything else |
  | Minimal | 7 sections | Dashboard | everything else |
  | Organised | Library / Plan & track / Organise / Insights / Friends (gated) | none | Import, Settings |
  | Fresh | (no sidebar) glass top bar with scrollable tabs: Home + 7 | | everything else |

- **Shell components:** `src/components/shell/{app-shell,sidebar,top-bar,mobile-bar,nav-list,user-menu,notifications-sheet}.tsx`. `src/app/(app)/layout.tsx` renders `<AppShell>`.
- **User menu** (a Radix dropdown that scrolls when it gets tall) contains:
  - Notifications, with an unread dot on the avatar;
  - Search and Command palette;
  - the layout's menu items;
  - Theme (not in Fresh);
  - Settings and Log out.

  In Classic the sidebar footer's "Signed in as" block becomes the menu trigger.
- **Extract and delete:**
  - Move `useNotificationState` and `NotificationList` out of `notification-bell.tsx`.
  - Delete `nav-links.tsx`, `mobile-nav.tsx`, `notification-bell.tsx` and the `SearchEverythingButton` uses. The `/` key and Cmd+K handlers in `global-search.tsx` stay.
  - Share the icon map (duplicated today in nav and dashboard) as `src/components/icons.ts`.

### 4. Section toolbar and cards
- **Filter logic:** move sort/filter state and defaults out of `src/components/category-client.tsx` into a pure `src/lib/section-filters.ts` (with `activeFilterCount`).
- **Toolbar:** `src/components/section/{section-toolbar,filters-popover}.tsx`, always `flex-nowrap min-w-0`.
  - **Classic (labelled):** `[Add][title filter][Filters·n][Tiers][AI Critic][view][More ⋯]`. Items that don't fit at a breakpoint move into More, using CSS breakpoints only.
  - **Other layouts:** the same items as icons with Tooltip and aria-label.
  - **Filters popover:** status, sort, owned/format, tags, group franchises, group by status, Reset.
- **Cards:** `media-card.tsx`, `media-table.tsx` and `media-compact.tsx` read `useLayout().card`.
  - `plain` (Classic): the pre-update card.
  - `poster` (Minimal).
  - `one-badge` (Organised): a pure `pickCardBadge()` with priority new season > countdown > listen > progress > time to beat.
  - `cinematic` (Fresh).
  - `MediaGrid` columns come from the layout config.
- **Wrapping audit:** convert the remaining `flex-wrap` rows (dashboard header, tier tray header, detail footer, settings rows) to `nowrap` with `truncate`.

### 5. Title view: popup or full page
- **Extraction first, as a behaviour-free commit:**
  - Move state and save/remove into `src/components/title/use-title-editor.ts`.
  - Move the fields and sections into `title-fields.tsx`.
  - Split `activity-extras.tsx` into a hook plus OwnershipField, Runs, ReviewField, Sessions and HistoryList.
- **Short popup (`title-popup.tsx`):** poster/title, Status, Score, Favourite, Progress, Notes, the new-season and listen notices, and a footer of Remove · Open full page · Save. `ActivityDetailDialog` keeps its name as a wrapper.
- **Full page:** `src/app/(app)/[category]/title/[activityId]/page.tsx`.
  - It uses a new owner-scoped `getActivity(id)` in `src/lib/data.ts` (reusing `flattenActivity` and `markNewSeasons`). A wrong category redirects; an unknown id is `notFound`.
  - Layout: poster on the left (a blurred backdrop hero in Fresh); status, score, favourite, franchise and description on the right; then Notes | History columns; then Tags · Lists; then Progress, Seasons (TV), Format/Runs/Review/Sessions and More by.
  - A sticky Save bar appears when there are unsaved changes.
- **Routing:** `?open=` stays the universal link, because notifications, iCal, releases and new-seasons already store it.
  - In page mode the section page redirects `?open=` to the title page, and clicking a card navigates there.
  - A pure `src/lib/title-href.ts` is used by the command palette and by `linked-text.tsx`.

### 6. Dashboard tiles
- **Registry:** `src/lib/dashboard-tiles.ts` with `recommend`, `cat:<7>`, `overview`, `now-consuming`, `coming-up`, `goals` and `favourites`.
  - `resolveTiles(prefs.dashboard, hiddenSections)` drops unknown and duplicate ids and inserts new tiles at their defaults.
  - `dataNeeds()` makes the dashboard query only what's visible.
- **Rendering:** move the tiles out of `src/app/(app)/dashboard/page.tsx` into `src/components/dashboard/tiles.tsx`.
- **Editor:** `tile-editor.tsx`, with checkboxes, drag via the existing `@dnd-kit`, up/down buttons, and Reset. It opens from a "Customize" button on the dashboard and also appears in Settings → Themes.

### 7. Settings with a side sub-menu
- **Route:** `/settings?tab=themes|general|accounts|notifications|sharing|data|system`, with `system` for the owner only.
  - `settings-shell.tsx` shows a sticky left list on desktop and a scrollable strip of tabs on phones.
  - Each tab loads only its own data.
- **Old links:** `src/lib/settings-nav.ts` maps the old `#anchor` and `?anilist=` links to tabs, and a client hash shim handles `/settings#…` links that notifications already store. Update the roughly 12 link builders that point at Settings.
- **Move:** `SettingsCompare` and `SettingsFeed` go into `settings-social.tsx`.
- **Themes tab (`settings-themes.tsx`):** four inline-SVG layout thumbnails (`layout-thumbnails.tsx`), the Title view choice, and the tile editor.

### 8. Removals (code deleted; database columns and tables stay, so the schema remains additive)
- **Streaming:** delete `where-to-watch.tsx`, `streaming-badges.tsx`, `SettingsStreaming`, `src/lib/actions/streaming.ts`, `watch-providers.ts`, `watch-refresh.ts`, `streaming.ts` and their tests, and the TMDB watch-provider fetchers. Remove the uses in up-next, together and tonight. The `WatchProviderCache` table stays unused.
- **Sub-scores:** delete `sub-scores.tsx`, `actions/subscores.ts` and `lib/subscores.ts` (plus its test). Drop `subScores` from `ActivityWithMedia` and the flatten step; the column stays.
- **Crowd panel:** delete the crowd panel component. Keep `lib/crowd.ts`, which stats uses.
- **Score these:** remove the banner and `?score=1` from section pages. Keep the dialog behind the tier-tray button in `tier-board.tsx`.

## Phases (each one shippable; reviewed per task like the roadmap build)
1. Removals, scrollbars and color-scheme.
2. Foundations: prefs fields, `layouts.ts`, `data-layout`, the bootstrap script, Tailwind variants, token blocks and the optimistic overlay. Nothing visibly changes yet, because Classic is the default.
3. Settings sub-menu and Themes tab with the live layout picker, plus link updates.
4. Nav model, the shell variants, the user menu and notifications, and the header cleanup.
5. Toolbar and Filters popover, card variants, and the wrapping audit.
6. Title extraction (a behaviour-free move), then the popup, the full page and routing.
7. Dashboard tile registry and editor.
8. Polish the Fresh, Minimal and Organised skins (Classic is checked against `73859c7`). Update the docs (FEATURES.md, README) and deploy with the pi-deploy skill.

Phases 4–7 depend only on phases 2 and 3.

## Verification
- **Vitest (pure functions):**
  - `layouts.test.ts`, the prefs tests (defaults, fallbacks, strict patch, display-prefs pin, export);
  - `nav-model.test.ts`: every permitted item is reachable in every layout, and Settings and Log out are always present;
  - `dashboard-tiles.test.ts`, `settings-nav.test.ts` (old anchors), `title-href.test.ts`, `section-filters.test.ts`, `card-badge.test.ts`.
- **Smoke (`e2e/smoke.mjs`, `e2e/routes.json`):**
  - Update the steps that click sidebar links (saved views, Friends) to use the user menu.
  - `#anchors` become `?tab=`; the TV-seasons and linked-notes steps move to the title page; `/books?score=1` becomes `/books/arena`.
  - Add a **layout matrix**: for each layout, at 1280 px and 375 px, visit the dashboard, `/books`, a title page and Settings. Check for no console errors, no horizontal overflow (`scrollWidth ≤ innerWidth`), and a toolbar exactly one row tall. Restore Classic afterwards.
  - Add a page-mode step: clicking a card opens `/books/title/…`, and `?open=` redirects.
- **Whole branch:** after every task, `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build` and `npm run smoke` all pass, followed by a final whole-branch review.
- **Deploy:** with the pi-deploy skill, as last time: a pre-deploy dump, `git pull`, `up -d --build`, then live checks. The owner then checks each layout on his phone and laptop via Settings → Themes.

## Risks
- **Classic drifting from the old look:** compare it against `73859c7`.
- **Stored links:** `?open=` and `/settings#…` links already sit in notifications. The redirect and the hash shim cover them, with tests.
- **Fresh performance:** blurred backdrops are expensive, so allow at most one per page, and check text contrast on glass.
- **Detail-dialog refactor:** do it as a separate, behaviour-free commit before any visible change.
