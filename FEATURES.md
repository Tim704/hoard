# Hoard: features

Hoard is a self-hosted media tracker. It keeps track of what you have read, watched, played
and listened to, and what you still mean to. It runs at
[hoard.timhufnagel.org](https://hoard.timhufnagel.org) on a Raspberry Pi. Every account
has its own private library.

This list describes the app as of commit `79a94d5` (27 Oct 2026).

---

## 1. Seven kinds of media

Each kind of media has its own section, its own search source and its own details.

| Section | Searches | Details kept |
|---|---|---|
| **Books** | OpenLibrary (no key needed) | authors, pages, ISBN, cover |
| **Movies** | TMDB | runtime, TMDB score, backdrop, poster |
| **TV Shows** | TMDB | seasons, episodes, TMDB score |
| **Anime** | AniList (no key needed) | episodes, studio, MAL score |
| **Manga** | AniList (no key needed) | chapters, volumes, MAL score |
| **Video Games** | IGDB | platforms, IGDB rating, cover |
| **Albums** | Last.fm | artist, track count, cover |

Every title also has a year, a description and a cover image. A section whose API key is
missing shows a friendly error when you search it; the rest of the app keeps working.

Wording follows the medium: books are *Unread / Reading / Read*, films and shows are
*Unwatched / Watching / Watched*, games are *Unplayed / Playing / Beaten* and albums are
*Unheard / Listening / Listened*.

## 2. Statuses

Every title has one of five statuses, each with its own colour and icon, so states differ
by shape as well as by colour:

| Status | Icon | Meaning |
|---|---|---|
| Planned (Unwatched, Unread…) | clock | in your backlog |
| Ongoing (Watching, Reading…) | play | in progress |
| Completed (Watched, Read, Beaten…) | check | finished |
| Paused | pause | on hold |
| Dropped | ✕ | abandoned (its cover is shown greyed out) |

The date you finish something is stamped automatically the first time it is marked
completed.

## 3. Adding titles

The **Add** button on each section opens a search dialog:

- **Search as you type.** Results appear 350 ms after you stop typing, once you have
  typed at least 2 letters. Enter still searches immediately, and late results from an
  earlier query never overwrite newer ones.
- **Keyboard friendly.** ↑/↓ moves through the results and Enter acts on the
  highlighted row.
- **Two choices on every result,** worded for the medium:
  - **Done** ("Watched", "Read", "Beaten", "Listened") adds it as completed. A score step
    then opens on the same row, with **Save** and **Skip**; unrated is fine.
  - **Want to …** ("Want to watch", "Want to read", "Want to play", "Want to listen")
    adds it as planned, at the bottom of your **Up next** queue.
- **No duplicates.** A title already in your library shows "In library", with its status
  and score, instead of the buttons.
- **Add several in a row.** The dialog stays open, and is fully cleared when it closes.
- **Filling in details.** On adding, the app fetches extra details (movie runtimes, TV
  episode and season counts), so the dashboard totals are real. If that fetch fails, the
  title is still added.

## 4. Scores

- **Scores run from 0.0 to 10.0 with one decimal.** Older whole-number scores carried over
  (8 became 8.0).
- **Three ways to enter a score:**
  - tap one of 10 pips to set the whole number;
  - nudge it with **−0.1 / +0.1**;
  - or type it.
- **Scores are checked on the server.** Anything outside 0–10 is refused, and every score
  is rounded to one decimal.
- **Scores are shown everywhere** (cards, rows, the tier list, the queue, franchises),
  always with one decimal.

## 5. Browsing a section

Each section page has:

- **Three views:**
  - **Grid:** a poster wall.
  - **List:** a table with covers, status, score and a favourite star.
  - **Compact:** dense rows with status icons.
- **Filter by title** and **filter by status**.
- **Five ways to sort:** by status (in progress first, then the backlog, then finished),
  recently added, highest rated, tier list order, or title A–Z. With the tier list sort,
  the list view adds a **#** column showing each title's place.
- **Group by status:** collapsible sections, ordered Ongoing → Planned → Completed →
  Paused → Dropped. The Planned section follows your Up next order and has a
  **Reorder** link.
- **Group franchises:** titles from the same franchise fold into one expandable row. When
  grouping by status as well, the whole franchise sits in one section, the "best" one:
  ongoing first, then completed, then paused, planned, dropped. Typing in the title filter
  ungroups them, so a single title can always be found.
- **Remembered settings:** view, sort, grouping and collapsed sections are kept per
  section on each device.

### Title details

Clicking a title opens its details:

- **Shown:** cover, year, description and every detail from section 1, plus the
  provider's own score (TMDB, MAL or IGDB).
- **What you can change:**
  - status;
  - score;
  - favourite (★);
  - free-text notes;
  - which franchise it belongs to: none, any existing one, or a new franchise started from
    this title.
- **Saving:** a franchise change saves at once and is locked, so automatic grouping never
  moves it again. Everything else saves with **Save**.
- **Remove** takes the title out of your library.

## 6. Tier list

Each section has its own **S / A / B / C / D / F** tier list, under the **Tiers** button.

- **Who appears:** titles you have completed or dropped.
- **Placing:** you place titles by hand, and they stay where you put them. Scores and the
  Arena never move a title to another tier.
- **Ordering within a tier:** drag to reorder. ↑/↓ buttons and a tier menu on each row
  do the same without dragging, so it works with a keyboard and on phones.
- **Unranked tray:** newly finished titles wait here, each with a suggested tier from its
  score, which you accept with one tap:

  | Score | 9.0+ | 8.0+ | 7.0+ | 6.0+ | 5.0+ | below 5 |
  |---|---|---|---|---|---|---|
  | Suggested tier | S | A | B | C | D | F |

  Unrated titles get no suggestion.
- **Accept all suggestions** places every rated title in the tray in one go, keeping the
  tray's order inside each tier.
- **Rewatches:** if a placed title goes back to "watching", it keeps its tier and place
  but is hidden until you finish or drop it again.
- **Saving:** only the rows that actually changed are written.

## 7. Up next

Each section has its own queue of everything you plan to read, watch, play or hear.

- **Order:** drag to put it in the order you want to get to things. New titles join at
  the bottom.
- **Finishing from the queue:** marking a title done takes it out of the queue and opens
  the same score step as adding (Save or Skip). It then waits in the tier list's tray.
- **Where it shows:** the queue is a tab next to Tiers and Arena, and the section page's
  Planned group uses the same order.

## 8. Arena

The **Arena** helps when you can't decide which of two titles is better.

- **The duels:** it shows two titles from the **same tier** and asks *Which is better?* If
  the lower one wins, they swap places in that tier. A title never leaves its tier.
- **Before you have tiers:** if no tier holds two titles yet, it pairs titles with the
  same whole-number score instead.
- **Behind the scenes:** each duel also updates a hidden Elo rating (K = 32), shown as a
  ranking beside the duels.
- **Shuffle / Skip** moves on without counting a duel.

## 9. Franchises

Hoard groups titles from the same franchise. For example, every Haikyuu season, the movies
and the manga become one group.

- **Automatic grouping:**
  - **Anime and manga** follow AniList's links between seasons, movies, sequels and
    source material. Crossovers and cameos are ignored, so unrelated series don't merge.
  - **Movies** use TMDB collections.
  - **Games** use IGDB franchises and collections.
  - **TV, books and music** are matched by title.
  - **Across sections,** titles with matching names join, so a TMDB movie can join an
    AniList anime group.
- **When grouping happens:** each new title is grouped as it is added; a slow source gives
  up after 8 seconds and the title is still added. **Detect franchises** on the
  Franchises page regroups everything you already track, showing its progress as it goes.
- **What grouping never does:**
  - make a group of one title;
  - move a title you placed by hand;
  - delete a group.
- **The Franchises page** has two tabs:
  - **All franchises:** a cover grid, each with a breakdown such as "3 anime, 1 manga, 1
    movie".
  - **Ranking:** drag your top franchises into order, with a "Not ranked yet" list below.
- **Managing a franchise:**
  - give the franchise its own score and notes (e.g. a watch order);
  - rename it, remove titles from it, merge it into another, or delete the group (the
    titles stay in your library).
- **Franchise scores:** where you haven't scored a franchise, it shows its titles'
  average, labelled "avg" so the two are never confused.

## 10. Dashboard

The home screen after logging in is a 3×3 grid:

- **One tile per section,** each with:
  - a headline total:

    | Section | Headline total |
    |---|---|
    | Books | words read (at about 275 words per page) |
    | Movies | hours watched |
    | TV, Anime | episodes watched |
    | Manga | chapters read |
    | Games | games beaten |
    | Albums | albums heard |

  - counts of ongoing, planned and done;
  - the average score.
- **"Your hoard":** totals across all sections (titles tracked, completed, sections in
  use, average score).
- **"Now consuming":** covers of up to five things in progress, plus a count of any more.

## 11. AI critic

Optional; it needs a Gemini API key. Each section has an AI menu with two modes:

- **Roast my taste:** a savage but PG-13 review of your finished, scored titles, naming
  specific titles.
- **Recommend a gem:** one hidden-gem suggestion you probably haven't seen, explained
  through your highest-ranked titles.

## 12. Accounts and privacy

- **Logging in:** register with a username (at least 3 characters) and a password (at
  least 8). Passwords are stored as bcrypt hashes.
- **Sessions:** last 30 days, in an httpOnly cookie.
- **Failed logins** give the same "Invalid username or password" either way, so they never
  reveal whether a username exists.
- **Every library is private:** each user has their own titles, statuses, scores, tiers,
  queue and franchises. The shared part is only the catalogue of title details, so two
  people adding the same film share one copy of its details.
- **Demo account:** a seed script can create `demo` / `demo1234` for trying it out.

## 13. Look and navigation

- **Theme:** dark and light, toggled by hand.
- **Desktop:** a sidebar with Dashboard, Franchises and the seven sections. It collapses
  to an icon rail, and that choice is remembered.
- **Phones:**
  - a slim top bar with a menu drawer;
  - controls rearranged into thumb-sized full-width rows;
  - text boxes large enough that iPhones don't zoom in.
- **Small touches:** cover images throughout, with a placeholder when a title has none;
  toast messages confirm every action and explain failures.

## 14. Running it

- **Stack:** Next.js 14 (App Router, server actions), Prisma 5 on PostgreSQL 16,
  Tailwind with shadcn/ui, and @dnd-kit for dragging.
- **Deploy:** Docker Compose, built natively for arm64 so it runs on a Raspberry Pi,
  behind a Cloudflare tunnel. A deploy is `git pull` plus a rebuild on the Pi.
- **Database changes:** each container start applies the schema and then runs the
  one-off SQL scripts in `prisma/sql/` (such as the switch to decimal scores). The scripts
  are safe to run again and again, and the data lives in a named Docker volume.
- **Tests:** `npm test` runs 34 Vitest tests, covering scores, tier rules, the queue and
  search-dialog behaviour.
