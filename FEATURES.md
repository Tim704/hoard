# Hoard: features

Hoard is a self-hosted media tracker. It keeps track of what you have read, watched, played
and listened to, and what you still mean to. It runs at
[hoard.timhufnagel.org](https://hoard.timhufnagel.org) on a Raspberry Pi. Every account
has its own private library; anything shared with other people is opt-in.

This list describes the app as of commit `2de2e8b` (28 Oct 2026), after the whole of
[`ROADMAP.md`](ROADMAP.md) was built, plus the layout themes update of 29 Oct 2026
(section 22).

### Features that need a key

These features need a key; the rest of Hoard works without them. A feature whose key is
missing says so ("not configured") instead of failing. The owner sets keys in `.env`
(see README → Configuration).

| Key | Unlocks |
|---|---|
| `TMDB_API_KEY` | Movies and TV: search, details, seasons; Letterboxd and Trakt matching; TMDB reference lists |
| `IGDB_CLIENT_ID` + `IGDB_CLIENT_SECRET` | Games: search, details, time to beat; Steam matching; the IGDB reference list |
| `LASTFM_API_KEY` | Albums: search and details; Last.fm "Mark as Listened?" suggestions |
| `GEMINI_API_KEY` | the AI critic, Recommend across media, Paste a list, the AI pick in reference lists, the year-in-review verdict |
| `STEAM_API_KEY` | Steam library import and nightly playtime |
| `TRAKT_CLIENT_ID` | Trakt import |
| `ANILIST_CLIENT_ID` + `ANILIST_CLIENT_SECRET` + `HOARD_SECRET` | sending your anime and manga changes to AniList (push) |

**Not added yet on hoard.timhufnagel.org:** the Steam, Trakt and AniList-push keys
(`STEAM_API_KEY`, `TRAKT_CLIENT_ID`, `ANILIST_CLIENT_ID`, `ANILIST_CLIENT_SECRET`,
`HOARD_SECRET`). Those three features are built and show their "not configured" notes
until the keys are in place.

AniList and OpenLibrary need no key: anime, manga and books search, the AniList import and
the nightly AniList pull all work without one.

---

## 1. Seven kinds of media

Each kind of media has its own section, its own search source and its own details.

| Section | Searches | Details kept |
|---|---|---|
| **Books** | OpenLibrary | authors, pages, ISBN, cover, up to 3 genres |
| **Movies** | TMDB | runtime, TMDB score, release date, genres, directors, top 5 cast, collection |
| **TV Shows** | TMDB | seasons (with episode counts and air dates), episodes, episode length, status, next episode date, cast |
| **Anime** | AniList | episodes, studio, MAL score, English / romaji / native titles, next airing episode |
| **Manga** | AniList | chapters, volumes, MAL score, English / romaji / native titles |
| **Video Games** | IGDB | platforms, IGDB rating, release date, genres, time to beat, Steam app id |
| **Albums** | Last.fm | artist, track count, cover, top 3 tags as genres |

- **Every title** has a year, a description, a cover, and (where the source has them) a
  full release date and genres.
- **Keeping details fresh:** a nightly job refreshes details that are more than 30 days
  old (section 23). Hand-made titles are never looked up.
- **Wording follows the medium:** books are *Unread / Reading / Read*, films and shows are
  *Unwatched / Watching / Watched*, games are *Unplayed / Playing / Beaten* and albums are
  *Unheard / Listening / Listened*.
- **Anime and manga titles** show in the language you choose in Settings (English,
  romaji or native), and filtering matches all three.

## 2. Statuses

Every title has one of six statuses, each with its own colour and icon:

| Status | Icon | Meaning |
|---|---|---|
| Planned (Unwatched, Unread…) | clock | in your backlog |
| Ongoing (Watching, Reading…) | play | in progress |
| Completed (Watched, Read, Beaten…) | check | finished |
| Paused | pause | on hold |
| Retired | archive | set aside for good, e.g. an endless multiplayer game |
| Dropped | ✕ | abandoned (its cover is shown greyed out) |

- **Finished** means Completed, Retired or Dropped: these can go on the tier list and are
  offered in "Score these" (on the tier list).
- **Retired** is offered in the details, not in the Add dialog.
- **The finish date** is stamped the first time a title is completed.
- **Undo:** changing a status, or removing a title, shows a toast with **Undo** for 8
  seconds. Undoing a removal brings back the title with its tier, notes, history, diary,
  play sessions, seasons and year duels.

## 3. Adding titles

### The Add dialog

The **Add** button on each section opens a search:

- **Search as you type:** results appear 350 ms after you stop typing (at least 2
  letters). ↑/↓ and Enter work.
- **Two choices on every result,** worded for the medium:
  - **Done** ("Watched", "Read"…) adds it as completed, then offers a score (**Save** or
    **Skip**);
  - **Want to …** adds it as planned, at the bottom of Up next.
- **No duplicates:** a title already in your library shows "In library" with its status.
- **Select several:** tick several results and add them all as done or to Up next.
- **Paste a link** into the search box to add that exact title (see below).
- **Can't find it?** "Add it yourself" makes a hand-made entry: title, year, an https
  cover, a description and the medium's counts. Hand-made entries can be edited later.
- **Books only:** "Scan a barcode or type an ISBN" uses the camera (or a typed ISBN) and
  looks the book up on OpenLibrary.

### Other ways in

- **Search everything** (`/`, or **Search** in the user menu): searches every visible
  section at once, grouped by section, with a 6 s limit per source.
- **Command palette** (Cmd+K on a Mac, Ctrl+K elsewhere, or **Command palette** in the
  user menu): jump to any title in your library or any page. On the highlighted title:
  Enter opens it, Cmd/Ctrl+Enter marks it done, Alt+Enter moves it to the top of Up next.
  Enter on no match runs Search everything.
- **Add by link** (`/add`): paste a link from TMDB, IMDb, AniList, MyAnimeList, IGDB,
  Steam, Goodreads, Letterboxd or OpenLibrary. Other links are searched by their page
  title. On Android, sharing a link to the installed app opens this page.
- **Add missing titles** on a franchise lists the parts you don't have yet (AniList
  relations, TMDB collections, IGDB franchises) to tick and add.
- **Anime season browser** (`/anime/season`, linked from the Anime section): this or any
  season's anime by popularity, with genre and format filters.
- **More by the same people** in the details: other work by the director and cast (films,
  TV), author (books), studio and staff (anime, manga), developer (games) or artist
  (albums), each with add buttons.
- **Recommendations, reference lists, compare and the year-in-review** all have the same
  add buttons.

## 4. Importing

`/import` brings in a library from elsewhere. Every source goes through one **review
screen** before anything is saved.

| Source | What you give it | Needs |
|---|---|---|
| **Hoard CSV** | Hoard's own library export | — |
| **AniList** | a username | — |
| **Letterboxd** | the export zip or its CSVs (watched, ratings, diary, watchlist, reviews) | TMDB |
| **Goodreads** | the library export CSV | — |
| **StoryGraph** | the export CSV | — |
| **MyAnimeList** | the anime/manga list export (`.xml` or `.xml.gz`) | — |
| **Trakt** | a public username | `TRAKT_CLIENT_ID`, TMDB |
| **Steam** | your linked Steam account (Settings → Accounts) | `STEAM_API_KEY` |
| **Any other CSV** | any file; you map its columns once and Hoard remembers the mapping | — |
| **Paste a list** | text or a screenshot (up to 6 MB) of a list | Gemini |

- **Matching:** by id where the file has one (TMDB, MAL, AniList, ISBN, IGDB, Steam),
  otherwise by title and year.
- **The review screen:** each row shows the match, other candidates, a status, a score
  and Skip. Unsure matches start unticked. Titles already in your library are flagged,
  and only change when "Update existing titles" is ticked; even then a status only moves
  forward, never back.
- **What comes in:** status, score (stars ×2), dates, rereads, reviews (as diary
  entries), shelves and custom lists (as tags), progress and notes.
- **Limits:** files up to 20 MB, 5000 titles per import.
- **After the import,** franchises are grouped once. Failed rows can be retried.

## 5. Scores

- **0.0 to 10.0 with one decimal,** entered with pips, ±0.1 or typing. The server refuses
  anything outside 0–10.
- **Display format** (Settings): out of 10 (`8.5`), five stars (`4.3★`) or out of 100
  (`85`). Storage and input stay 0–10.
- **Score these:** the "Score these · N" button in the tier list's tray opens a list of
  finished titles without a score (and, for games, any game with 10 h or more on Steam),
  each with the score step.

## 6. Progress, history and the diary

- **Progress:** pages (books), chapters (manga), episodes (TV, anime) or tracks (albums,
  hidden unless you turn it on). +1 or type it in the details; a bar shows on cards while
  a title is ongoing. Reaching the total offers "Mark as finished"; the status never
  changes by itself.
- **TV seasons:** a TV title's details list its seasons. Each has a watched count (+1,
  set or All) and optional episode ticks, and the show's progress is their sum.
- **Rewatches:** "Watch again" (Read again, Play again, Listen again) starts a new run
  without touching the tier list. The details show "Watched 3× · last 12 Mar 2026".
- **The diary** (`/diary`): every finish (Completed or Retired, not Dropped) is a dated
  entry with its score, a rewatch flag and an optional review. Entries are grouped by
  month, filterable by section and year, and can be edited, deleted or added for a past
  watch. Finishes from before the diary existed were added once from their finish dates.
- **Review:** the details have a Review field for the latest entry.
- **History:** the details list everything that happened to a title (added, status,
  score, progress, tier, queue, imports, rewatches, reviews), newest first.
- **Owned on and format:** platforms you own a game on, and print / ebook / audio for
  books and manga or vinyl / CD / digital for albums. Shown in the list view and
  filterable.
- **Play sessions** (games): log a day, minutes and a note; a month calendar shows the
  days played, and sessions less than 7 days apart form a run.

## 7. Browsing a section

Each section page has:

- **Three views:** Grid (poster wall), List (a table) and Compact (dense rows).
- **One toolbar line** that never wraps: Add, the title filter, **Filters**, Tiers, the AI
  critic and the view switch, with a **More** menu for what doesn't fit. Classic labels
  its buttons; the other layouts show icons with tooltips.
- **Filters** (a popover; its button counts what's set): status, tags (all must match),
  owned platform or format, sort and grouping, and Reset. The title filter matches all
  title variants.
- **Five ways to sort:** by status, recently added, highest rated, tier list order, or
  title A–Z.
- **Group by status** (collapsible sections, Planned in Up next order) and **group
  franchises** (one expandable row per franchise). View, sort, grouping and collapsed
  sections are remembered per section on each device.
- **Cards follow the layout** (section 22): Classic's plain cards, Minimal's posters,
  Organised's cards with one badge, Fresh's cinematic cards. Organised's badge is the one
  that matters most: "New season", then "in 12 days" for planned titles not out yet,
  "Mark as Listened?" (albums), progress, then "≈ 32 h" to beat (games). Franchise stacks
  take the same style.

### Title details

Clicking a title opens it the way you chose in Settings → Themes → **Title view**:

- **Popup** (the default): a short popup over the page with status, score, favourite
  (★), progress and notes, the new-season and Last.fm notices, and **Remove**, **Open
  full page** (unsaved edits carried over) and **Save**. Closing it returns focus to
  what opened it.
- **Full page** (`/<section>/title/<id>`): the cover, year, release date, genres, time to
  beat, Steam playtime and the provider's score, and everything you can change: status,
  score, favourite, the franchise, notes and history, tags and lists, progress, seasons
  (TV), owned on / format, play sessions (games), review, "More by the same people" and
  "Mentioned in". A Save bar appears while there are unsaved changes, which are kept
  per tab until saved or discarded.

Links into a title (notifications, the calendar feed, the palette) use `?open=`, which
opens the popup, or redirects to the full page in page mode.

**Linked notes:** `[[Title]]` in notes or reviews links to that title in your library
(autocomplete after `[[`), and the target shows "Mentioned in".

## 8. Tier list

Each section has its own **S / A / B / C / D / F** tier list, under the **Tiers** button.

- **Who appears:** titles that are completed, retired or dropped.
- **Placing:** by hand, and they stay put. Scores and the Arena never move a title to
  another tier on their own.
- **Ordering:** drag, or use the ↑/↓ buttons and tier menu (keyboard and phone friendly).
- **Unranked tray:** newly finished titles wait here with a suggested tier from their
  score (9.0+ S, 8.0+ A, 7.0+ B, 6.0+ C, 5.0+ D, below F). **Accept all suggestions**
  places every rated one.
- **Rewatches:** a placed title being rewatched keeps its place but is hidden until it is
  finished again.
- **Sharing:** **Download PNG** saves an image of the board; **Share link** makes a
  read-only public page with titles and covers only (no scores or notes). Links are
  listed, and revoked, in Settings → Sharing & privacy.
- **Season tiers:** each TV show has its own tier list and Arena of its seasons
  (`/tv/seasons/…`, linked from the details).

## 9. Up next

Each section has its own queue of everything you plan to get to.

- **Order:** drag; new titles join at the bottom.
- **Available now / Not out yet:** titles not released yet sit in their own group,
  soonest first, without changing the queue order.
- **Next in franchise:** a chip warns when an earlier part of the same franchise is still
  unfinished.
- **Finishing from the queue** opens the score step, with Undo.

## 10. Arena

The **Arena** settles which of two titles is better.

- **Order tiers:** two titles from the **same tier**; *Which is better?* If the lower one
  wins they swap places. Without any tier holding two titles, it pairs titles with the
  same whole-number score.
- **Confidence:** each title counts its duels ("12 duels" in the ranking), and the
  least-tested pair is offered first.
- **Challenge tiers:** the bottom of one tier against the top of the next. If the lower
  title wins the same pairing twice, a card offers "Move “Title” up to A?" with Accept
  and Dismiss. Nothing moves unless you accept.
- **Behind the scenes:** each duel updates a hidden Elo rating (K = 32), shown as a
  ranking beside the duels. **Shuffle / Skip** moves on without counting a duel.
- **Best of the year** (`/arena/year/2026`): everything you finished in a year, across
  all sections, duelled into one ranking. Its top 3 feeds the year in review.

## 11. Franchises

Hoard groups titles from the same franchise, across sections: every Haikyuu season, the
movies and the manga become one group.

- **Automatic grouping:** AniList relations (anime, manga), TMDB collections (movies), IGDB
  franchises (games), and matching titles everywhere else. Each new title is grouped as
  it is added; **Detect franchises** regroups everything. Grouping never makes a group of
  one, never moves a title you placed by hand and never deletes a group.
- **The Franchises page:** a cover grid with breakdowns ("3 anime, 1 manga"), and a
  Ranking tab to drag your top franchises into order.
- **Managing one:** its own score and notes; rename, remove titles, merge or delete the
  group (the titles stay). Unscored franchises show their titles' average, labelled "avg".
- **Watch order:** release order (by release date) or your own drag order, with "Next
  up: {title}" on the franchise.
- **Add missing titles:** see section 3.

## 12. Lists, tags and views

- **Custom lists** (`/lists`): your own lists of titles from any section, in drag order.
  Invite other users of this Hoard by username as viewer or editor; they see the list
  only, never your library. A list can also get a public read-only share link.
- **Reference lists** (`/lists` → Reference lists): built-in checklists (TMDB top 250
  movies, TMDB top 100 TV, AniList top 100 anime and manga, IGDB top 100 games) or your
  own pasted list, each with how many you've done and planned, add buttons and a Refresh.
- **Tags** (`/tags`): every tag with its count per section; clicking one lists the
  tagged titles across sections. Up to 20 tags per title.
- **Saved views** (`/views`): filter your whole library by sections, statuses, tags,
  genres, maximum length, score range and year range, sort it, and save it with a name.
  Saved views appear under **Views** in the navigation (up to 50).

## 13. What's next and what's coming

- **Tonight** (`/tonight`): three picks from Up next for the time you have (30 min, 1 h,
  2 h, 3 h+ or a few sessions), filtered by section and genre.
  **Another** shows three more.
- **Calendar** (`/calendar`): a month grid or list of planned releases, next episodes of
  shows you watch, airing anime and unreleased sequels of your franchises. Settings →
  Calendar makes a private iCal link for your calendar app (regenerate or turn it off at
  any time).
- **Countdowns:** "in 12 days" on planned titles, and a **Coming up** tile on the
  dashboard with the next 5 releases.
- **New seasons:** a show you have watched or are watching that gets a new season (once
  it has aired) shows "New season" and sends a notification. **Got it** (or starting the
  show) clears it; the tier list is untouched.

## 14. Dashboard

The home screen after logging in:

- **One tile per section** with a headline total, counts of ongoing, planned and done, and
  the average score:

  | Section | Headline total |
  |---|---|
  | Books | words read (at about 275 words per page) |
  | Movies | hours watched |
  | TV, Anime | episodes watched |
  | Manga | chapters read |
  | Games | games beaten |
  | Albums | albums heard |

- **"Your hoard"** (totals across sections) and **"Now consuming"** (up to five covers).
- **Coming up:** the next 5 releases among your planned titles.
- **Goals for this year,** when you have any.
- **Favourites:** the first four starred titles per section, in tier order.
- **Recommend across media** (Gemini), a button top right.
- **Customize** (top right, or Settings → Themes → Dashboard tiles): tick the tiles to
  show and put them in order by dragging or with the arrows, then Save (with Undo);
  Reset brings back the default. Hidden sections drop out of the tiles. The tiles take
  the layout's card style.

## 15. Stats

`/stats` has four tabs, plus a year page:

- **Overview:** current and longest streak of active days, a card per section (headline
  total, status counts, drop rate, average score), and charts: finished per month
  (stacked by section), top 10 genres, average score by year, status mix and drop rate.
  Every chart has a table view. You vs. the crowd for all sections sits below.
- **Year in review** (`/stats/year/2026`): totals per section, hours and pages, the
  busiest month, the top franchise, new S-tier titles and the best-of-the-year top 3.
  Download it as a PNG, share a link (no scores), or ask the AI for a verdict.
- **Goals:** yearly targets per section or overall: titles, pages, hours or episodes,
  with progress bars (up to 30 a year).
- **Taste:** your taste profile (below), where you usually drop things ("around episode
  4"), your average score per genre by year, and **Compare periods** (this year vs last,
  last 3 months vs the 3 before, or any two ranges).
- **People:** your most-watched directors and actors, with counts and average scores.

Hours are estimates: a film's runtime, a TV episode's length (45 min when unknown), 24
min per anime episode. Hidden sections are left out of stats.

## 16. AI (Gemini)

All of these need `GEMINI_API_KEY`, and together allow each user 10 AI calls a minute and
100 a day.

- **AI critic** (each section): **Roast my taste**, a savage but PG-13 review of your
  finished titles, or **Recommend a gem**, one hidden-gem suggestion.
- **Recommend across media** (dashboard and stats): up to 6 suggestions from at least 3
  sections, based on your S and A tiers and taste profile, none already in your library.
  **Find it** opens Search everything with the title.
- **Paste a list** (import) and "Let the AI pick out the titles" (reference lists): reads
  a pasted list or a screenshot into titles for the review screen. Nothing is added
  without the review.
- **Year verdict:** a paragraph on your year, on the year-in-review page.

**The taste profile** needs no AI: it is worked out every Sunday (or with **Refresh** on
Stats → Taste) from at least 5 finished titles, as favourite genres, scoring habits per
section, drop rates and favourite decades, shown as plain sentences. The roast and both
kinds of recommendation are given this summary too.

## 17. Linked accounts

Settings → Accounts:

- **Steam** (needs `STEAM_API_KEY`): link a profile URL, vanity name or SteamID64. "Import
  library" brings your games in through the review screen (unplayed ones suggested as
  Planned, played ones as Ongoing; nothing is marked done). A nightly job keeps playtime
  current; the details show "40 h on Steam". The profile's game details must be public.
- **AniList:** a username. A nightly pull adds titles you track there and updates their
  status, progress and score (the newest change wins; nothing is removed; only sure
  matches are written). **Connect to push changes** (needs `ANILIST_CLIENT_ID`,
  `ANILIST_CLIENT_SECRET` and `HOARD_SECRET`) also sends your anime and manga changes
  back to AniList. Large imports (over 200 titles) are not pushed.
- **Last.fm:** a username. Every night Hoard checks your planned and ongoing albums; once
  you have played at least 80 % of an album's tracks, it suggests **Mark as Listened?**
  (with a notification). It never marks anything by itself.
- Each account has its own button to sync it now (**Update playtime now**, **Check
  now**, **Sync now**), at most 2 a minute.

## 18. Notifications

**Notifications** in the user menu lists them (a dot on the avatar, or beside your name
in Classic's sidebar, means some are unread). Each user can also push them to their own
[ntfy](https://ntfy.sh) topic and/or a Discord webhook (Settings → Notifications; public
https addresses only, with **Send test**) and choose which kinds are pushed:

- releases out today and new episodes of shows you watch;
- new seasons;
- sync errors (AniList);
- lists shared with you;
- Last.fm "Mark as Listened?" suggestions;
- backup problems (owner only).

## 19. Sharing and friends

Everything here is off until you turn it on.

- **Share links:** tier lists, custom lists and your year in review get read-only public
  pages (no scores, notes or reviews), listed and revocable in Settings → Sharing & privacy.
- **Compare** (`/compare/<username>`): needs Settings → "Compare with other users" on
  both sides. Shows the titles you both have, your biggest disagreements, a compatibility
  score (needs 5 titles you have both scored) and their S-tier titles you haven't got.
- **Watch together** (`/together`): same opt-in. The planned titles you share, ranked by
  your combined queue positions.
- **Feed** (`/feed`): what opted-in users finished, dropped or put in S tier over the
  last 30 days, with scores. Your own activity appears only if you turn on "Show my
  activity in the feed".
- These pages join the navigation once you opt in (the user menu; Organised's
  **Friends** group).

## 20. Your data

Settings → Data:

- **Library CSV** (every section, with tags, dates, progress, tier and franchise) and
  **Franchises CSV**. The library CSV can be imported again.
- **Full JSON export:** everything you own, including diary, sessions, seasons, lists,
  goals, views and links; never passwords, tokens or token hashes.
- **Markdown (Obsidian):** a zip with one note per title, `Section/Title (Year).md`, with
  front matter (status, score, tier, dates, tags, franchise, link) and your notes and
  reviews.

Settings → Data → API tokens: a read-only JSON API over your library for scripts and dashboards.
Up to 10 tokens, each shown once, 60 requests a minute. See [`docs/API.md`](docs/API.md).

## 21. Accounts and privacy

- **Logging in:** a username (at least 3 characters) and a password (at least 8), stored
  as bcrypt hashes. Sessions last 30 days in an httpOnly cookie. Signing in returns you
  to the page you were headed to.
- **Failed logins** say "Invalid username or password" either way.
- **Every library is private.** The shared part is the catalogue of title details (two
  people adding the same film share one copy). The providers own those details: what a
  user sends can only fill in a missing one, never overwrite it.
- **No location:** your time zone starts as your browser's (never a location) and can be
  changed in Settings.
- **Demo accounts:** the seed script (for local use; production never runs it) creates
  `demo` / `demo1234` with a small library, and a second user `demo2` for trying the
  friends features.

## 22. Layouts and themes

### Settings → Themes

- **Layout:** four thumbnails; picking one switches at once and saves, with **Undo** in
  the toast. Each layout sets the navigation, how much a card shows, the density, and
  the colours and fonts:

  | Layout | Navigation | Cards | Look |
  |---|---|---|---|
  | **Classic** (default) | full sidebar | plain cards, labelled toolbar buttons | Hoard as it was: violet accent, system font |
  | **Minimal** | sidebar of the 7 sections; Dashboard in a top bar | posters with the title and a quiet line | white paper, ink accent, rounder corners, more room; Manrope |
  | **Organised** | sidebar in groups: Library, Plan & track, Organise, Insights, Friends | tidy cards with one badge | slate and blue, squarer corners, denser |
  | **Fresh** | glass top bar with scrollable tabs (Home and the 7 sections) | cinematic poster cards, the title on a gradient | always dark, amber accent, glass cards; Outfit |

- **Title view:** a short popup or the full page (section 7), whichever layout you use.
- **Dashboard tiles:** the same editor as the dashboard's Customize (section 14).

Where to watch, sub-scores, the crowd panel on section pages, the section pages' Score
these banner (Score these lives in the tier list's tray), and the header's bell and search
button were removed on the owner's request with this update.

### Look and navigation

- **Theme:** dark and light, toggled by hand (from the user menu; Fresh is always dark).
- **Scrollbars:** thin and in the theme's colours everywhere (page, dialogs, menus, lists).
- **Navigation** follows the layout:
  - **Classic:** a sidebar with Dashboard, Franchises and the seven sections;
  - **Minimal:** a sidebar with the seven sections, Dashboard in a top bar;
  - **Organised:** a sidebar of groups (Library, Plan & track, Organise, Insights,
    Friends);
  - **Fresh:** a glass top bar with tabs for Home and the seven sections.
- **User menu** (your avatar, or "Signed in as" in Classic's sidebar): **Notifications**
  (an unread dot on the avatar), **Search** and **Command palette** (the phone's way in;
  `/` and Cmd/Ctrl+K on a keyboard), the pages the layout keeps out of its sidebar or
  tabs, Theme (not in Fresh), Settings and Log out. There is no bell or search button in
  the header.
- **Sidebar** (where there is one): collapses to an icon rail with Ctrl/Cmd+B, and that
  choice is remembered.
- **Phones:** a slim top bar (menu drawer, logo, avatar; in Fresh a second line of
  section chips), thumb-sized controls, and layouts checked at 375 px.
- **Settings** (a side menu on desktop, a strip of tabs on phones: Themes, General,
  Accounts, Notifications, Sharing & privacy, Data, and System for the owner): time zone,
  score format, title language, week start, and sections to hide (they leave the
  navigation, dashboard and stats; their pages still work).
- **Installable:** Hoard can be added to the home screen as an app (no offline mode).

## 23. Running it

- **Stack:** Next.js 14 (App Router, server actions), Prisma 5 on PostgreSQL 16, Tailwind
  with shadcn/ui, @dnd-kit for dragging, Gemini for AI.
- **Deploy:** Docker Compose, built natively for arm64, behind a Cloudflare tunnel. A
  deploy is `git pull` plus a rebuild on the Pi.
- **Database changes:** each container start runs the SQL scripts in `prisma/sql/`, then
  applies the schema. Both are safe to run again and again.
- **Backups:** a `backup` service dumps the database every night at 03:00 and keeps 14
  daily and 8 weekly copies outside Docker. The owner sees the last backup in Settings →
  System and is notified if it is over 26 hours old.
- **Scheduled jobs** run inside the app, each at its time in the server's time zone
  (Europe/Berlin):

  | Job | When | What it does |
  |---|---|---|
  | migration | at startup | one-off data backfills |
  | metadata | 03:30 | refreshes title details older than 30 days (up to 1000 a night) |
  | new-seasons | 04:00 | refreshes shows you watch, finds new seasons, caches upcoming sequels |
  | steam | 04:30 | Steam playtime |
  | lastfm | 05:00 | Last.fm "Mark as Listened?" suggestions |
  | anilist-sync | 05:30 | AniList pull |
  | taste-profile | Sundays 05:45 | taste profiles |
  | releases | 06:00 | "out today" and new-episode notifications |
  | airing | 06:30 | next airing episode of anime |
  | backup-watch | 09:00 | warns the owner about old backups |

- **Tests:** `npm test` runs over 900 Vitest tests; `npm run smoke` drives Chrome through
  every page as the demo user.
